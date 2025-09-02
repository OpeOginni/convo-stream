# Audio Orchestrator

A real-time conversational AI system with voice input, transcription, AI responses, and text-to-speech output.

## Features

- 🎤 Real-time voice transcription using AWS Transcribe
- 🤖 AI-powered responses using OpenRouter
- 🔊 Text-to-speech using Eleven Labs
- 🚫 Smart interruption detection and cancellation
- 📦 Buffered transcript processing
- ⚡ Built with Bun for fast performance

## Quick Start

### Local Development

1. **Install dependencies:**
   ```bash
   bun install
   ```

2. **Set up environment variables:**
   Create a `.env` file with your API keys:
   ```bash
   OPENROUTER_API_KEY=your_openrouter_api_key_here
   ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
   AWS_ACCESS_KEY_ID=your_aws_access_key_id
   AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
   ```

3. **Run development server:**
   ```bash
   bun run dev
   ```

4. **Open browser:**
   Navigate to `http://localhost:3000`

### Docker Setup

1. **Using Docker Compose (Recommended):**
   ```bash
   # From the parent directory (convo-stream/)
   docker-compose up --build
   ```

2. **Using Docker directly:**
   ```bash
   cd audio-orchestrator
   docker build -t audio-orchestrator .
   docker run -p 3000:3000 --env-file .env audio-orchestrator
   ```

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENROUTER_API_KEY` | API key for AI responses | Yes |
| `ELEVENLABS_API_KEY` | API key for text-to-speech | Yes |
| `AWS_ACCESS_KEY_ID` | AWS access key for transcription | Yes |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key for transcription | Yes |
| `PORT` | Server port (default: 3000) | No |

## API Endpoints

- `GET /` - Main client interface
- `GET /health-check` - Health check
- `GET /status` - Server status
- `GET /sessions` - Active sessions

## Socket.IO Events

### Client → Server
- `start-session` - Create new session
- `start-processing` - Begin audio processing
- `stop-processing` - Stop audio processing
- `audio-data` - Send audio data

### Server → Client
- `session-created` - Session creation confirmation
- `transcription-result` - Real-time transcription
- `ai-response` - AI-generated response
- `tts-audio` - Text-to-speech audio data
- `ai-interrupted` - Interruption notification

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Web Client    │◄──►│  Audio Server    │◄──►│   AI Services    │
│                 │    │                  │    │                 │
│ • Voice Input   │    │ • WebSocket       │    │ • OpenRouter    │
│ • Real-time UI  │    │ • Express         │    │ • Eleven Labs   │
│ • Audio Output  │    │ • Session Mgmt    │    │ • AWS Transcribe│
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Development

### Scripts

- `bun run dev` - Development server with hot reload
- `bun run build` - Build for production (uses tsconfig.json configuration)
- `bun run start` - Start production server

### Configuration

Build and development settings are configured in `tsconfig.json` under the `"bun"` field:

```json
{
  "bun": {
    "build": {
      "target": "node",
      "outdir": "./dist",
      "entrypoints": ["./index.ts"]
    },
    "dev": {
      "port": 3000,
      "hostname": "0.0.0.0"
    }
  }
}
```

### Project Structure

```
audio-orchestrator/
├── index.ts              # Main server file
├── client-example.html   # Web client
├── ai/
│   ├── openrouter.ts     # AI response generation
│   └── eleven-lab.ts     # Text-to-speech
├── aws-transcribe/       # AWS transcription
├── package.json          # Dependencies
├── dockerfile           # Docker build
└── bun.lock             # Bun lockfile
```

## Docker Environment Variables

When using Docker, you can pass environment variables in several ways:

1. **Environment variables in docker-compose.yml:**
   ```yaml
   environment:
     - OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
   ```

2. **Using .env file:**
   ```bash
   # Create .env file in audio-orchestrator/
   OPENROUTER_API_KEY=your_key_here
   ```

3. **Command line:**
   ```bash
   docker run -e OPENROUTER_API_KEY=your_key_here -p 3000:3000 audio-orchestrator
   ```

## Troubleshooting

### Common Issues

1. **"ELEVENLABS_API_KEY environment variable not found"**
   - Make sure your `.env` file exists and contains the correct API key
   - Check that the environment variable is being passed to Docker

2. **"OPENROUTER_API_KEY environment variable not found"**
   - Same as above, ensure API key is properly configured

3. **"AWS credentials not configured"**
   - Ensure AWS credentials are set for transcription functionality

4. **Build fails**
   - Make sure Bun is properly installed
   - Try `bun install` to refresh dependencies

## Deployment

For AWS architecture, ECR build/push, CloudFormation stacks, and production debugging, see the project root `README.md`.

### Local builds

- Build and load locally (Apple Silicon arm64):
  ```bash
  bin/ecr/build-push-local-image
  ```

- Push to Docker Hub (optional):
  ```bash
  DOCKERHUB_REPO="<dockerhub-username>/convo-stream" bin/ecr/build-push-local-image
  ```

## Production Healthcheck Notes

We use an internal health endpoint `GET /health-check` and a bash script `bin/health-check` that curls the endpoint and exits non‑zero on failure.

Current script:
```bash
#!/usr/bin/env bash
curl -fsS http://localhost:3000/health-check || exit 1
```

What we settled on:

- Dockerfile: ensure the script is executable (and curl is available)
  ```Dockerfile
  RUN (apt-get update && apt-get install -y curl ca-certificates && rm -rf /var/lib/apt/lists/*) || (apk update && apk add --no-cache curl ca-certificates)
  RUN chmod +x bin/health-check
  ```

- ECS TaskDefinition healthcheck (invoke via bash, matching the template):
  ```yaml
  Command:
    - 'CMD-SHELL'
    - 'bash /app/bin/health-check'
  ```

- docker-compose healthcheck (local):
  ```yaml
  healthcheck:
    test: ["CMD", "bin/health-check"]
  ```

## Production Debugging

See root `README.md` for `aws ecs execute-command` usage and examples.

## CloudFormation Parameters: ECR Image and SSM Parameter ARNs

Before deploying, update the image and SSM parameter references in `aws/cfn/fargate-service/template.yaml` to match your account and parameter names, or pass them as parameters when deploying.

Relevant parameters (defaults shown in the template):

```yaml
Parameters:
  EcrImage:
    Type: String
    Default: '<your-account-id>.dkr.ecr.<your-region>.amazonaws.com/convo-stream'
  SecretsAWSAccessKeyId:
    Type: String
    Default: 'arn:aws:ssm:<region>:<account-id>:parameter/convo-stream/AWS_ACCESS_KEY_ID'
  SecretsSecretAccessKey:
    Type: String
    Default: 'arn:aws:ssm:<region>:<account-id>:parameter/convo-stream/AWS_SECRET_ACCESS_KEY'
  SecretsOpenrouterApiKey:
    Type: String
    Default: 'arn:aws:ssm:<region>:<account-id>:parameter/convo-stream/OPENROUTER_API_KEY'
  SecretsElevenlabsApiKey:
    Type: String
    Default: 'arn:aws:ssm:<region>:<account-id>:parameter/convo-stream/ELEVENLABS_API_KEY'
```

Options to update:
- Edit the `Default` values in the template file for your environment; or
- Supply overrides when deploying the stack (recommended for multi-env setups).

Example (if deploying via AWS CLI directly):
```bash
aws cloudformation deploy \
  --stack-name ConvoStreamFargateService \
  --template-file aws/cfn/fargate-service/template.yaml \
  --parameter-overrides \
    EcrImage=<your-account-id>.dkr.ecr.<your-region>.amazonaws.com/convo-stream:latest \
    SecretsAWSAccessKeyId=arn:aws:ssm:<region>:<account-id>:parameter/convo-stream/AWS_ACCESS_KEY_ID \
    SecretsSecretAccessKey=arn:aws:ssm:<region>:<account-id>:parameter/convo-stream/AWS_SECRET_ACCESS_KEY \
    SecretsOpenrouterApiKey=arn:aws:ssm:<region>:<account-id>:parameter/convo-stream/OPENROUTER_API_KEY \
    SecretsElevenlabsApiKey=arn:aws:ssm:<region>:<account-id>:parameter/convo-stream/ELEVENLABS_API_KEY \
  --capabilities CAPABILITY_NAMED_IAM
```


## License

MIT