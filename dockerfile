FROM oven/bun:latest

WORKDIR /app

# Copy package files
COPY ../audio-orchestrator/package.json ../audio-orchestrator/bun.lock ./

# Install dependencies
RUN bun install

# Copy source code
COPY ../audio-orchestrator .

# Install curl for health checks (supports Debian/Alpine)
RUN (apt-get update && apt-get install -y curl ca-certificates && rm -rf /var/lib/apt/lists/*) || (apk update && apk add --no-cache curl ca-certificates)

# Ensure healthcheck script is executable
RUN chmod +x bin/health-check

# Build the application (configuration is now in tsconfig.json)
RUN bun run build

EXPOSE 3000

# Set default environment variables
ENV PORT=3000
CMD ["bun", "run", "start"]


