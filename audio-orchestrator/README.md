# 🎵 Smart Audio Processing with Voice Activity Detection

A minimal real-time audio processing system using functional programming that **automatically** starts/stops transcription based on voice activity, saving AWS costs and providing intelligent speech detection.

## ✨ Features

- 🎤 **Smart Voice Activity Detection (VAD)** - Auto-detects when you speak
- 📝 **Auto transcription** - Starts only when speech is detected
- ⏱️ **Auto-stop after 4s silence** - Saves AWS costs
- 🔧 **Functional programming** - No classes, pure functions only
- 📊 **Real-time audio analysis** (volume, voice detection)
- 📝 **Console logging only** - Clean, minimal interface
- 🎯 **Zero manual control** - Just speak and it works!

## 🚀 Quick Start

### 1. Install Dependencies
```bash
bun install
```

### 2. Set Up AWS Credentials
Create a `.env` file:
```bash
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
```

### 3. Start the Server
```bash
bun run start
```

### 4. Open Client
Open `client-example.html` in your browser and press F12 to see console logs!

## 🎯 How It Works

### Smart Architecture
```
Browser → Socket.IO → Functional Server → Voice Activity Detection
   ↓            ↓             ↓                     ↓
Console    Messages      Analysis              Smart Control
                                                ↙        ↘
                                      Start AWS Transcribe  ← 4s Timer
```

### Intelligent Audio Flow
```
🎙️ You Speak → 🎵 Audio Analysis → 🧠 Voice Detection → 📝 Auto-Start Transcription
                                                       ↘
                                                4s Silence → 🔇 Auto-Stop Transcription
```

## 📡 Simple API

### Client → Server
- `start-session` - Create session (auto-generated)
- `start-processing` - Start mic + transcription
- `stop-processing` - Stop everything

### Server → Client
- `session-created` - Session ready
- `processing-started/stopped` - Status updates

## 🎤 Audio Processing

### Functional Analysis
```typescript
const analyzeAudio = (frame: AudioFrame) => {
  // Calculate volume (RMS)
  const volume = calculateRMS(frame.samples);

  // Detect voice activity
  const isVoiceActive = volume > 5;

  return { volume, isVoiceActive };
};
```

### Real-Time Metrics
- **Volume**: 0-100% (Root Mean Square)
- **Voice Detection**: Boolean threshold
- **Sample Rate**: 16kHz optimized for speech
- **Buffer**: 1,024 samples (~64ms chunks)

## 📝 AWS Transcribe Integration

### Pure Functions
```typescript
// Convert audio to PCM
const convertToPCM = (samples: Int16Array): Uint8Array => { ... }

// Create streaming iterator
const createAudioStream = (sessionId: string): AsyncIterable => { ... }

// Start transcription
const startTranscription = async (sessionId, userId, callbacks) => { ... }
```

### Features
- ✅ **Functional approach** - Pure functions, no side effects
- ✅ **Async iteration** - Streams audio to AWS
- ✅ **Error handling** - Graceful failure recovery
- ✅ **Session management** - Automatic cleanup

## 📊 Console Output

### Audio Analysis
```
📊 Analysis: Volume 45% | Voice: DETECTED | ZCR: 0.123
📊 Analysis: Volume 12% | Voice: Silent | ZCR: 0.089
```

### Smart Transcription Results
```
🎙️ TRANSCRIPT: "Hello" (0.85)
🎙️ TRANSCRIPT: "Hello, how are you today?" (0.92)
🎙️ TRANSCRIPT: "What can I help you with?" (0.89)
```

### Smart VAD Logs
```
📝 Created session session_user123_1234567890 for user user123 with smart VAD
▶️  Started smart processing for session session_user123_1234567890 (VAD enabled)
🎤 Starting smart transcription for user123 (session_user123_1234567890)
📊 Analysis: Volume 45% | Voice: DETECTED
🎙️ TRANSCRIPT: "Hello, how are you today?" (0.92)
🔇 Stopping smart transcription for user123 (session_user123_1234567890) - silence timeout
```

## 🎮 Smart Usage

1. **Open `client-example.html`** in browser
2. **Press F12** to open developer console
3. **Click "Create Session"** (auto-generates user ID)
4. **Click "Start Audio Processing"**
5. **Just speak normally** - transcription starts automatically!
6. **Stop speaking for 4 seconds** - transcription stops automatically
7. **Watch console logs** for intelligent analysis & transcription

### How Smart VAD Works:
- 🎤 **Voice detected** → Auto-starts transcription
- 🔇 **4s silence** → Auto-stops transcription (saves AWS costs!)
- 📊 **Continuous monitoring** → Real-time voice activity analysis
- 💡 **Zero manual control** → Just speak and it works!

## 🔧 Technical Details

### Smart Voice Activity Detection (VAD)
```typescript
// Enhanced VAD with debouncing
const isVoiceActive = volume > 5;

// Smart transcription control with debouncing
if (isVoiceActive) {
  consecutiveVoiceFrames++;
  if (consecutiveVoiceFrames >= 3 && timeSinceLastStart > 2000) {
    startTranscription();  // Only after 3+ voice frames + 2s cooldown
  }
  resetSilenceTimer();
} else {
  consecutiveSilenceFrames++;
  if (consecutiveSilenceFrames >= 5) {
    startSilenceTimer();   // Auto-stop after sustained silence
  }
}
```

### Functional Programming
- ✅ **Pure functions** - No class instances
- ✅ **Global state** - Simple Maps for sessions + VAD state
- ✅ **Function composition** - Modular VAD + transcription logic
- ✅ **Callback pattern** - For async AWS operations

### Audio Processing
- **Web Audio API** - Browser-native audio
- **16kHz mono** - Optimized for speech transcription
- **Echo cancellation** - Clean audio input
- **Real-time chunks** - 64ms processing windows
- **Smart VAD** - Intelligent voice detection with debouncing

### VAD Improvements (Fixed Concurrent Streams Error)
- **Debouncing**: 3+ consecutive voice frames required to start transcription
- **Cooldown**: 2-second minimum between transcription starts
- **Silence Detection**: 5+ consecutive silence frames to trigger stop
- **State Tracking**: Consecutive frame counters prevent false triggers
- **Error Recovery**: Automatic state reset on transcription failures

### AWS Integration
- **PCM encoding** - AWS required format
- **Async iterables** - Streaming interface
- **Smart start/stop** - Only transcribe when speaking
- **Cost optimization** - Auto-stop saves AWS charges
- **Error recovery** - Automatic retry logic
- **Session cleanup** - Memory management

## 🚨 Error Handling

### Microphone Issues
```javascript
// Browser console will show:
"❌ Microphone access error: NotAllowedError"
```

### AWS Issues
```javascript
// Server console will show:
"❌ AWS Transcribe error: Invalid credentials"
```

### Network Issues
```javascript
// Automatic reconnection via Socket.IO
"❌ Disconnected from server"
"✅ Connected to server"
```

## 🎯 Smart Workflow

1. **Browser loads** → Connects to Socket.IO server
2. **Create Session** → Auto-generates session ID with VAD state
3. **Start Processing** → Requests microphone access
4. **Smart Monitoring** → Voice activity detection begins
5. **🎤 Speak** → Auto-starts AWS transcription instantly
6. **🔇 Silence 4s** → Auto-stops transcription (cost savings!)
7. **Repeat** → System continuously monitors and adapts
8. **Stop Processing** → Clean shutdown with state cleanup

## 🛠️ Troubleshooting

### No Audio
- Check microphone permissions in browser
- Verify Web Audio API support

### No Transcription
- Verify AWS credentials in `.env`
- Check AWS region settings
- Confirm IAM permissions for Transcribe

### Connection Issues
- Ensure server is running on port 3000
- Check firewall settings
- Verify Socket.IO connection

### Test Script
```bash
# Run the automated test script
node test-connection.js
```

The test script will:
- ✅ Connect to the server
- ✅ Create a test session
- ✅ Start/stop processing
- ✅ Send test audio data
- ✅ Verify all functionality works

### Specific Error Solutions

#### ❌ `LimitExceededException: You have reached your limit of concurrent streams, 25`
**Cause:** Voice Activity Detection was too sensitive, creating multiple transcription sessions rapidly
**Solution:**
- ✅ **Implemented debouncing**: Requires 3+ consecutive voice frames before starting transcription
- ✅ **Added cooldown**: 2-second minimum between transcription starts
- ✅ **Enhanced silence detection**: Requires 5+ consecutive silence frames before stopping
- ✅ **Better state management**: Prevents multiple concurrent sessions

#### ❌ `TypeError: undefined is not an object (evaluating 'data.sessionId')`
**Cause:** Session creation failed or client sent malformed data
**Solution:**
1. Check server console for session creation errors
2. Ensure client is connected before creating session
3. Verify client JavaScript console for errors
4. Run `node test-connection.js` to test basic connectivity

#### ❌ `Session not found`
**Cause:** Trying to start processing before session creation completes
**Solution:**
1. Always click "Create Session" first
2. Wait for "Session created" message in status
3. Then click "Start Audio Processing"
4. Check browser console for timing issues

## 📝 Code Structure

```
📁 aws-transcribe/
  └── index.ts          # Functional AWS Transcribe functions

📄 index.ts             # Functional server (no classes)

📄 client-example.html  # Simple console-based client

📄 package.json         # Dependencies
```

---

**🎉 Simple, functional, and powerful!**

Your audio processing system now uses pure functional programming with AWS Transcribe for real-time speech recognition. Everything logs to the console - no UI complexity, just clean audio processing! 🚀
