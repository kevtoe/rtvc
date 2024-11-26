'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { RealTimeVoiceConverter, SpeechToSpeechConfig } from '../services/elevenlabs';
import { FormGroup, Button, InputGroup } from '@blueprintjs/core';
import { IVoice, ISubscription } from '@/types/elevenlabs';
import { getVoices, getSubscriptionInfo } from '@/util/elevenlabs';
import styles from './VoiceConverter.module.css';
import debounce from 'lodash/debounce';

declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
    webkitAudioContext: typeof AudioContext;
  }
}

// Add these types
type Language = {
  language_id: string;
  name: string;
};

type Model = {
  model_id: string;
  name: string;
  description: string;
  languages: Language[];
  can_do_text_to_speech: boolean;
};

export function VoiceConverter() {
  const [apiKey, setApiKey] = useState('sk_f0f05368a170588853ebb08ae615f63ceee6fca9c1f87ba0');
  const DAN_VOICE_ID = 'HBZGDFaUUwaYQpqBr13S';
  const [selectedVoice, setSelectedVoice] = useState(DAN_VOICE_ID);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const [voices, setVoices] = useState<Array<{ voice_id: string; name: string }>>([]);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const processingRef = useRef(false);
  const [pauseThreshold, setPauseThreshold] = useState(500);
  const [debounceDelay, setDebounceDelay] = useState(50);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.5);
  const [maxAlternatives, setMaxAlternatives] = useState(1);
  const [bufferSize, setBufferSize] = useState(2048);
  const [manualText, setManualText] = useState('');
  const [selectedModel, setSelectedModel] = useState<string>("eleven_turbo_v2");
  const [stability, setStability] = useState(0.5);
  const [similarityBoost, setSimilarityBoost] = useState(0.75);
  const [useStyle, setUseStyle] = useState(0);
  const [useSpeakerBoost, setUseSpeakerBoost] = useState(true);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttemptsRef = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 5;
  const [isProcessing, setIsProcessing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const models: Model[] = [
    {
      model_id: "eleven_multilingual_v2",
      name: "Eleven Multilingual v2",
      description: "Our most life-like, emotionally rich mode in 29 languages. Best for voice overs, audiobooks, post-production, or any other content creation needs.",
      languages: [/* ... language list ... */],
      can_do_text_to_speech: true
    },
    {
      model_id: "eleven_turbo_v2_5",
      name: "Eleven Turbo v2.5",
      description: "Our high quality, low latency model in 32 languages. Best for developer use cases where speed matters and you need non-English languages.",
      languages: [/* ... language list ... */],
      can_do_text_to_speech: true
    },
    {
      model_id: "eleven_turbo_v2",
      name: "Eleven Turbo v2",
      description: "Our English-only, low latency model. Best for developer use cases where speed matters and you only need English.",
      languages: [{ language_id: "en", name: "English" }],
      can_do_text_to_speech: true
    },
    {
      model_id: "eleven_monolingual_v1",
      name: "Eleven English v1",
      description: "Our first ever text to speech model. Now outclassed by Multilingual v2 (for content creation) and Turbo v2.5 (for low latency use cases).",
      languages: [{ language_id: "en", name: "English" }],
      can_do_text_to_speech: true
    }
  ].filter(model => model.can_do_text_to_speech);

  const toggleDictation = useCallback(() => {
    // Simulate Option(Alt)+Command+D keyboard shortcut
    const event = new KeyboardEvent('keydown', {
      key: 'd',
      code: 'KeyD',
      altKey: true,
      metaKey: true, // Command key on Mac
      bubbles: true
    });
    document.dispatchEvent(event);
  }, []);

  const handleManualSubmit = useCallback(async () => {
    // Get text directly from the textarea ref
    const currentText = textareaRef.current?.value.trim();
    
    if (!currentText || !selectedVoice || !apiKey || isProcessing) {
      return;
    }

    // Toggle dictation off before processing
    toggleDictation();
    
    // Small delay to ensure dictation is turned off
    await new Promise(resolve => setTimeout(resolve, 100));

    setIsProcessing(true);
    
    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoice}/stream`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': apiKey
          },
          body: JSON.stringify({
            text: currentText,
            model_id: selectedModel,
            voice_settings: {
              stability,
              similarity_boost: similarityBoost,
              style: useStyle,
              use_speaker_boost: useSpeakerBoost
            },
            optimize_streaming_latency: 4
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Conversion failed: ${errorData.message || response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.start(0);
      
      source.onended = () => {
        audioContext.close();
        setIsProcessing(false);
        // Optionally toggle dictation back on after processing
        toggleDictation();
      };

      // Clear the textarea after successful processing
      if (textareaRef.current) {
        textareaRef.current.value = '';
        setManualText('');
      }

    } catch (error) {
      console.error('Error converting text to speech:', error);
      setIsProcessing(false);
      // Toggle dictation back on in case of error
      toggleDictation();
    }
  }, [selectedVoice, apiKey, selectedModel, stability, similarityBoost, useStyle, useSpeakerBoost, toggleDictation]);

  // Add keyboard shortcut listener for manual toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Option+Command+D
      if (e.altKey && e.metaKey && e.key.toLowerCase() === 'd') {
        // You might want to update some state here to track dictation status
        console.log('Dictation toggled via keyboard shortcut');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const restartRecognition = useCallback(() => {
    if (!isListening || !recognitionRef.current) return;

    try {
      recognitionRef.current.stop();
      setTimeout(() => {
        if (isListening) {
          recognitionRef.current?.start();
          reconnectAttemptsRef.current = 0; // Reset attempts on successful restart
        }
      }, 100);
    } catch (error) {
      console.error('Failed to restart recognition:', error);
    }
  }, [isListening]);

  const stopConversion = useCallback(() => {
    setIsListening(false);
    setIsRecording(false);
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    processingRef.current = false;
    setTranscript('');
    reconnectAttemptsRef.current = 0;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
  }, []);

  const handleRecognitionError = useCallback((error: any) => {
    console.error('Recognition error:', error);
    
    if (isListening && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttemptsRef.current += 1;
      console.log(`Attempting to reconnect (${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`);
      
      // Clear any existing timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      // Attempt to reconnect after a delay
      reconnectTimeoutRef.current = setTimeout(() => {
        restartRecognition();
      }, 1000);
    } else if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      console.error('Max reconnection attempts reached');
      stopConversion();
    }
  }, [isListening, stopConversion, restartRecognition]);

  useEffect(() => {
    if (apiKey) {
      getVoices(apiKey)
        .then((voices) => {
          setVoices(voices);
          if (!selectedVoice) {
            setSelectedVoice(DAN_VOICE_ID);
          }
        })
        .catch((error) => {
          console.error('Error fetching voices:', error);
        });
    }
  }, [apiKey]);

  const processAudioChunk = async (text: string) => {
    if (!text.trim() || processingRef.current) return;
    
    processingRef.current = true;
    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoice}/stream`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': apiKey
          },
          body: JSON.stringify({
            text: text,
            model_id: selectedModel,
            voice_settings: {
              stability,
              similarity_boost: similarityBoost,
              style: useStyle,
              use_speaker_boost: useSpeakerBoost
            },
            optimize_streaming_latency: 4
          })
        }
      );

      if (!response.ok) throw new Error('Conversion failed');

      const arrayBuffer = await response.arrayBuffer();
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.start(0);
      source.onended = () => {
        audioContext.close();
        processingRef.current = false;
        setTranscript(''); // Clear transcript after playing
      };

    } catch (error) {
      console.error('Error converting text to speech:', error);
      processingRef.current = false;
    }
  };

  const startConversion = async () => {
    if (!selectedVoice || !apiKey) return;

    try {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }

      recognitionRef.current = new (window.webkitSpeechRecognition || window.SpeechRecognition)();
      const recognition = recognitionRef.current;
      
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.lang = 'en-US';

      // Add periodic check for recognition state
      const checkRecognitionState = setInterval(() => {
        if (isListening && !processingRef.current) {
          try {
            // Test if recognition is still active
            if (recognition.state === 'ended') {
              console.log('Recognition ended unexpectedly, restarting...');
              restartRecognition();
            }
          } catch (error) {
            console.error('Recognition state check failed:', error);
            handleRecognitionError(error);
          }
        }
      }, 5000); // Check every 5 seconds

      recognition.onresult = (event: any) => {
        const current = event.results[event.resultIndex][0].transcript;
        setTranscript(current);

        if (event.results[event.resultIndex].isFinal) {
          processAudioChunk(current);
        }
      };

      recognition.onend = () => {
        if (isListening) {
          console.log('Recognition ended, attempting restart...');
          restartRecognition();
        }
      };

      recognition.onerror = (event: any) => {
        handleRecognitionError(event);
      };

      await recognition.start();
      setIsListening(true);
      setIsRecording(true);
      reconnectAttemptsRef.current = 0; // Reset reconnection attempts

      // Cleanup function
      return () => {
        clearInterval(checkRecognitionState);
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
      };

    } catch (error) {
      console.error('Failed to start conversion:', error);
      handleRecognitionError(error);
    }
  };

  useEffect(() => {
    return () => {
      stopConversion();
    };
  }, [stopConversion]);

  return (
    <div className={styles.root}>
      <div className={styles.content}>
        <FormGroup label="API Key">
          <input
            type="text"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className={styles.input}
            placeholder="Enter your API key"
          />
        </FormGroup>

        <FormGroup label="Voice">
          <select
            value={selectedVoice}
            onChange={(e) => setSelectedVoice(e.target.value)}
            className={styles.select}
            disabled={!apiKey}
          >
            <option value="">Select a voice</option>
            {voices.map((voice) => (
              <option key={voice.voice_id} value={voice.voice_id}>
                {voice.name}
              </option>
            ))}
          </select>
        </FormGroup>

        <FormGroup label="Select Model">
          <div className={styles.modelSelection}>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className={styles.select}
              disabled={!apiKey}
            >
              {models.map((model) => (
                <option key={model.model_id} value={model.model_id}>
                  {model.name}
                </option>
              ))}
            </select>
            <div className={styles.modelDescription}>
              {models.find(m => m.model_id === selectedModel)?.description}
            </div>
            <div className={styles.languageSupport}>
              Supported Languages: {models.find(m => m.model_id === selectedModel)?.languages.length}
            </div>
          </div>
        </FormGroup>

        <button
          onClick={isRecording ? stopConversion : startConversion}
          disabled={!apiKey || !selectedVoice}
          className={styles.button}
        >
          {isRecording ? 'Stop' : 'Start'}
        </button>

        <FormGroup label={`Transcript (${transcript.length}/5000)`}>
          <textarea
            value={transcript}
            readOnly
            className={styles.textarea}
            placeholder="Your speech will appear here..."
          />
        </FormGroup>

        <FormGroup label="Manual Text Input">
          <div className={styles.manualInputContainer}>
            <textarea
              ref={textareaRef}
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              className={styles.textarea}
              placeholder="Type or use dictation here... (⌥⌘D to toggle dictation)"
              disabled={!apiKey || !selectedVoice || isProcessing}
            />
            <div className={styles.manualControls}>
              <button
                onClick={handleManualSubmit}
                disabled={!selectedVoice || !apiKey || isProcessing}
                className={styles.sendButton}
              >
                {isProcessing ? 'Converting...' : 'Send'}
              </button>
            </div>
            {isProcessing && (
              <div className={styles.processingIndicator}>
                Converting text to speech...
              </div>
            )}
          </div>
        </FormGroup>

        <div className={styles.controls}>
          <FormGroup label="Response Speed (ms)">
            <div className={styles.sliderContainer}>
              <input
                type="range"
                min="50"
                max="1000"
                value={debounceDelay}
                onChange={(e) => setDebounceDelay(Number(e.target.value))}
                className={styles.slider}
              />
              <span className={styles.sliderValue}>{debounceDelay}ms</span>
            </div>
          </FormGroup>

          <FormGroup label="Pause Detection (ms)">
            <div className={styles.sliderContainer}>
              <input
                type="range"
                min="500"
                max="5000"
                step="100"
                value={pauseThreshold}
                onChange={(e) => setPauseThreshold(Number(e.target.value))}
                className={styles.slider}
              />
              <span className={styles.sliderValue}>{pauseThreshold}ms</span>
            </div>
          </FormGroup>

          <FormGroup label="Voice Detection Speed">
            <div className={styles.sliderContainer}>
              <input
                type="range"
                min="0.1"
                max="0.9"
                step="0.1"
                value={confidenceThreshold}
                onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
                className={styles.slider}
              />
              <span className={styles.sliderValue}>
                {(confidenceThreshold * 100).toFixed(0)}%
              </span>
            </div>
            <div className={styles.hint}>
              Lower = Faster but less accurate, Higher = Slower but more accurate
            </div>
          </FormGroup>

          <FormGroup label="Recognition Alternatives">
            <div className={styles.sliderContainer}>
              <input
                type="range"
                min="1"
                max="5"
                step="1"
                value={maxAlternatives}
                onChange={(e) => setMaxAlternatives(Number(e.target.value))}
                className={styles.slider}
              />
              <span className={styles.sliderValue}>{maxAlternatives}</span>
            </div>
            <div className={styles.hint}>
              More alternatives may improve accuracy but increase latency
            </div>
          </FormGroup>

          <FormGroup label="Buffer Size">
            <div className={styles.sliderContainer}>
              <input
                type="range"
                min="1024"
                max="8192"
                step="1024"
                value={bufferSize}
                onChange={(e) => setBufferSize(Number(e.target.value))}
                className={styles.slider}
              />
              <span className={styles.sliderValue}>{bufferSize}</span>
            </div>
            <div className={styles.hint}>
              Smaller buffer = faster but may be choppy
            </div>
          </FormGroup>
        </div>

        <div className={styles.voiceSettings}>
          <FormGroup label="Voice Settings">
            <div className={styles.settingSlider}>
              <label>Stability (Lower = More Variable)</label>
              <div className={styles.sliderContainer}>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={stability}
                  onChange={(e) => setStability(Number(e.target.value))}
                  className={styles.slider}
                />
                <span className={styles.sliderValue}>
                  {(stability * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            <div className={styles.settingSlider}>
              <label>Clarity + Similarity Enhancement</label>
              <div className={styles.sliderContainer}>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={similarityBoost}
                  onChange={(e) => setSimilarityBoost(Number(e.target.value))}
                  className={styles.slider}
                />
                <span className={styles.sliderValue}>
                  {(similarityBoost * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            <div className={styles.settingSlider}>
              <label>Style (0-1)</label>
              <div className={styles.sliderContainer}>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={useStyle}
                  onChange={(e) => setUseStyle(Number(e.target.value))}
                  className={styles.slider}
                />
                <span className={styles.sliderValue}>{useStyle}</span>
              </div>
            </div>

            <div className={styles.settingCheckbox}>
              <label>
                <input
                  type="checkbox"
                  checked={useSpeakerBoost}
                  onChange={(e) => setUseSpeakerBoost(e.target.checked)}
                />
                Enable Speaker Boost
              </label>
            </div>
          </FormGroup>
        </div>
      </div>
    </div>
  );
}