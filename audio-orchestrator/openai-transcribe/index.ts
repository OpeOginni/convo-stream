import WebSocket from 'ws';
import dotenv from 'dotenv';

dotenv.config();

// Type declarations for WebSocket
declare module 'ws' {
  interface WebSocket {
    on(event: 'open', listener: () => void): this;
    on(event: 'message', listener: (data: Buffer | ArrayBuffer | Buffer[]) => void): this;
    on(event: 'error', listener: (error: Error) => void): this;
    on(event: 'close', listener: () => void): this;
    send(data: string): void;
    close(): void;
  }
}

// OpenAI Configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_REALTIME_URL = 'wss://api.openai.com/v1/realtime?intent=transcription';

if (!OPENAI_API_KEY) {
  console.warn('⚠️  OpenAI API key not found. Transcription will be disabled.');
  console.log('💡 Set OPENAI_API_KEY in .env file');
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
  onConnected?: () => void;
  onDisconnected?: () => void;
};

// Global state for active transcription sessions
const activeTranscriptions = new Map<string, {
  ws: WebSocket;
  isActive: boolean;
  callbacks: TranscriptionCallbacks;
  audioBuffer: Buffer[];
  sessionConfig: any;
  itemIdCounter: number;
  pendingItems: Map<string, any>;
  languageCode: string;
}>();

/**
 * Direct WebSocket Authentication with OpenAI API Key
 *
 * This implementation uses direct API key authentication through the WebSocket connection,
 * which is simpler than using ephemeral tokens and provides the same security benefits.
 *
 * Authentication method: Bearer token in WebSocket headers
 * URL: wss://api.openai.com/v1/realtime?intent=transcription
 */

/**
 * Start transcription for a session
 */
export const startTranscription = async (
  sessionId: string,
  userId: string,
  languageCode: string = 'en',
  sampleRate: number = 16000,
  callbacks: TranscriptionCallbacks = {}
): Promise<boolean> => {
  if (!OPENAI_API_KEY) {
    console.log(`🎤 Skipping transcription for ${userId} - OpenAI API key not configured`);
    return false;
  }

  try {
    console.log(`🚀 Starting OpenAI transcription session for ${userId} (${sessionId})`);

    // Create WebSocket connection with direct API key authentication
    const ws = new WebSocket(OPENAI_REALTIME_URL, [], {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'OpenAI-Beta': 'realtime=v1'
      }
    });

    // Initialize session state
    activeTranscriptions.set(sessionId, {
      ws,
      isActive: false, // Will be set to true when connected
      callbacks,
      audioBuffer: [],
      sessionConfig: null,
      itemIdCounter: 0,
      pendingItems: new Map(),
      languageCode
    });

    // Set up WebSocket event handlers
    ws.on('open', () => {
      console.log(`🔗 OpenAI WebSocket connected for ${sessionId}`);
      onWebSocketOpen(sessionId);
    });

    ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
      onWebSocketMessage(sessionId, data);
    });

    ws.on('error', (error: Error) => {
      console.error(`❌ OpenAI WebSocket error for ${sessionId}:`, error);
      callbacks.onError?.(error);
    });

    ws.on('close', () => {
      console.log(`🔌 OpenAI WebSocket closed for ${sessionId}`);
      onWebSocketClose(sessionId);
    });

    return true;

  } catch (error) {
    console.error(`❌ Failed to start OpenAI transcription for ${sessionId}:`, error);
    callbacks.onError?.(error);
    return false;
  }
};

/**
 * Handle WebSocket open event
 */
const onWebSocketOpen = (sessionId: string) => {
  const session = activeTranscriptions.get(sessionId);
  if (!session) return;

  console.log(`🎯 Configuring OpenAI transcription session for ${sessionId}`);

  // Configure the transcription session according to docs
  const configMessage = {
    type: "transcription_session.update",
    input_audio_format: "pcm16",
    input_audio_transcription: {
      model: "gpt-4o-transcribe",
      prompt: "",
      language: session.languageCode
    },
    turn_detection: {
      type: "server_vad",
      threshold: 0.5,
      prefix_padding_ms: 300,
      silence_duration_ms: 500
    },
    input_audio_noise_reduction: {
      type: "near_field"
    },
    include: [
      "item.input_audio_transcription.logprobs"
    ]
  }

  session.ws.send(JSON.stringify(configMessage));
  session.isActive = true;
  session.callbacks.onConnected?.();

  console.log(`✅ OpenAI transcription session configured for ${sessionId}`);
};

/**
 * Handle WebSocket message event
 */
const onWebSocketMessage = (sessionId: string, data: Buffer | ArrayBuffer | Buffer[]) => {
  const session = activeTranscriptions.get(sessionId);
  if (!session || !session.isActive) return;

  try {
    const message = JSON.parse(data.toString());

    switch (message.type) {
      case 'transcription_session.created':
        console.log(`📝 OpenAI transcription session created for ${sessionId}`);
        session.sessionConfig = message.transcription_session;
        break;

      case 'input_audio_buffer.committed':
        // Handle committed audio buffer - this indicates speech detection
        console.log(`🎙️ Audio buffer committed for ${sessionId}, item: ${message.item_id}`);
        if (message.item_id) {
          session.pendingItems.set(message.item_id, {
            committed: true,
            previousItemId: message.previous_item_id
          });
        }
        break;

      case 'input_audio_transcription.completed':
        // Handle completed transcription according to docs
        handleTranscriptionResult(sessionId, message);
        break;

      case 'error':
        console.error(`❌ OpenAI error for ${sessionId}:`, message.error);
        session.callbacks.onError?.(message.error);
        break;

      default:
        // Log other message types for debugging
        console.log(`📨 OpenAI message (${message.type}) for ${sessionId}`);
    }
  } catch (error) {
    console.error(`❌ Error parsing OpenAI message for ${sessionId}:`, error);
  }
};

/**
 * Handle transcription result from OpenAI according to documentation
 */
const handleTranscriptionResult = (sessionId: string, message: any) => {
  const session = activeTranscriptions.get(sessionId);
  if (!session) return;

  // Extract transcription data according to docs format
  const transcript = message.transcript || '';
  const confidence = message.confidence || 0.8;
  const isPartial = false; // input_audio_transcription.completed indicates final result

  console.log(`🎙️ OPENAI TRANSCRIPT: "${transcript}" [${isPartial ? 'partial' : 'final'}] (confidence: ${confidence})`);

  const result: TranscriptionResult = {
    transcript,
    confidence,
    isPartial,
    timestamp: Date.now()
  };

  session.callbacks.onResult?.(result);
};

/**
 * Handle WebSocket close event
 */
const onWebSocketClose = (sessionId: string) => {
  const session = activeTranscriptions.get(sessionId);
  if (!session) return;

  session.isActive = false;
  session.callbacks.onDisconnected?.();
  session.callbacks.onEnd?.();
  activeTranscriptions.delete(sessionId);

  console.log(`🧹 Cleaned up OpenAI transcription session ${sessionId}`);
};

/**
 * Add audio chunk to transcription session
 */
export const addAudioChunk = (sessionId: string, audioData: Int16Array | Buffer): void => {
  const session = activeTranscriptions.get(sessionId);
  if (!session || !session.isActive) return;

  // Convert audio data to base64
  let buffer: Buffer;
  if (audioData instanceof Buffer) {
    buffer = audioData;
  } else {
    buffer = Buffer.from(audioData.buffer, audioData.byteOffset, audioData.byteLength);
  }

  // Send audio data to OpenAI
  const audioMessage = {
    type: 'input_audio_buffer.append',
    audio: buffer.toString('base64')
  };

  try {
    session.ws.send(JSON.stringify(audioMessage));
  } catch (error) {
    console.error(`❌ Error sending audio chunk to OpenAI for ${sessionId}:`, error);
    session.callbacks.onError?.(error);
  }
};

/**
 * Stop transcription for a session
 */
export const stopTranscription = (sessionId: string): void => {
  const session = activeTranscriptions.get(sessionId);
  if (!session) return;

  console.log(`🛑 Stopping OpenAI transcription for ${sessionId}`);

  try {
    session.isActive = false;
    session.ws.close();
  } catch (error) {
    console.error(`❌ Error closing OpenAI WebSocket for ${sessionId}:`, error);
  }

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