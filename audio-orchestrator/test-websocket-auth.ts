#!/usr/bin/env bun

// Test script for OpenAI WebSocket authentication
import WebSocket from 'ws';
import dotenv from 'dotenv';

dotenv.config();

// OpenAI Configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_REALTIME_URL = 'wss://api.openai.com/v1/realtime?intent=transcription';

if (!OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY not found. Please set your OpenAI API key.');
  console.log('💡 You can get an API key from: https://platform.openai.com/api-keys');
  process.exit(1);
}

console.log('🔐 Testing OpenAI WebSocket Direct Authentication');
console.log('=================================================');
console.log(`🔑 API Key: ${OPENAI_API_KEY.substring(0, 10)}...${OPENAI_API_KEY.substring(OPENAI_API_KEY.length - 4)}`);
console.log(`🌐 URL: ${OPENAI_REALTIME_URL}`);
console.log('');

const ws = new WebSocket(OPENAI_REALTIME_URL, [], {
  headers: {
    'Authorization': `Bearer ${OPENAI_API_KEY}`,
    'OpenAI-Beta': 'realtime=v1'
  }
});

ws.on('open', () => {
  console.log('✅ WebSocket connection established successfully!');
  console.log('🔐 Authentication successful - direct API key method working');

  // Send a simple configuration message to test the connection
  const configMessage = {
    type: "transcription_session.update",
    input_audio_format: "pcm16",
    input_audio_transcription: {
      model: "gpt-4o-transcribe",
      prompt: "",
      language: "en"
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
  };

  ws.send(JSON.stringify(configMessage));
  console.log('📤 Sent configuration message');

  // Close after 3 seconds
  setTimeout(() => {
    console.log('🔄 Closing test connection...');
    ws.close();
  }, 3000);
});

ws.on('message', (data: Buffer) => {
  try {
    const message = JSON.parse(data.toString());
    console.log(`📨 Received: ${message.type}`);
  } catch (error) {
    console.log(`📨 Received (raw): ${data.toString().substring(0, 100)}...`);
  }
});

ws.on('error', (error: Error) => {
  console.error('❌ WebSocket error:', error.message);
});

ws.on('close', (code, reason) => {
  console.log(`🔌 WebSocket closed (code: ${code})`);
  if (reason && reason.length > 0) {
    console.log(`Reason: ${reason.toString()}`);
  }
  console.log('✅ Authentication test completed');
  process.exit(0);
});

// Timeout after 10 seconds
setTimeout(() => {
  console.log('⏰ Test timeout - closing connection');
  ws.close();
}, 10000);
