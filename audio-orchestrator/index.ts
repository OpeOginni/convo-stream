import {
  startTranscription,
  stopTranscription,
  addAudioChunk,
  isTranscriptionActive,
  getActiveTranscriptionCount,
  type TranscriptionResult,
} from './aws-transcribe/index';

// Import AI response generation
import {
  generateResponseWithOpenRouter,
  getConversationHistory,
  clearConversationHistory,
  getConversationStats
} from './ai/openrouter';

// Import TTS generation
import { generateTTS, isTTSAvailable } from './ai/eleven-lab';

// Import HTML file for serving
import indexHtml from './client-example.html';

// Import Express and Socket.IO
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { LanguageCode } from '@aws-sdk/client-transcribe-streaming';

console.log('🔧 Loading AWS Transcribe module...');

// Check AWS credentials on startup
const hasAWSCredentials = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY;
if (hasAWSCredentials) {
  console.log('✅ AWS credentials found - transcription enabled');
} else {
  console.log('⚠️  No AWS credentials found - transcription disabled');
  console.log('💡 Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY to enable transcription');
}

interface AudioFrame {
  timestamp: number;
  samples: Int16Array;
  sampleRate: number;
  channels: number;
}

interface ProcessingResult {
  type: 'analysis' | 'transcription' | 'enhancement';
  data: any;
  timestamp: number;
}

interface BufferedTranscript {
  transcript: string;
  confidence: number;
  timestamp: number;
}

interface AudioProcessingSession {
  id: string;
  userId: string;
  socket: Socket;
  isProcessing: boolean;
  startTime: number;
  languageCode?: LanguageCode;
  transcriptBuffer: BufferedTranscript[];
  aiResponseTimer?: Timer;
  isTTSPlaying: boolean;
  currentTTSController?: AbortController;
  lastTTSStartTime?: number;
  currentAIController?: AbortController;
  isAIGenerating: boolean;
  lastAIStartTime?: number;
}

// Global state
const sessions = new Map<string, AudioProcessingSession>();

// Voice activity detection state
interface VoiceActivityState {
  isActive: boolean;
  lastVoiceTime: number;
  lastTranscriptionStart: number;
  silenceTimer?: Timer;
  transcriptionStarted: boolean;
  consecutiveVoiceFrames: number;
  consecutiveSilenceFrames: number;
}

const voiceActivityStates = new Map<string, VoiceActivityState>();

/**
 * Convert a ReadableStream to Uint8Array buffer
 */
const streamToBuffer = async (stream: ReadableStream<Uint8Array>): Promise<Uint8Array> => {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  // Calculate total length
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);

  // Copy all chunks into the result buffer
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
};

/**
 * Process buffered transcripts and generate AI response
 */
const processBufferedTranscripts = async (sessionId: string) => {
  const session = sessions.get(sessionId);
  if (!session) {
    console.log(`❌ Session ${sessionId} not found for buffered transcript processing`);
    return;
  }

  if (session.transcriptBuffer.length === 0) {
    console.log(`📭 No buffered transcripts to process for session ${sessionId}`);
    return;
  }

  console.log(`🚀 Starting AI processing for session ${sessionId} with ${session.transcriptBuffer.length} buffered transcripts`);

  try {
    // Combine all transcripts with spaces, filtering out empty ones
    const combinedTranscript = session.transcriptBuffer
      .map(item => item.transcript.trim())
      .filter(text => text.length > 0)
      .join(' ');

    if (combinedTranscript.length === 0) {
      // Clear buffer if no valid content
      session.transcriptBuffer = [];
      return;
    }

    // Calculate average confidence
    const avgConfidence = session.transcriptBuffer.reduce((sum, item) => sum + item.confidence, 0) / session.transcriptBuffer.length;

    console.log(`🤖 Processing ${session.transcriptBuffer.length} buffered transcripts`);
    console.log(`📝 Combined transcript: "${combinedTranscript}"`);

    // Clear the buffer immediately to prevent double processing
    session.transcriptBuffer = [];

    // Set up AI generation tracking
    const aiController = new AbortController();
    session.currentAIController = aiController;
    session.isAIGenerating = true;
    session.lastAIStartTime = Date.now();

    try {
      // Generate AI response with cancellation support
      const aiResponse = await generateResponseWithOpenRouter(
        session.userId,
        combinedTranscript,
        '', // No extra context for now
        aiController.signal
      );

      // Check if generation was cancelled after completion
      if (aiController.signal.aborted) {
        console.log('🚫 AI response discarded - generation was cancelled');
        return;
      }

      console.log(`💬 AI Response: "${aiResponse}"`);

      // Clean up AI generation state
      session.isAIGenerating = false;
      session.currentAIController = undefined;

      // Send AI response to client
    if (session.socket) {
      session.socket.emit('ai-response', {
        response: aiResponse,
        transcript: combinedTranscript,
        timestamp: Date.now(),
        confidence: avgConfidence,
        bufferedTranscripts: true
      });
    }

    // Generate TTS if available and no interruption detected
    console.log(`🎵 TTS Check: Available=${isTTSAvailable()}, Playing=${session.isTTSPlaying}`);
    if (isTTSAvailable() && !session.isTTSPlaying) {
      try {
        console.log(`🎵 Starting TTS generation for session ${sessionId}`);

        // Create abort controller for interruption handling
        const abortController = new AbortController();
        session.currentTTSController = abortController;
        session.isTTSPlaying = true;
        session.lastTTSStartTime = Date.now();

        // Generate TTS
        const audioStream = await generateTTS(aiResponse);

        // Convert stream to buffer and send to client
        const audioBuffer = await streamToBuffer(audioStream);

        if (!abortController.signal.aborted) {
          // Send TTS audio to client
          if (session.socket) {
            session.socket.emit('tts-audio', {
              audioData: audioBuffer,
              text: aiResponse,
              timestamp: Date.now()
            });
            console.log(`🎵 TTS audio sent to client (${audioBuffer.length} bytes)`);
          }
        } else {
          console.log(`🎵 TTS cancelled due to interruption`);
        }

        // Clean up
        session.isTTSPlaying = false;
        session.currentTTSController = undefined;

      } catch (error) {
        console.error('❌ TTS generation failed:', error);
        session.isTTSPlaying = false;
        session.currentTTSController = undefined;

        // Send TTS error to client
        if (session.socket) {
          session.socket.emit('tts-error', {
            message: 'TTS generation failed',
            timestamp: Date.now()
          });
        }
      }
    } else if (!isTTSAvailable()) {
      console.log(`🎵 TTS skipped - ElevenLabs API key not configured`);
      // Send TTS unavailable message to client
      if (session.socket) {
        session.socket.emit('tts-unavailable', {
          message: 'Text-to-speech is not configured (ELEVENLABS_API_KEY missing)',
          timestamp: Date.now()
        });
      }
    } else {
      console.log(`🎵 TTS skipped - Previous TTS still playing`);
    }

    } catch (error) {
      // Clean up AI generation state on error
      session.isAIGenerating = false;
      session.currentAIController = undefined;

      // Check if it was a cancellation error
      if (error instanceof Error && error.message?.includes('cancelled')) {
        console.log('🚫 AI generation cancelled, not sending error to client');
        return;
      }

      console.error('❌ Error processing buffered transcripts:', error);

      // Clear buffer on error
      session.transcriptBuffer = [];

      // Send error response to client
      if (session.socket) {
        session.socket.emit('ai-response-error', {
          message: 'Failed to generate AI response for buffered transcripts',
          timestamp: Date.now()
        });
      }
    }
  } catch (error) {
    console.error('❌ Error processing buffered transcripts:', error);
    // Clean up any remaining state
    session.isAIGenerating = false;
    session.currentAIController = undefined;
    session.isTTSPlaying = false;
    session.currentTTSController = undefined;
  }
};
/**
 * Analyze audio frame
 */
const analyzeAudio = (frame: AudioFrame) => {
    // Calculate RMS (volume level)
    let sum = 0;
    for (let i = 0; i < frame.samples.length; i++) {
    sum += frame.samples[i]! * frame.samples[i]!;
    }
    const rms = Math.sqrt(sum / frame.samples.length);
    const volume = Math.min(100, Math.max(0, Math.round((rms / 32768) * 100)));

    // Voice Activity Detection (simple energy-based)
  const isVoiceActive = volume > 5;

    // Zero Crossing Rate (indicates speech vs noise)
    let zeroCrossings = 0;
    for (let i = 1; i < frame.samples.length; i++) {
    if ((frame.samples[i]! >= 0) !== (frame.samples[i-1]! >= 0)) {
        zeroCrossings++;
      }
    }
    const zcr = zeroCrossings / frame.samples.length;

    return {
      volume,
      isVoiceActive,
      zeroCrossingRate: zcr,
      sampleCount: frame.samples.length,
      duration: frame.samples.length / frame.sampleRate
    };
};

/**
 * Initialize voice activity detection for a session
 */
const initializeVoiceActivityState = (sessionId: string): VoiceActivityState => {
  const state: VoiceActivityState = {
    isActive: false,
    lastVoiceTime: Date.now(),
    lastTranscriptionStart: 0,
    transcriptionStarted: false,
    consecutiveVoiceFrames: 0,
    consecutiveSilenceFrames: 0
  };
  voiceActivityStates.set(sessionId, state);
  return state;
};

/**
 * Start smart transcription when speech is detected
 */
const startSmartTranscription = async (sessionId: string, userId: string) => {
  const session = sessions.get(sessionId);
  if (!session) return;

  // Check if AWS credentials are available
  if (!hasAWSCredentials) {
    console.log(`🎤 Speech detected but AWS credentials not configured - skipping transcription`);
    return;
  }

  console.log(`🎤 Starting smart transcription for ${userId} (${sessionId})`);

  try {
    console.log(`🚀 Actually starting AWS Transcribe session for ${userId}`);

    await startTranscription(
      sessionId,
      userId,
      session.languageCode || 'en-US',
      16000,
      {
        onResult: async (result: TranscriptionResult) => {
          // Log transcription results
          console.log(`🎙️ TRANSCRIPT: "${result.transcript}" [${result.isPartial ? 'partial' : 'final'}] (${result.confidence.toFixed(2)})`);

          // Send result to client via Socket.IO (always send for real-time display)
          if (session.socket) {
            session.socket.emit('transcription-result', {
              transcript: result.transcript,
              confidence: result.confidence,
              isPartial: result.isPartial,
              timestamp: result.timestamp
            });
          }

          // Handle final transcripts with buffering
          if (!result.isPartial && result.transcript.trim().length > 0) {
            // Check for TTS and AI interruption
            let wasInterrupted = false;

            if (session.isTTSPlaying && session.currentTTSController) {
              console.log(`🚫 User interrupted TTS - cancelling current speech generation`);
              session.currentTTSController.abort();
              session.isTTSPlaying = false;
              session.currentTTSController = undefined;
              wasInterrupted = true;
            }

            if (session.isAIGenerating && session.currentAIController) {
              console.log(`🚫 User interrupted AI generation - cancelling current text generation`);
              session.currentAIController.abort();
              session.isAIGenerating = false;
              session.currentAIController = undefined;
              wasInterrupted = true;
            }

            if (wasInterrupted) {
              // Notify client of interruption
              if (session.socket) {
                session.socket.emit('ai-interrupted', {
                  timestamp: Date.now(),
                  interruptedAt: result.timestamp,
                  interruptedTTS: session.isTTSPlaying === false,
                  interruptedAI: session.isAIGenerating === false
                });
              }
            }

            // Log confidence for debugging
            console.log(`🎯 Final transcript received: "${result.transcript}" (confidence: ${result.confidence.toFixed(2)}) - ACCEPTED`);

            // Accept all transcripts with confidence >= 0
            // Note: AWS Transcribe sometimes returns 0.00 confidence for valid transcripts
            // We rely on the transcript having actual text content as our primary validation
            if (result.confidence >= 0) {
            // Add to buffer
            session.transcriptBuffer.push({
              transcript: result.transcript,
              confidence: result.confidence,
              timestamp: result.timestamp
            });

            console.log(`📦 Buffered transcript (${session.transcriptBuffer.length} total): "${result.transcript}"`);

            // Clear existing timer if any
            if (session.aiResponseTimer) {
              clearTimeout(session.aiResponseTimer);
              session.aiResponseTimer = undefined;
            }

            // Start new 2-second timer (reduced for faster response with TTS)
            session.aiResponseTimer = setTimeout(async () => {
              console.log(`⏰ 2-second timeout reached for session ${sessionId}, processing ${session.transcriptBuffer.length} buffered transcripts`);
              await processBufferedTranscripts(sessionId);
              session.aiResponseTimer = undefined;
            }, 2000); // 2 seconds
            }
          }

          
        },
        onError: (error: any) => {
          console.error('Smart transcription error:', error);
          // Reset transcription state on error
          const vadState = voiceActivityStates.get(sessionId);
          if (vadState) {
            vadState.transcriptionStarted = false;
          }

          // Send error to client
          if (session.socket) {
            session.socket.emit('transcription-error', {
              message: 'Transcription error occurred'
            });
          }
        }
      }
    );

    const vadState = voiceActivityStates.get(sessionId);
    if (vadState) {
      vadState.transcriptionStarted = true;
      console.log(`✅ Transcription successfully started for ${sessionId}`);
    }

  } catch (error) {
    console.error('❌ Failed to start smart transcription:', error);
    // Reset transcription state on error
    const vadState = voiceActivityStates.get(sessionId);
    if (vadState) {
      vadState.transcriptionStarted = false;
    }
  }
};

/**
 * Stop smart transcription after silence timeout
 */
const stopSmartTranscription = async (sessionId: string) => {
  const session = sessions.get(sessionId);
  const vadState = voiceActivityStates.get(sessionId);

  if (!session || !vadState) return;

  console.log(`🔇 Stopping smart transcription for ${session.userId} (${sessionId}) - silence timeout`);
  console.log(`📊 Final stats: ${vadState.consecutiveVoiceFrames} voice frames, ${vadState.consecutiveSilenceFrames} silence frames`);

  try {
    // Process any remaining buffered transcripts before stopping
    if (session.transcriptBuffer.length > 0) {
      console.log(`📤 Processing ${session.transcriptBuffer.length} remaining buffered transcripts before stopping`);
      await processBufferedTranscripts(sessionId);
    }

    // Clear any pending timer
    if (session.aiResponseTimer) {
      clearTimeout(session.aiResponseTimer);
      session.aiResponseTimer = undefined;
    }

    console.log(`🛑 Calling AWS stop transcription for ${sessionId}`);
    stopTranscription(sessionId);
    vadState.transcriptionStarted = false;
    vadState.isActive = false;
    vadState.consecutiveVoiceFrames = 0;
    vadState.consecutiveSilenceFrames = 0;
    console.log(`✅ Transcription stopped for ${sessionId}`);
  } catch (error) {
    console.error('❌ Failed to stop smart transcription:', error);
  }
};

/**
 * Update voice activity detection and manage transcription
 */
const updateVoiceActivity = (sessionId: string, isVoiceActive: boolean) => {
  const vadState = voiceActivityStates.get(sessionId);
  if (!vadState) return;

  const now = Date.now();

  if (isVoiceActive) {
    // Voice detected - increment consecutive voice frames
    vadState.consecutiveVoiceFrames++;
    vadState.consecutiveSilenceFrames = 0; // Reset silence counter
    vadState.lastVoiceTime = now;
    vadState.isActive = true;

    // Clear existing silence timer
    if (vadState.silenceTimer) {
      clearTimeout(vadState.silenceTimer);
      vadState.silenceTimer = undefined;
    }

    // Start transcription only if:
    // 1. Not already started
    // 2. At least 3 consecutive voice frames (debouncing)
    // 3. At least 2 seconds since last transcription start
    if (!vadState.transcriptionStarted &&
        vadState.consecutiveVoiceFrames >= 3 &&
        (now - vadState.lastTranscriptionStart) > 2000) {

      const session = sessions.get(sessionId);
      if (session) {
        console.log(`🎤 Voice detected (${vadState.consecutiveVoiceFrames} frames), starting transcription for ${session.userId}`);
        vadState.lastTranscriptionStart = now;
        startSmartTranscription(sessionId, session.userId);
      }
    }

  } else {
    // No voice detected - increment consecutive silence frames
    vadState.consecutiveSilenceFrames++;
    vadState.consecutiveVoiceFrames = 0; // Reset voice counter

    // Only start silence timer if we have an active transcription and sustained silence
    if (vadState.isActive && vadState.transcriptionStarted && vadState.consecutiveSilenceFrames >= 5) {
      if (!vadState.silenceTimer) {
        console.log(`🔇 Sustained silence detected (${vadState.consecutiveSilenceFrames} frames), starting 4s timeout for ${sessionId}`);
        vadState.silenceTimer = setTimeout(() => {
          console.log(`⏰ Silence timeout reached for ${sessionId}, stopping transcription`);
          stopSmartTranscription(sessionId);
        }, 4000); // 4 seconds of silence
      }
    }
  }
};

/**
 * Process audio frame in real-time with smart voice detection
 */
const processAudioFrame = async (frame: AudioFrame, sessionId?: string): Promise<ProcessingResult[]> => {
    const results: ProcessingResult[] = [];
    
  // Audio analysis
  const analysis = analyzeAudio(frame);
  results.push({
    type: 'analysis',
    data: analysis,
    timestamp: frame.timestamp
  });

  // Log analysis results
  console.log(`📊 Analysis: Volume ${analysis.volume}% | Voice: ${analysis.isVoiceActive ? 'DETECTED' : 'Silent'}`);

  // Update voice activity detection if session ID provided
  if (sessionId) {
    updateVoiceActivity(sessionId, analysis.isVoiceActive);
  }

  return results;
};



/**
 * Handle session creation
 */
const handleStartSession = async (socket: Socket, data: { userId: string, languageCode?: LanguageCode }) => {
  if (!data || !data.userId) {
    socket.emit('error', {
      message: 'Invalid user data'
    });
    return;
  }

  try {
    const sessionId = `session_${data.userId}_${Date.now()}`;
    const session: AudioProcessingSession = {
      id: sessionId,
      userId: data.userId,
      socket,
      isProcessing: false,
      startTime: Date.now(),
      languageCode: data.languageCode || 'en-US',
      transcriptBuffer: [],
      isTTSPlaying: false,
      isAIGenerating: false
    };

    sessions.set(sessionId, session);

    // Initialize voice activity detection for this session
    initializeVoiceActivityState(sessionId);

    socket.emit('session-created', {
      sessionId: session.id,
      message: 'Audio processing session created with smart voice detection'
    });

    console.log(`📝 Created session ${sessionId} for user ${data.userId} with smart VAD`);
  } catch (error) {
    console.error('Error creating session:', error);
    socket.emit('error', {
      message: 'Failed to create audio session'
    });
  }
};

/**
 * Handle start processing
 */
const handleStartProcessing = async (socket: Socket, data: { sessionId: string, enableTranscription?: boolean }) => {
  if (!data || !data.sessionId) {
    socket.emit('error', {
      message: 'Invalid session data'
    });
    return;
  }

  const session = sessions.get(data.sessionId);
  if (!session) {
    socket.emit('error', {
      message: 'Session not found'
    });
    return;
  }

  session.isProcessing = true;

      // Clear any existing buffered transcripts and timer
    if (session.transcriptBuffer.length > 0) {
      console.log(`🗑️ Clearing ${session.transcriptBuffer.length} buffered transcripts on start processing`);
      session.transcriptBuffer = [];
    }
    if (session.aiResponseTimer) {
      clearTimeout(session.aiResponseTimer);
      session.aiResponseTimer = undefined;
    }

    // Cancel any ongoing TTS
    if (session.isTTSPlaying && session.currentTTSController) {
      console.log(`🗑️ Cancelling ongoing TTS on start processing`);
      session.currentTTSController.abort();
      session.isTTSPlaying = false;
      session.currentTTSController = undefined;
    }

    // Cancel any ongoing AI generation
    if (session.isAIGenerating && session.currentAIController) {
      console.log(`🗑️ Cancelling ongoing AI generation on start processing`);
      session.currentAIController.abort();
      session.isAIGenerating = false;
      session.currentAIController = undefined;
    }

  // Reset voice activity state for fresh start
  const vadState = voiceActivityStates.get(data.sessionId);
  if (vadState) {
    vadState.isActive = false;
    vadState.transcriptionStarted = false;
    vadState.lastVoiceTime = Date.now();
    vadState.lastTranscriptionStart = 0;
    vadState.consecutiveVoiceFrames = 0;
    vadState.consecutiveSilenceFrames = 0;
    if (vadState.silenceTimer) {
      clearTimeout(vadState.silenceTimer);
      vadState.silenceTimer = undefined;
    }
  }

  socket.emit('processing-started', {
    message: 'Audio processing started'
  });

  console.log(`▶️ Started smart processing for session ${data.sessionId} (VAD enabled)`);
};

/**
 * Handle stop processing
 */
const handleStopProcessing = async (socket: Socket, data?: { sessionId?: string }) => {
  // Find the session for this socket
  let sessionId: string | null = null;

  if (data?.sessionId) {
    sessionId = data.sessionId;
  } else {
    // If no sessionId provided, find the session by socket
    for (const [id, session] of sessions.entries()) {
      if (session.socket === socket) {
        sessionId = id;
        break;
      }
    }
  }

  if (!sessionId) {
    socket.emit('error', {
      message: 'No active session found'
    });
    console.log('⏹️ Stop processing: No session found for socket');
    return;
  }

  const session = sessions.get(sessionId);
  if (session) {
    session.isProcessing = false;

    // Process any remaining buffered transcripts before stopping
    if (session.transcriptBuffer.length > 0) {
      console.log(`📤 Processing ${session.transcriptBuffer.length} remaining buffered transcripts before stopping processing`);
      await processBufferedTranscripts(sessionId);
    }

    // Clear any pending AI response timer
    if (session.aiResponseTimer) {
      clearTimeout(session.aiResponseTimer);
      session.aiResponseTimer = undefined;
    }

    // Cancel any ongoing TTS
    if (session.isTTSPlaying && session.currentTTSController) {
      console.log(`🗑️ Cancelling ongoing TTS on stop processing`);
      session.currentTTSController.abort();
      session.isTTSPlaying = false;
      session.currentTTSController = undefined;
    }

    // Cancel any ongoing AI generation
    if (session.isAIGenerating && session.currentAIController) {
      console.log(`🗑️ Cancelling ongoing AI generation on stop processing`);
      session.currentAIController.abort();
      session.isAIGenerating = false;
      session.currentAIController = undefined;
    }

    // Stop any active transcription
    stopTranscription(sessionId);

    // Clean up voice activity state
    const vadState = voiceActivityStates.get(sessionId);
    if (vadState) {
      if (vadState.silenceTimer) {
        clearTimeout(vadState.silenceTimer);
      }
      vadState.isActive = false;
      vadState.transcriptionStarted = false;
      vadState.consecutiveVoiceFrames = 0;
      vadState.consecutiveSilenceFrames = 0;
    }

    socket.emit('processing-stopped', {
      message: 'Audio processing stopped'
    });

    console.log(`⏹️ Stopped smart processing for session ${sessionId}`);
  } else {
    socket.emit('error', {
      message: 'Session not found'
    });
  }
};

/**
 * Handle audio data
 */
const handleAudioData = async (socket: Socket, data?: {
  samples?: number[];
  sampleRate?: number;
  channels?: number;
  sessionId?: string;
}) => {
  if (!data || !data.sessionId || !data.samples) {
    socket.emit('error', {
      message: 'Invalid audio data'
    });
    return;
  }

  const session = sessions.get(data.sessionId);
  if (!session?.isProcessing) return; // Only process if session is active

  try {
    // Convert to Int16Array
    const samples = new Int16Array(data.samples);

    const audioFrame: AudioFrame = {
      timestamp: Date.now(),
      samples,
      sampleRate: data.sampleRate || 16000,
      channels: data.channels || 1
    };

    // Process the audio frame with smart voice detection
    await processAudioFrame(audioFrame, data.sessionId);

    // Add audio chunk to AWS Transcribe if transcription is active (handled by VAD)
    if (isTranscriptionActive(data.sessionId)) {
      addAudioChunk(data.sessionId, samples);
    }

    // Send minimal results back to client (VAD handles transcription)
    socket.emit('processing-results', {
      data: []
    });

  } catch (error) {
    console.error('Audio processing error:', error);
    socket.emit('error', {
      message: 'Failed to process audio data'
    });
  }
};

/**
 * Handle Socket.IO connection close
 */
const handleSocketDisconnect = async (socket: Socket) => {
  // Clean up all sessions for this socket
  for (const [sessionId, session] of sessions.entries()) {
    if (session.socket === socket) {
      // Process any remaining buffered transcripts before disconnecting
      if (session.transcriptBuffer.length > 0) {
        console.log(`📤 Processing ${session.transcriptBuffer.length} remaining buffered transcripts before disconnect`);
        try {
          await processBufferedTranscripts(sessionId);
        } catch (error) {
          console.error('Error processing buffered transcripts on disconnect:', error);
        }
      }

      // Clear any pending AI response timer
      if (session.aiResponseTimer) {
        clearTimeout(session.aiResponseTimer);
        session.aiResponseTimer = undefined;
      }

      // Cancel any ongoing TTS
      if (session.isTTSPlaying && session.currentTTSController) {
        console.log(`🗑️ Cancelling ongoing TTS on disconnect`);
        session.currentTTSController.abort();
        session.isTTSPlaying = false;
        session.currentTTSController = undefined;
      }

      // Cancel any ongoing AI generation
      if (session.isAIGenerating && session.currentAIController) {
        console.log(`🗑️ Cancelling ongoing AI generation on disconnect`);
        session.currentAIController.abort();
        session.isAIGenerating = false;
        session.currentAIController = undefined;
      }

      // Stop transcription and clean up VAD state
      stopTranscription(sessionId);
      const vadState = voiceActivityStates.get(sessionId);
      if (vadState && vadState.silenceTimer) {
        clearTimeout(vadState.silenceTimer);
      }
      voiceActivityStates.delete(sessionId);
      sessions.delete(sessionId);
      console.log(`🧹 Cleaned up session ${sessionId} with VAD state and buffered transcripts`);
    }
  }
  console.log(`👋 Socket.IO client disconnected`);
};

// Start Express server with Socket.IO
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// Create Express app
const app = express();

// Create HTTP server
const server = createServer(app);

// Create Socket.IO server
const io = new SocketIOServer(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
  res.send(indexHtml);
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    activeSessions: sessions.size,
    activeTranscriptions: getActiveTranscriptionCount(),
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get('/status', (req, res) => {
  res.json({
    message: 'Audio Processing Server is running',
    activeSessions: sessions.size
  });
});

app.get('/sessions', (req, res) => {
  res.json(
    Array.from(sessions.values()).map(session => ({
      id: session.id,
      userId: session.userId,
      isProcessing: session.isProcessing,
      hasTranscription: isTranscriptionActive(session.id),
      duration: Date.now() - session.startTime,
      languageCode: session.languageCode
    }))
  );
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('🎧 Socket.IO client connected');

  // Send ready message
  socket.emit('ready', {
    message: 'Connected to audio processing server'
  });

  // Handle specific events
  socket.on('start-session', (data) => {
    handleStartSession(socket, data);
  });

  socket.on('start-processing', (data) => {
    handleStartProcessing(socket, data);
  });

  socket.on('stop-processing', (data) => {
    handleStopProcessing(socket, data);
  });

  socket.on('audio-data', (data) => {
    handleAudioData(socket, data);
  });

  // Conversation management endpoints
  socket.on('get-conversation-history', (data?: { limit?: number }) => {
    // Find the user ID from active sessions
    let userId: string | null = null;
    for (const session of sessions.values()) {
      if (session.socket === socket) {
        userId = session.userId;
        break;
      }
    }

    if (!userId) {
      socket.emit('conversation-error', {
        message: 'No active session found'
      });
      return;
    }

    try {
      const history = getConversationHistory(userId, data?.limit || 20);
      socket.emit('conversation-history', {
        history,
        userId,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error getting conversation history:', error);
      socket.emit('conversation-error', {
        message: 'Failed to get conversation history'
      });
    }
  });

  socket.on('clear-conversation', () => {
    // Find the user ID from active sessions
    let userId: string | null = null;
    for (const session of sessions.values()) {
      if (session.socket === socket) {
        userId = session.userId;
        break;
      }
    }

    if (!userId) {
      socket.emit('conversation-error', {
        message: 'No active session found'
      });
      return;
    }

    try {
      clearConversationHistory(userId);
      socket.emit('conversation-cleared', {
        userId,
        timestamp: Date.now()
      });
      console.log(`🗑️ Cleared conversation history for user ${userId}`);
    } catch (error) {
      console.error('Error clearing conversation:', error);
      socket.emit('conversation-error', {
        message: 'Failed to clear conversation'
      });
    }
  });

  socket.on('get-conversation-stats', () => {
    try {
      const stats = getConversationStats();
      socket.emit('conversation-stats', {
        ...stats,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error getting conversation stats:', error);
      socket.emit('conversation-error', {
        message: 'Failed to get conversation stats'
      });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    handleSocketDisconnect(socket);
  });
});

// Start the server
server.listen(PORT, () => {
  console.log('🚀 Smart Audio Processing Server with Voice Activity Detection');
  console.log('============================================================');
  console.log(`📡 Server running on http://localhost:${PORT}`);
  console.log(`🔌 Socket.IO ready for connections`);
  console.log(`🎤 Smart voice activity detection (VAD)`);
  console.log(`📝 Auto transcription on speech detection`);
  console.log(`⏱️  Auto-stop after 4s silence`);
  console.log(`💡 Just speak - transcription starts/stops automatically!`);
  console.log(`📊 Real-time console logging`);
  console.log('============================================================');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down gracefully...');
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down gracefully...');
  server.close(() => {
    process.exit(0);
  });
});