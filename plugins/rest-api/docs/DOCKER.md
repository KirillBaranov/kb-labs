# KB Labs REST API - Docker Guide

## Quick Start

### Build Image

```bash
docker build -t kb-labs-rest-api:latest .
```

### Run Container

```bash
docker run -d \
  --name kb-labs-rest-api \
  -p 3001:3001 \
  -v $(pwd)/data:/app/.kb/rest \
  -e KB_REST_PORT=3001 \
  kb-labs-rest-api:latest
```

### Using Docker Compose

```bash
# Production
docker-compose up -d

# Development (with hot reload)
docker-compose --profile dev up rest-api-dev
```

## Dockerfile Structure

### Multi-stage Build

1. **Builder Stage** (`node:20-alpine`)
   - Installs build dependencies (python3, make, g++)
   - Installs pnpm
   - Installs all dependencies
   - Builds application

2. **Runner Stage** (`node:20-alpine`)
   - Minimal production image
   - Installs only production dependencies
   - Runs as non-root user (`nodejs`)
   - Includes health check

### Features

- ✅ **Non-root user** - Runs as `nodejs` (uid 1001)
- ✅ **Multi-stage build** - Smaller final image
- ✅ **Health check** - Automatic health monitoring
- ✅ **Volume mounts** - Persistent storage for `.kb/rest`
- ✅ **Minimal binaries** - Only `curl` for health checks

## Configuration

### Environment Variables

```bash
# Server
PORT=3001
KB_REST_BASE_PATH=/api/v1
KB_REST_API_VERSION=1.0.0

# Queue
KB_REST_QUEUE_DRIVER=memory
KB_REST_QUEUE_CLEANUP_ENABLED=true
KB_REST_QUEUE_CLEANUP_INTERVAL_SEC=3600
KB_REST_QUEUE_CLEANUP_TTL_SEC=86400

# Storage
KB_REST_STORAGE_DRIVER=fs

# CORS
KB_REST_CORS_PROFILE=prod
KB_REST_CORS_ORIGINS=https://studio.example.com
```

### Volume Mounts

```yaml
volumes:
  - ./data:/app/.kb/rest          # Persistent job artifacts
  - ./kb-labs.config.json:/app/kb-labs.config.json:ro  # Config file
```

## Production Deployment

### Build for Production

```bash
# Build optimized image
docker build -t kb-labs-rest-api:latest .

# Tag for registry
docker tag kb-labs-rest-api:latest registry.example.com/kb-labs-rest-api:v1.0.0

# Push to registry
docker push registry.example.com/kb-labs-rest-api:v1.0.0
```

### Deploy with Docker Compose

```bash
# Production deployment
docker-compose up -d

# Check logs
docker-compose logs -f rest-api

# Check health
curl http://localhost:3001/health
```

### Health Check

```bash
# Container health status
docker ps
# HEALTHY status indicates container is healthy

# Manual health check
curl http://localhost:3001/health
curl http://localhost:3001/ready
```

## Development

### Development Dockerfile

For development with hot reload:

```bash
# Build dev image
docker build -f Dockerfile.dev -t kb-labs-rest-api:dev .

# Run with volume mounts
docker run -d \
  --name kb-labs-rest-api-dev \
  -p 3001:3001 \
  -v $(pwd)/apps/rest-api/src:/app/apps/rest-api/src \
  -v $(pwd)/packages/rest-api-core/src:/app/packages/rest-api-core/src \
  kb-labs-rest-api:dev
```

### Using Docker Compose for Dev

```bash
# Start development service
docker-compose --profile dev up rest-api-dev

# View logs
docker-compose logs -f rest-api-dev
```

## Troubleshooting

### Image Size

The final image should be around 100-200MB (alpine + Node.js + dependencies).

To check image size:
```bash
docker images kb-labs-rest-api
```

### Permission Issues

If you encounter permission issues with volumes:
```bash
# Fix permissions for mounted volumes
sudo chown -R 1001:1001 ./data
```

### Dependencies Not Resolving

If `link:` dependencies fail to resolve:
1. Ensure external packages are built and available
2. Consider publishing packages to npm registry
3. Or bundle dependencies in the build stage

### Health Check Failing

Check container logs:
```bash
docker logs kb-labs-rest-api
```

Verify health endpoint:
```bash
docker exec kb-labs-rest-api curl -f http://localhost:3001/health
```

## Security Best Practices

- ✅ Non-root user (`nodejs` uid 1001)
- ✅ Minimal base image (alpine)
- ✅ Read-only config mounts
- ✅ Security headers (configured in app)
- ✅ Health checks for monitoring
- ⚠️ Consider adding security scanning (Trivy, Snyk)

## Optimization Tips

1. **Layer Caching**: Package files are copied first to leverage Docker cache
2. **Multi-stage Build**: Reduces final image size
3. **Production Dependencies**: Only production deps in final image
4. **Alpine Base**: Smaller than standard Node.js image


