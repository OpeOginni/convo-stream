import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
  LanguageCode,
} from "@aws-sdk/client-transcribe-streaming";

// AWS Configuration - Bun automatically loads .env files
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;

if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
  console.warn('⚠️  AWS credentials not found. Transcription will be disabled.');
  console.log('💡 Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env file');
}

export type TranscriptionResult = {
  transcript: string;
  confidence: number;
  isPartial: boolean;
  timestamp: number;
};

export type TranscriptionCallbacks = {
  onResult?: (result: TranscriptionResult) => void;
  onError?: (error: any) => void;
  onEnd?: () => void;
};

// Global state for active transcription sessions
const activeTranscriptions = new Map<string, {
  client: TranscribeStreamingClient;
  audioChunks: Buffer[];
  isActive: boolean;
  callbacks: TranscriptionCallbacks;
  timeout?: Timer;
}>();

/**
 * Create a new Transcribe client
 */
const createTranscribeClient = (): TranscribeStreamingClient | null => {
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    return null;
  }

  return new TranscribeStreamingClient({
    region: AWS_REGION,
    credentials: {
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
    }
  });
};

/**
 * Start transcription for a session
 */
export const startTranscription = async (
  sessionId: string,
  userId: string,
  languageCode: LanguageCode = 'en-US',
  sampleRate: number = 16000,
  callbacks: TranscriptionCallbacks = {}
): Promise<boolean> => {
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    console.log(`🎤 Skipping transcription for ${userId} - AWS credentials not configured`);
    return false;
  }

  try {
    const client = createTranscribeClient();
    if (!client) return false;

    console.log(`🚀 Starting AWS Transcribe session for ${userId} (${sessionId})`);

    // Initialize session state
    activeTranscriptions.set(sessionId, {
      client,
      audioChunks: [],
      isActive: true,
      callbacks
    });

    // Create audio stream generator
    async function* audioStreamGenerator() {
      const session = activeTranscriptions.get(sessionId);
      if (!session) return;

      while (session.isActive) {
        if (session.audioChunks.length > 0) {
          const chunk = session.audioChunks.shift();
          if (chunk) {
            yield { AudioEvent: { AudioChunk: chunk } };
          }
        } else {
          // Wait for more audio data
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }

    const command = new StartStreamTranscriptionCommand({
      LanguageCode: languageCode,
      MediaEncoding: 'pcm',
      MediaSampleRateHertz: sampleRate,
      AudioStream: audioStreamGenerator()
    });

    console.log(`🔧 Transcription config: ${languageCode}, ${sampleRate}Hz`);

    const response = await client.send(command);

    // Process transcription results
    processTranscriptionResults(sessionId, response);

    return true;

  } catch (error) {
    console.error(`❌ Failed to start transcription for ${sessionId}:`, error);
    callbacks.onError?.(error);
    return false;
  }
};

/**
 * Add audio chunk to transcription session
 */
export const addAudioChunk = (sessionId: string, audioData: Int16Array | Buffer): void => {
  const session = activeTranscriptions.get(sessionId);
  if (!session || !session.isActive) return;

  // Convert Int16Array to Buffer if needed
  const buffer = audioData instanceof Buffer ? audioData : Buffer.from(audioData.buffer);

  session.audioChunks.push(buffer);
};

/**
 * Stop transcription for a session
 */
export const stopTranscription = (sessionId: string): void => {
  const session = activeTranscriptions.get(sessionId);
  if (!session) return;

  console.log(`🛑 Stopping transcription for ${sessionId}`);
  session.isActive = false;
  session.callbacks.onEnd?.();
  activeTranscriptions.delete(sessionId);
};

/**
 * Check if transcription is active for a session
 */
export const isTranscriptionActive = (sessionId: string): boolean => {
  const session = activeTranscriptions.get(sessionId);
  return session?.isActive ?? false;
};

/**
 * Get count of active transcription sessions
 */
export const getActiveTranscriptionCount = (): number => {
  return activeTranscriptions.size;
};

/**
 * Process transcription results from AWS
 */
const processTranscriptionResults = async (sessionId: string, response: any): Promise<void> => {
  try {
    for await (const event of response.TranscriptResultStream) {
      const session = activeTranscriptions.get(sessionId);
      if (!session || !session.isActive) break;

      if (event.TranscriptEvent?.Transcript?.Results) {
        for (const result of event.TranscriptEvent.Transcript.Results) {
          if (result.Alternatives?.[0]) {
            const alternative = result.Alternatives[0];
            const transcriptionResult: TranscriptionResult = {
              transcript: alternative.Transcript || '',
              confidence: alternative.Confidence || 0,
              isPartial: result.IsPartial || false,
              timestamp: Date.now()
            };

            session.callbacks.onResult?.(transcriptionResult);
          }
        }
      }
    }
  } catch (error) {
    console.error(`❌ Error processing transcription results for ${sessionId}:`, error);
    const session = activeTranscriptions.get(sessionId);
    session?.callbacks.onError?.(error);
  }
};

