# Convo Stream

End-to-end, low-latency voice conversation system on AWS. Users speak; we transcribe, generate an AI response, and render speech back in real time.

## Stack

- Cognito (Authentication)
- ECS Fargate (compute)
  - TypeScript with Bun runtime
  - AWS SDK for Amazon Transcribe Streaming
  - Openrouter and AI SDK for response generation 
  - ElevenLabs (text-to-speech)

- Amazon Application Load Balancer
- Amazon ECR (container registry)

## Repository Structure

```
convo-stream/
├── audio-orchestrator/           # App service: Express + Socket.IO + Transcribe + AI + TTS
│   ├── index.ts                  # Main server
│   ├── ai/                       # OpenRouter + ElevenLabs integrations
│   ├── aws-transcribe/           # AWS Transcribe client (streaming)
│   ├── bin/health-check          # Container healthcheck script (bash + curl)
│   ├── client-example.html       # Simple web client
│   ├── package.json
│   └── README.md                 # Module-specific docs (local dev, API/events)
├── aws/
│   └── cfn/
│       ├── networking/template.yaml       # VPC + Subnets + etc
│       ├── cluster/template.yaml          # ECS cluster + ALB + Target Groups
│       └── fargate-service/template.yaml  # Task Definition + Service
├── bin/
│   ├── cfn/networking            # Deploy networking stack
│   ├── cfn/cluster               # Deploy cluster stack
│   └── cfn/fargate-service       # Deploy service stack
│   └── ecr/
│       ├── login                 # ECR login
│       ├── build-push-ecr-image  # Buildx multi-arch build + push to ECR
│       └── build-push-local-image# Local build (and optional Docker Hub push)
├── docker-compose.yml
├── dockerfile                    # Bun base image; installs curl; builds app
└── README.md                     # (this file)
```

## Health Checks (Container)

- Health endpoint: `GET /health-check` (served by `audio-orchestrator`)
- Health script: `audio-orchestrator/bin/health-check`

Current script:
```bash
#!/usr/bin/env bash
curl -fsS http://localhost:3000/health-check || exit 1
```

- ECS TaskDefinition healthcheck (defined in `aws/cfn/fargate-service/template.yaml`):
  ```yaml
  Command:
    - 'CMD-SHELL'
    - 'bash /app/bin/health-check'
  ```
- docker-compose (local):
  ```yaml
  healthcheck:
    test: ["CMD", "bin/health-check"]
  ```

## Deployment to AWS

### Prerequisites

- AWS account + credentials configured (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)
- ECR repository for the image
- SSM parameters for secrets used by the service

### 1) Authenticate to ECR

```bash
bin/ecr/login
```

### 2) Build and Push Image to ECR

```bash
export AWS_ACCOUNT_ID=<your-id>
export AWS_DEFAULT_REGION=eu-central-1
bin/ecr/build-push-ecr-image
```

This builds a multi-arch image (amd64, arm64) and pushes to `EcrImage` (see below).

### 3) Update CloudFormation Parameters (ECR + SSM)

Edit defaults in `aws/cfn/fargate-service/template.yaml` or override at deploy-time:

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

Override example (CLI):
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

### 4) Deploy CFN Stacks

```bash
# Networking
chmod u+x bin/cfn/networking
bin/cfn/networking

# Cluster (ECS + ALB + TargetGroup)
chmod u+x bin/cfn/cluster
bin/cfn/cluster

# Service (Task Definition + Service)
chmod u+x bin/cfn/fargate-service
bin/cfn/fargate-service
```

## Debugging in Production (ECS Exec)

Use `aws ecs execute-command` to exec into the running task:

```bash
CLUSTER=ConvoStreamClusterFargateCluster
TASK_ARN=<task-arn>
CONTAINER=audio-orchestrator

# Verify working directory and files
aws ecs execute-command --cluster "$CLUSTER" --task "$TASK_ARN" --container "$CONTAINER" --interactive --command "pwd"
aws ecs execute-command --cluster "$CLUSTER" --task "$TASK_ARN" --container "$CONTAINER" --interactive --command "ls -l"

# Verify health from inside container
aws ecs execute-command --cluster "$CLUSTER" --task "$TASK_ARN" --container "$CONTAINER" --interactive --command "curl -v http://localhost:3000/health-check"

# Run the healthcheck script via bash
aws ecs execute-command --cluster "$CLUSTER" --task "$CLUSTER" --container "$CONTAINER" --interactive --command "chmod +x /app/bin/health-check && bash /app/bin/health-check"
```

## Local Development

For running and testing the application server locally (Express + Socket.IO + AI/TTS), see `audio-orchestrator/README.md`.