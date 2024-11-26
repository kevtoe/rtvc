interface SpeechToSpeechConfig {
    voiceId: string;
    apiKey: string;
    modelId?: string;
    voiceSettings?: {
      stability: number;
      similarity_boost: number;
      style?: number;
      use_speaker_boost?: boolean;
    };
    removeBackgroundNoise?: boolean;
  }
  
  class ElevenLabsSTS {
    private readonly API_URL = 'https://api.elevenlabs.io/v1/speech-to-speech';
    private config: SpeechToSpeechConfig;
  
    constructor(config: SpeechToSpeechConfig) {
      this.config = {
        ...config,
        modelId: config.modelId || 'eleven_english_sts_v2'
      };
    }
  
    async convertSpeech(audioBlob: Blob): Promise<ArrayBuffer> {
      const formData = new FormData();
      formData.append('audio', audioBlob);
      formData.append('model_id', this.config.modelId!);
      
      if (this.config.voiceSettings) {
        formData.append('voice_settings', JSON.stringify(this.config.voiceSettings));
      }
  
      if (this.config.removeBackgroundNoise !== undefined) {
        formData.append('remove_background_noise', String(this.config.removeBackgroundNoise));
      }
  
      const response = await fetch(`${this.API_URL}/${this.config.voiceId}`, {
        method: 'POST',
        headers: {
          'xi-api-key': this.config.apiKey,
        },
        body: formData,
      });
  
      if (!response.ok) {
        throw new Error(`ElevenLabs API error: ${response.statusText}`);
      }
  
      return await response.arrayBuffer();
    }
  }
  
  // Real-time audio processing implementation
  class RealTimeVoiceConverter {
    private readonly stsService: ElevenLabsSTS;
    private mediaRecorder: MediaRecorder | null = null;
    private audioChunks: Blob[] = [];
    
    constructor(config: SpeechToSpeechConfig) {
      this.stsService = new ElevenLabsSTS(config);
    }
  
    async startRecording(): Promise<void> {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      
      this.mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
          // Process in chunks (e.g., every 2 seconds)
          if (this.audioChunks.length >= 2) {
            await this.processAudioChunk();
          }
        }
      };
  
      this.mediaRecorder.start(1000); // Collect data every second
    }
  
    private async processAudioChunk(): Promise<void> {
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
      this.audioChunks = []; // Reset chunks
  
      try {
        const convertedAudio = await this.stsService.convertSpeech(audioBlob);
        await this.playAudio(convertedAudio);
      } catch (error) {
        console.error('Voice conversion error:', error);
      }
    }
  
    private async playAudio(arrayBuffer: ArrayBuffer): Promise<void> {
      const audioContext = new AudioContext();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.start();
    }
  
    stopRecording(): void {
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
        this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
      }
    }
  }
  
  export { ElevenLabsSTS, RealTimeVoiceConverter, type SpeechToSpeechConfig };