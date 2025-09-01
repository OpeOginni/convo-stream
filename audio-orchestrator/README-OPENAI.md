# OpenAI Transcription Migration

This document describes the migration from AWS Transcribe to OpenAI's Realtime API for transcription streaming.

## Overview

The audio orchestrator has been updated to use OpenAI's Realtime API for transcription instead of AWS Transcribe. This provides:

- **Streaming transcription** with real-time results
- **Voice Activity Detection (VAD)** built into the API
- **Better accuracy** with OpenAI's Whisper model
- **Simplified architecture** with WebSocket-based communication

## Key Changes

### 1. Dependencies
- Removed: `@aws-sdk/client-transcribe-streaming`
- Added: `ws` (WebSocket library)
- Added: `@types/ws` (TypeScript definitions)

### 2. Configuration
- **Old**: Required `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`
- **New**: Requires `OPENAI_API_KEY`

### 3. Language Codes
- **Old**: AWS format (e.g., `en-US`, `es-US`)
- **New**: OpenAI format (e.g., `en`, `es`, `fr`, `de`, etc.)

### 4. Architecture
- **Old**: HTTP-based streaming with AWS SDK
- **New**: WebSocket-based streaming with OpenAI Realtime API

## Setup Instructions

### 1. Get OpenAI API Key
1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Create a new API key
3. Add it to your environment variables:
   ```bash
   export OPENAI_API_KEY="your-api-key-here"
   ```

### 2. Install Dependencies
```bash
cd audio-orchestrator
bun install
```

### 3. Run the Application
```bash
bun run start
```

## Authentication

This implementation uses **Direct WebSocket Authentication** with your OpenAI API key, which is the simplest and most secure method.

### Authentication Method
- **Method**: Bearer token authentication in WebSocket headers
- **Header**: `Authorization: Bearer YOUR_API_KEY`
- **URL**: `wss://api.openai.com/v1/realtime?intent=transcription`
- **Benefits**: No additional API calls needed, direct authentication

## API Differences

### Configuration
The transcription session uses the exact format from OpenAI documentation:

```json
{
  "type": "transcription_session.update",
  "input_audio_format": "pcm16",
  "input_audio_transcription": {
    "model": "gpt-4o-transcribe",
    "prompt": "",
    "language": "en"
  },
  "turn_detection": {
    "type": "server_vad",
    "threshold": 0.5,
    "prefix_padding_ms": 300,
    "silence_duration_ms": 500
  },
  "input_audio_noise_reduction": {
    "type": "near_field"
  },
  "include": [
    "item.input_audio_transcription.logprobs"
  ]
}
```

### Event Flow
1. **Connect**: `wss://api.openai.com/v1/realtime?intent=transcription`
2. **Authenticate**: `Authorization: Bearer YOUR_API_KEY`
3. **Configure**: Send `transcription_session.update`
4. **Stream Audio**: Send `input_audio_buffer.append` with base64 audio
5. **Receive Events**:
   - `transcription_session.created` - Session initialized
   - `input_audio_buffer.committed` - Speech detected (with item_id)
   - `input_audio_transcription.completed` - Transcription result
6. **Process Results**: Extract transcript, confidence from completed events

### Audio Format
- **Format**: PCM16 (16-bit linear PCM)
- **Sample Rate**: 16kHz (recommended)
- **Channels**: Mono
- **Encoding**: Base64 when sending to OpenAI

### Events
OpenAI sends different event types:
- `transcription_session.created`: Session initialized
- `input_audio_buffer.committed`: Speech detected
- `input_audio_transcription.completed`: Transcription result
- `error`: Error occurred

## Voice Activity Detection

The OpenAI implementation includes server-side VAD:
- **Threshold**: 0.5 (sensitivity)
- **Prefix Padding**: 300ms (audio before speech detection)
- **Silence Duration**: 500ms (silence before ending speech)

This replaces the client-side VAD that was previously implemented.

## Testing

### Basic Test
```bash
# Set your API key
export OPENAI_API_KEY="your-api-key"

# Run the test script
bun run test-openai-transcription.ts
```

### Full Application Test
```bash
# Start the server
bun run start

# Open the client in a browser
# http://localhost:3000
```

## Troubleshooting

### Common Issues

1. **"OpenAI API key not found"**
   - Ensure `OPENAI_API_KEY` environment variable is set
   - Check that the API key is valid

2. **"WebSocket connection failed"**
   - Check internet connection
   - Verify OpenAI API key has sufficient credits
   - Check firewall settings for WebSocket connections

3. **"Transcription not starting"**
   - Ensure audio format is PCM16 at 16kHz
   - Check that the session was created successfully
   - Verify WebSocket connection is established

### Debug Mode
Enable verbose logging by setting:
```bash
export DEBUG=openai-transcription
```

## Performance Considerations

- **Latency**: OpenAI streaming typically has 100-300ms latency
- **Cost**: Realtime API usage is billed per minute of audio processed
- **Connection Limits**: OpenAI may limit concurrent WebSocket connections

## Rollback

To rollback to AWS Transcribe:
1. Restore the original `aws-transcribe/index.ts`
2. Update imports in `index.ts`
3. Install AWS SDK dependencies
4. Set AWS credentials instead of OpenAI API key

## Future Enhancements

- Support for multiple transcription models
- Custom vocabulary and prompts
- Advanced VAD configuration
- Multi-language support improvements
