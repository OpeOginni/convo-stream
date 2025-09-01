#!/usr/bin/env bun

// Test script for OpenAI transcription functionality
import { startTranscription, stopTranscription, isTranscriptionActive } from './openai-transcribe/index';

// Check if OpenAI API key is available
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY not found. Please set your OpenAI API key.');
  console.log('💡 You can get an API key from: https://platform.openai.com/api-keys');
  process.exit(1);
}

console.log('🧪 Testing OpenAI Transcription Module');
console.log('=====================================');
console.log('🔐 Authentication Method: Direct WebSocket with API Key');
console.log('');

// Test basic functionality
async function testTranscription() {
  const sessionId = 'test-session-123';
  const userId = 'test-user';

  console.log(`\n1. Testing transcription start for session ${sessionId}...`);

  try {
    const success = await startTranscription(sessionId, userId, 'en', 16000, {
      onResult: (result) => {
        console.log(`📝 Transcription result: "${result.transcript}" (${result.isPartial ? 'partial' : 'final'})`);
      },
      onError: (error) => {
        console.error('❌ Transcription error:', error);
      },
      onConnected: () => {
        console.log('🔗 Connected to OpenAI transcription service');
      },
      onDisconnected: () => {
        console.log('🔌 Disconnected from OpenAI transcription service');
      },
      onEnd: () => {
        console.log('🏁 Transcription session ended');
      }
    });

    if (success) {
      console.log('✅ Transcription started successfully');
    } else {
      console.log('❌ Failed to start transcription');
      return;
    }

    // Check if transcription is active
    console.log(`\n2. Checking if transcription is active...`);
    const isActive = isTranscriptionActive(sessionId);
    console.log(`📊 Transcription active: ${isActive}`);

    // Wait a bit to see if connection is established
    console.log(`\n3. Waiting 5 seconds to test connection...`);
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Stop transcription
    console.log(`\n4. Stopping transcription...`);
    stopTranscription(sessionId);

    console.log('✅ Test completed successfully');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testTranscription().catch(console.error);
