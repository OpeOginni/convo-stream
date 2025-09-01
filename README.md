# Convo Stream

A simple backend system that allows users to speak to an AI model with the purpose of getting language practice. It provides low latency, real time, responses and can steer conversation based on specified contexts.

## Stack

- **Frontend**: HTML/JavaScript client
- **Backend**: Node.js/TypeScript with Bun runtime
- **WebSocket**: Socket.IO for real-time communication
- **Transcription**: OpenAI Realtime API (Whisper model)
- **AI**: OpenRouter API for conversation management
- **TTS**: ElevenLabs for text-to-speech
- **Voice Activity Detection**: Server-side VAD with OpenAI

## Key Features

- 🎤 **Real-time Speech Recognition** using OpenAI's Whisper via Realtime API
- 🎯 **Smart Voice Activity Detection** that automatically starts/stops transcription
- 🤖 **AI Conversation** with context-aware responses
- 🔊 **Text-to-Speech** integration with ElevenLabs
- 📱 **Web-based Client** for easy access
- 🔄 **Streaming Architecture** for low-latency responses

## Setup

### Prerequisites
- Node.js/Bun runtime
- OpenAI API key
- ElevenLabs API key (optional, for TTS)
- OpenRouter API key (optional, for AI responses)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd convo-stream/audio-orchestrator
   ```

2. **Install dependencies**
   ```bash
   bun install
   ```

3. **Configure environment variables**
   ```bash
   export OPENAI_API_KEY="your-openai-api-key"
   export ELEVENLABS_API_KEY="your-elevenlabs-api-key"  # Optional
   export OPENROUTER_API_KEY="your-openrouter-api-key"  # Optional
   ```

4. **Start the server**
   ```bash
   bun run start
   ```

5. **Open the client**
   - Visit `http://localhost:3000` in your browser
   - Click "Start Session" to begin
   - Start speaking - transcription will begin automatically

## Architecture

The system uses a streaming architecture:

1. **Audio Capture**: Browser captures microphone audio
2. **Voice Detection**: Server-side VAD detects speech patterns
3. **Transcription**: OpenAI Realtime API transcribes speech to text
4. **AI Processing**: OpenRouter generates contextual responses
5. **TTS Generation**: ElevenLabs converts responses to speech
6. **Real-time Streaming**: All components work together for low-latency interaction

## Development

### Available Scripts
- `bun run start` - Start production server
- `bun run dev` - Start development server with hot reload

### API Endpoints
- `GET /` - Serve client application
- `GET /health` - Health check
- `GET /status` - Server status
- `GET /sessions` - Active sessions info

### WebSocket Events
- `start-session` - Initialize user session
- `start-processing` - Begin audio processing
- `stop-processing` - End audio processing
- `audio-data` - Stream audio chunks
- `transcription-result` - Transcription results
- `ai-response` - AI generated responses
- `tts-audio` - Text-to-speech audio

## Migration from AWS Transcribe

This project has been migrated from AWS Transcribe to OpenAI's Realtime API for improved performance and simplicity. See [README-OPENAI.md](./audio-orchestrator/README-OPENAI.md) for migration details.