---
description: Get an auth token from the local gateway for e2e testing
---

# E2E Auth Token

Get an authentication token from the local gateway service for e2e testing.

## Prerequisites

- Gateway service running on localhost:4000
- E2E test user exists (admin@e2e.test)

## Get Token

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/auth/token \
  -H "Content-Type: application/json" \
  -d '{"clientId":"clt_b6dbef185d3da861609a1427983f3b51","clientSecret":"cs_xtn2DriDHSpnFMjFpkeK_o9R0PcWLWwMijBqvb8C4Z8"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")
echo $TOKEN
```

## Alternative: Login Flow

```bash
curl -sf -X POST http://localhost:4000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@e2e.test","password":"E2eBootstrapPass1!","tenantId":"kblabs-cloud"}' \
  -c /tmp/c.txt -o /dev/null

CREDS=$(curl -sf -X POST http://localhost:4000/auth/refresh \
  -H 'Content-Type: application/json' \
  -b /tmp/c.txt)
TOKEN=$(echo $CREDS | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")
```

## Use Token

```bash
curl -s http://localhost:5050/api/v1/routes \
  -H "Authorization: Bearer $TOKEN"
```

## Rules

- Never commit tokens to git
- Tokens expire — refresh if requests return 401
- Use the token endpoint for programmatic access
- Use the login flow for browser-like sessions
