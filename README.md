# Convo Stream

A simple backend system build on AWS that allows users to speak to an AI model with the purpose of getting language practice. It provides low latency, real time, responses and can steer conversation based on specified contexts.

## Stack

- Cognito (Authentication)
- ECS Fargate (Serverless Computation)
  - Typescript with Bun
  - AWS SDK for Transcribe
- Amazon API Gateway
- Amazon Transcribe (Voice to Text)
- AI SDK (AI Response Streaming)
- Eleven Labs (Text to Voice)
- DynamoDB (Quick and easy storage)

- Github Actions for CI/CD
- Amazon ECR for Container Registry