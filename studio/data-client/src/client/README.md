# HTTP Client

A robust HTTP client built on Axios with advanced features including retry logic, specialized error handling, and TypeScript support.

## Features

- ✅ **Retry Logic**: Automatic retry with exponential backoff and jitter
- ✅ **Specialized Errors**: Type-safe error classes for different scenarios
- ✅ **Interceptors**: Request, response, and error interceptors
- ✅ **TypeScript**: Full type safety with comprehensive interfaces
- ✅ **Configurable**: Flexible configuration for different use cases
- ✅ **Logging**: Optional request/response logging

## Installation

```typescript
import { HttpClient } from './client';
```

## Basic Usage

```typescript
// Create a client instance
const client = new HttpClient({
  baseURL: 'https://api.example.com',
  timeout: 30000,
  headers: {
    'X-API-Key': 'your-api-key',
  },
});

// Make requests
const user = await client.get('/users/123');
const newUser = await client.post('/users', { name: 'John Doe' });
const updated = await client.put('/users/123', { name: 'Jane Doe' });
await client.delete('/users/123');
```

## Retry Configuration

Configure automatic retry behavior with exponential backoff:

```typescript
const client = new HttpClient({
  baseURL: 'https://api.example.com',
  retry: {
    maxRetries: 3,
    initialBackoffMs: 1000,
    maxBackoffMs: 30000,
    backoffMultiplier: 2,
    retryableStatuses: [408, 429, 500, 502, 503, 504],
    retryableMethods: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'],
    shouldRetry: (error, attemptNumber) => {
      // Custom retry logic
      return attemptNumber < 3;
    },
    onRetry: (error, attemptNumber, delayMs) => {
      console.log(`Retrying request (attempt ${attemptNumber}) after ${delayMs}ms`);
    },
  },
});
```

### Per-Request Retry Configuration

```typescript
// Override retry config for specific request
const data = await client.get('/critical-endpoint', {
  retry: {
    maxRetries: 5,
    initialBackoffMs: 500,
  },
});

// Disable retry for specific request
const data = await client.post('/no-retry', body, {
  retry: false,
});
```

## Error Handling

The client provides specialized error classes for different scenarios:

```typescript
import {
  NetworkError,
  TimeoutError,
  RateLimitError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  ServerError,
  CancellationError,
} from './client';

try {
  const data = await client.get('/users/123');
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log('User not found');
  } else if (error instanceof AuthenticationError) {
    console.log('Please log in');
  } else if (error instanceof RateLimitError) {
    console.log(`Rate limited. Retry after ${error.retryAfter} seconds`);
  } else if (error instanceof ValidationError) {
    console.log('Validation errors:', error.validationErrors);
  } else if (error instanceof NetworkError) {
    console.log('Network error:', error.message);
  }
}
```

### Error Properties

All errors extend `KBError` and include:

- `code`: Error code enum
- `message`: Human-readable error message
- `timestamp`: When the error occurred
- `originalError`: Original error (if applicable)

Specialized errors may include additional properties:

- `RateLimitError.retryAfter`: Seconds until retry is allowed
- `ValidationError.validationErrors`: Field-level validation errors
- `ServerError.statusCode`: HTTP status code

## Interceptors

Add custom logic to requests, responses, and errors:

```typescript
// Request interceptor
client.addRequestInterceptor((config) => {
  config.headers['X-Request-ID'] = generateRequestId();
  return config;
});

// Response interceptor
client.addResponseInterceptor((response) => {
  console.log('Response received:', response.status);
  return response;
});

// Error interceptor
client.addErrorInterceptor((error) => {
  if (error.code === ErrorCode.UNAUTHORIZED) {
    // Redirect to login
    window.location.href = '/login';
  }
  return error;
});
```

## Advanced Configuration

### Enable Logging

```typescript
const client = new HttpClient({
  enableLogging: true, // Logs all requests and responses
});
```

### Custom Headers

```typescript
// Set default headers
client.setHeaders({
  'Authorization': 'Bearer token',
  'X-Custom-Header': 'value',
});

// Set single header
client.setHeader('X-API-Version', '2.0');

// Remove header
client.removeHeader('X-Custom-Header');

// Per-request headers
const data = await client.get('/endpoint', {
  headers: {
    'X-Request-Specific': 'value',
  },
});
```

### Update Base URL

```typescript
client.setBaseURL('https://new-api.example.com');
```

### Access Axios Instance

```typescript
const axiosInstance = client.getAxiosInstance();
// Use axios instance directly if needed
```

## Request Options

All HTTP methods accept an optional `FetchOptions` parameter:

```typescript
interface FetchOptions {
  headers?: Record<string, string>;
  params?: Record<string, any>;
  timeout?: number;
  retry?: RetryConfig | false;
  metadata?: Record<string, any>; // Not sent to server
  // ... other Axios options
}
```

### Examples

```typescript
// Query parameters
const users = await client.get('/users', {
  params: { page: 1, limit: 10 },
});

// Custom timeout
const data = await client.get('/slow-endpoint', {
  timeout: 60000, // 60 seconds
});

// Request metadata (not sent to server)
const data = await client.get('/endpoint', {
  metadata: { trackingId: '123' },
});
```

## HTTP Methods

### GET

```typescript
const data = await client.get<User>('/users/123');
const users = await client.get<User[]>('/users', {
  params: { active: true },
});
```

### POST

```typescript
const newUser = await client.post<User>('/users', {
  name: 'John Doe',
  email: 'john@example.com',
});
```

### PUT

```typescript
const updated = await client.put<User>('/users/123', {
  name: 'Jane Doe',
});
```

### PATCH

```typescript
const patched = await client.patch<User>('/users/123', {
  email: 'newemail@example.com',
});
```

### DELETE

```typescript
await client.delete('/users/123');
```

### HEAD

```typescript
const headers = await client.head('/users/123');
console.log(headers['content-type']);
```

## TypeScript Support

Full TypeScript support with generic types:

```typescript
interface User {
  id: string;
  name: string;
  email: string;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
}

// Type-safe responses
const user = await client.get<User>('/users/123');
const users = await client.get<PaginatedResponse<User>>('/users');

// Type-safe request bodies
const newUser = await client.post<User, CreateUserDto>('/users', {
  name: 'John',
  email: 'john@example.com',
});
```

## Best Practices

1. **Create a singleton instance** for your application
2. **Configure retry logic** based on your API's behavior
3. **Use specialized error classes** for better error handling
4. **Add interceptors** for cross-cutting concerns (auth, logging, etc.)
5. **Enable logging** during development
6. **Set appropriate timeouts** for different endpoints
7. **Use TypeScript generics** for type-safe responses

## Example: Complete Setup

```typescript
import { HttpClient, ErrorCode } from './client';

// Create configured client
const apiClient = new HttpClient({
  baseURL: process.env.API_BASE_URL,
  timeout: 30000,
  headers: {
    'X-App-Version': '1.0.0',
  },
  retry: {
    maxRetries: 3,
    initialBackoffMs: 1000,
    onRetry: (error, attempt, delay) => {
      console.warn(`Retry attempt ${attempt} after ${delay}ms`);
    },
  },
  enableLogging: process.env.NODE_ENV === 'development',
});

// Add authentication interceptor
apiClient.addRequestInterceptor((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

// Add error handling interceptor
apiClient.addErrorInterceptor((error) => {
  if (error.code === ErrorCode.UNAUTHORIZED) {
    // Clear auth and redirect
    localStorage.removeItem('auth_token');
    window.location.href = '/login';
  }
  return error;
});

export default apiClient;
```

## License

MIT
