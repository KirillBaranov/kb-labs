# @kb-labs/gateway-auth

Authentication and authorization middleware for the KB Labs API Gateway. Handles client registration, JWT issuance, token refresh, and request authorization.

---

## Auth Flow

```
Client                          Gateway (/auth/*)              ICache (store)
  │                                   │                              │
  │  POST /auth/register               │                              │
  │  { name, capabilities[] }         │                              │
  ├──────────────────────────────────►│                              │
  │                                   │  generateClientSecret()      │
  │                                   │  buildClientRecord()         │
  │                                   │  saveClient() ─────────────►│
  │                                   │  (hash stored, never plain)  │
  │◄──────────────────────────────────┤                              │
  │  { clientId, clientSecret,        │                              │
  │    hostId, namespaceId }          │                              │
  │  (clientSecret returned ONCE)     │                              │
  │                                   │                              │
  │  POST /auth/token                 │                              │
  │  { clientId, clientSecret }       │                              │
  ├──────────────────────────────────►│                              │
  │                                   │  verifyClientSecret() ──────►│
  │                                   │  signAccessToken()           │
  │                                   │  signRefreshToken()          │
  │                                   │  saveRefreshToken() ────────►│
  │◄──────────────────────────────────┤                              │
  │  { accessToken (15m),             │                              │
  │    refreshToken (30d),            │                              │
  │    expiresIn, tokenType }         │                              │
  │                                   │                              │
  │  GET /any-route                   │                              │
  │  Authorization: Bearer <token>    │                              │
  ├──────────────────────────────────►│                              │
  │                                   │  verifyAccessToken()         │
  │                                   │  → AuthContext injected      │
  │                                   │    into request              │
  │◄──────────────────────────────────┤                              │
  │  200 (or 401 if expired)          │                              │
  │                                   │                              │
  │  POST /auth/refresh               │                              │
  │  { refreshToken }                 │                              │
  ├──────────────────────────────────►│                              │
  │                                   │  verifyRefreshToken()        │
  │                                   │  consumeRefreshToken() ─────►│ (old token deleted)
  │                                   │  signAccessToken()           │
  │                                   │  signRefreshToken()          │
  │                                   │  saveRefreshToken() ────────►│ (new token saved)
  │◄──────────────────────────────────┤                              │
  │  { accessToken (15m),             │                              │
  │    refreshToken (30d, new) }      │                              │
```

---

## API Endpoints

### `POST /auth/register`

Registers a new client. Returns credentials that grant access to the gateway.

**Request:**
```json
{
  "name": "my-host-agent",
  "capabilities": ["execution", "filesystem"]
}
```

Fields:
- `name` — human-readable label (stored, not validated for uniqueness)
- `capabilities` — list of capability strings the client declares
- `publicKey` _(optional)_ — PEM public key for asymmetric verification

**Response:**
```json
{
  "clientId": "c_<hex>",
  "clientSecret": "<random-secret>",
  "hostId": "<uuid>",
  "namespaceId": "<hex-16>"
}
```

Security notes:
- `namespaceId` is **server-assigned** — never accept from client input
- `clientSecret` is returned **once** and never stored in plaintext (bcrypt hash in store)
- Save `clientSecret` immediately — it cannot be recovered

---

### `POST /auth/token`

Exchanges `clientId` + `clientSecret` for a JWT token pair.

**Request:**
```json
{
  "clientId": "c_<hex>",
  "clientSecret": "<secret>"
}
```

**Response:**
```json
{
  "accessToken": "<jwt>",
  "refreshToken": "<jwt>",
  "expiresIn": 900,
  "tokenType": "Bearer"
}
```

---

### `POST /auth/refresh`

Rotates the token pair using a valid refresh token. The old refresh token is **invalidated immediately** (single-use rotation).

**Request:**
```json
{
  "refreshToken": "<jwt>"
}
```

**Response:** same shape as `/auth/token`.

---

## JWT Payload Schema

### Access Token (HS256, TTL: 15 minutes)

```typescript
{
  sub: string;          // hostId
  namespaceId: string;  // tenant isolation key
  tier: 'free' | 'pro' | 'enterprise';
  type: 'machine' | 'user';
  iat: number;
  exp: number;
}
```

### Refresh Token (HS256, TTL: 30 days)

```typescript
{
  sub: string;    // hostId
  type: 'refresh';
  jti: string;    // UUID — used as store key for rotation
  iat: number;
  exp: number;
}
```

---

## AuthContext

Every authenticated request gets an `AuthContext` injected into the Fastify request object:

```typescript
interface AuthContext {
  type: 'machine' | 'user';
  userId: string;       // hostId from JWT sub
  namespaceId: string;  // tenant isolation key
  tier: 'free' | 'pro' | 'enterprise';
  permissions: string[];
}
```

Access in route handlers:

```typescript
fastify.get('/my-route', async (request) => {
  const auth = request.authContext; // AuthContext | undefined
  if (!auth) { return reply.code(401).send(); }
  // auth.namespaceId — use for all data scoping
});
```

Routes under `/internal/*` use `x-internal-secret` header instead of JWT — they are not accessible from the public internet.

---

## Token Lifecycle

```
Registration
  └─ clientSecret: bcrypt-hashed in store, plaintext returned once

Access Token (15 min)
  └─ Short-lived. On expiry → 401. Client must refresh.

Refresh Token (30 days)
  └─ Single-use rotation: each /auth/refresh invalidates old token, issues new one.
  └─ Stored by jti (UUID) in ICache with TTL.
  └─ If token is replayed after rotation → consumeRefreshToken returns null → 401.
```

---

## Security Properties

| Property | Implementation |
|----------|---------------|
| `clientSecret` never stored plaintext | bcrypt hash in store (`saveClient`) |
| `namespaceId` server-assigned | Generated via `randomBytes(16).toString('hex')` at registration |
| Refresh token rotation | `consumeRefreshToken` atomically deletes old token before issuing new one |
| JWT tokens not logged | `redactQueryToken()` strips `?access_token=` from access logs |
| CORS not reflected | Gateway sets `origin: false` — no `Access-Control-Allow-Origin` echo |
| Internal routes auth | `x-internal-secret` header required, checked before JWT middleware |

---

## Usage Example

```bash
# Register
CREDS=$(curl -s -X POST http://localhost:4000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"my-agent","capabilities":[]}')

CLIENT_ID=$(echo $CREDS | jq -r '.clientId')
CLIENT_SECRET=$(echo $CREDS | jq -r '.clientSecret')

# Get token
TOKEN=$(curl -s -X POST http://localhost:4000/auth/token \
  -H "Content-Type: application/json" \
  -d "{\"clientId\":\"$CLIENT_ID\",\"clientSecret\":\"$CLIENT_SECRET\"}" \
  | jq -r '.accessToken')

# Use token
curl -s http://localhost:4000/health \
  -H "Authorization: Bearer $TOKEN" | jq .

# Refresh (when access token expires)
REFRESH=$(curl -s -X POST http://localhost:4000/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}" | jq -r '.accessToken')
```

---

## Configuration

JWT secret is required in production — gateway throws a fatal error at startup if `GATEWAY_JWT_SECRET` is not set when `NODE_ENV=production`.

```bash
# Generate a strong secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Set via environment variable:
```bash
GATEWAY_JWT_SECRET=<64-byte-hex> kb-dev start gateway
```

See [Architecture Guide](../../../../docs/ARCHITECTURE-GUIDE.md) for full environment variable reference.
