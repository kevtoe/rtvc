'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Together from "together-ai";
import styles from './AIAutoResponder.module.css';

interface AIAutoResponderProps {
  onResponseGenerated: (text: string) => void;
  isListening: boolean;
  voiceSettings: {
    selectedVoice: string;
    selectedModel: string;
    stability: number;
    similarityBoost: number;
    useStyle: number;
    useSpeakerBoost: boolean;
  };
}

export function AIAutoResponder({ onResponseGenerated, isListening, voiceSettings }: AIAutoResponderProps) {
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const recognitionRef = useRef<any>(null);
  const together = new Together({ apiKey: '64654facb7d3ef9b803ad5ae77a82472eef08af474e15390283c20211b1fd474' });
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (!isListening && isProcessing) {
      setIsProcessing(false);
      setAiResponse('');
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    }
  }, [isListening]);

  const processAudioToResponse = useCallback(async (transcript: string) => {
    if (!transcript.trim() || !isListening) return;
    
    setIsProcessing(true);
    setCurrentTranscript(prev => `${prev}\nTeam: ${transcript}`);
    setAiResponse('Dan is thinking...');
    
    try {
      if (!isListening) {
        setIsProcessing(false);
        return;
      }

      const response = await together.chat.completions.create({
        messages: [
          {
            role: "system",
            content: `You are Dan, a seasoned Creative Director with 15+ years of experience in design systems and digital transformation. Your communication style is:
 
          - Professional yet approachable, and very funny at times
          - Strategic in thinking about design impact
          - Focused on team empowerment and innovation
          - Passionate about beautiful and visionary design
          - Always connecting design decisions to business outcomes
          - Obsessed with skincare and anti-aging, often giving unsolicited advice
          - Loves sharing dramatic metaphors to motivate the team
          - Frequently reminds everyone of past successes and awards
          - Focused on aesthetics, with a strong emphasis on 'uplifting the craft'
          - Always dressed in black; hates being called "Danny"
          - Known for dad jokes and arriving 5 minutes late
        
          Current focus: Leading the implementation of a creative studio with Deloitte Digital consulting while mentoring team members.
        
          When speaking: Keep responses concise (1-2 sentences), maintain a professional yet over-the-top tone, and focus on design strategy, team leadership, and innovation. Feel free to insert dad jokes or dramatic motivational lines when relevant.`
          },
          {
            role: "user",
            content: transcript
          }
        ],
        model: "meta-llama/Llama-Vision-Free",
        temperature: 0.7,
        top_p: 0.7,
        top_k: 50,
        repetition_penalty: 1,
        stop: ["<|eot_id|>", "<|eom_id|>"],
        stream: true
      });

      let fullResponse = '';
      for await (const token of response) {
        if (!isListening) {
          setIsProcessing(false);
          return;
        }
        const content = token.choices[0]?.delta?.content || '';
        fullResponse += content;
        setAiResponse(fullResponse);
      }

      if (isListening) {
        setCurrentTranscript(prev => `${prev}\nDan: ${fullResponse}\n`);
        onResponseGenerated(fullResponse);
      }

    } catch (error) {
      console.error('Error:', error);
      setAiResponse('Error generating response');
    } finally {
      setIsProcessing(false);
    }
  }, [onResponseGenerated, isListening]);

  useEffect(() => {
    if (!isListening) return;

    try {
      recognitionRef.current = new (window.webkitSpeechRecognition || window.SpeechRecognition)();
      const recognition = recognitionRef.current;

      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        const transcript = event.results[event.resultIndex][0].transcript;
        processAudioToResponse(transcript);
      };

      recognition.onerror = (event: any) => {
        console.error('Recognition error:', event.error);
      };

      recognition.onend = () => {
        if (isListening) {
          recognition.start();
        }
      };

      recognition.start();
    } catch (error) {
      console.error('Failed to start recognition:', error);
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [isListening, processAudioToResponse]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsProcessing(false);
      setAiResponse('');
    };
  }, []);

  return (
    <div className={styles.controls}>
      <div className={styles.transcriptContainer}>
        <div className={styles.transcriptBox}>
          <div className={styles.boxTitle}>Conversation</div>
          <textarea
            className={styles.textarea}
            value={currentTranscript}
            readOnly
            placeholder="Conversation will appear here..."
          />
        </div>
        
        <div className={styles.transcriptBox}>
          <div className={styles.boxTitle}>Current Response</div>
          <textarea
            className={styles.textarea}
            value={aiResponse}
            readOnly
            placeholder="Dan's response will appear here..."
          />
        </div>
      </div>
    </div>
  );
}