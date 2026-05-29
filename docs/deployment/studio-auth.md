# Studio Auth — Deployment Guide (ADR-0020)

This document covers environment variables, bootstrap admin setup, wildcard SSL, nginx
configuration, and the production readiness checklist for Studio auth.

---

## Environment Variables

All auth-related env vars are read by the Gateway process (`plugins/gateway/app/`).

### Required

| Variable | Description | Example |
|---|---|---|
| `AUTH_JWT_ACCESS_SECRET` | HMAC-SHA256 secret for access tokens (min 32 chars) | `changeme-access-32chars-minimum!!` |
| `AUTH_JWT_REFRESH_SECRET` | HMAC-SHA256 secret for refresh tokens (different from access) | `changeme-refresh-32chars-minimum!` |
| `AUTH_BOOTSTRAP_ADMIN_EMAIL` | Email of the first admin user (created on first start) | `admin@kb-cloud.yourcompany.ru` |
| `AUTH_BOOTSTRAP_ADMIN_PASSWORD` | Password for bootstrap admin (bcrypt cost 12) | `ChangeMe-VeryStrong123!` |
| `AUTH_BOOTSTRAP_TENANT_ID` | Tenant slug (must match your subdomain) | `kb-cloud` |

### Optional (with defaults)

| Variable | Default | Description |
|---|---|---|
| `AUTH_SESSION_ACCESS_TTL` | `15m` | Access token lifetime |
| `AUTH_SESSION_REFRESH_TTL` | `30d` | Refresh token lifetime |
| `AUTH_INVITE_TTL` | `7d` | Invite link expiry |
| `AUTH_REFRESH_GRACE_WINDOW_SEC` | `5` | Grace window for parallel refresh (CD-5) |
| `AUTH_BCRYPT_COST` | `12` | bcrypt cost factor for password hashing |
| `AUTH_COOKIE_SECURE` | `true` | Set `Secure` flag on all auth cookies (disable only for local HTTP dev) |
| `AUTH_RATE_LIMIT_LOGIN_IP` | `10/m` | Max login attempts per IP per minute |
| `AUTH_RATE_LIMIT_LOGIN_EMAIL` | `5/m` | Max login attempts per email per minute |
| `AUTH_RATE_LIMIT_ACTIVATE_IP` | `20/h` | Max activation attempts per IP per hour |
| `AUTH_HIBP_ENABLED` | `true` | Check passwords against HaveIBeenPwned API |
| `AUTH_TENANT_PATTERN` | `{tenant}.kblabs.ru` | Subdomain pattern for tenant extraction |

### E2E / Testing Only

| Variable | Description |
|---|---|
| `AUTH_ACCESS_TTL_SEC` | Override access TTL in seconds (for fast-expiry tests) |
| `AUTH_REFRESH_TTL_SEC` | Override refresh TTL in seconds |
| `AUTH_INVITE_TTL_MS` | Override invite TTL in milliseconds |

---

## Bootstrap Admin

The bootstrap admin is created automatically on the **first gateway start** when the env vars
are present. The process is **idempotent** — restarting the gateway will not create duplicate
accounts.

```bash
# Check if bootstrap ran correctly (gateway logs on startup)
kb-dev logs gateway | grep "bootstrap"
# → "bootstrap: admin user created for tenant kb-cloud"
# → or: "bootstrap: admin user already exists — skipping"
```

If you need to reset the admin password:
1. Connect to the database directly (SQLite: `/workspace/.kb/data/gateway.db`)
2. Delete the `credentials` row for the admin user's `userId`
3. Restart the gateway — bootstrap will re-create it from env vars

---

## Wildcard SSL

Auth cookies require `Secure` attribute, which requires HTTPS. Set up wildcard SSL for `*.kblabs.ru`:

```bash
# DNS-01 challenge (works with Cloudflare — see Phase 3 infra docs)
certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /etc/cloudflare/credentials.ini \
  -d "*.kblabs.ru" \
  -d "kblabs.ru"

# Verify
openssl s_client -connect kb-cloud.kblabs.ru:443 -servername kb-cloud.kblabs.ru \
  | openssl x509 -noout -subject -issuer
```

Auto-renewal:
```bash
# /etc/cron.d/certbot-renew
0 3 * * * root certbot renew --quiet --post-hook "nginx -s reload"
```

---

## nginx Configuration

nginx is the single entry point for each tenant subdomain. It serves Studio SPA and proxies
`/api/` to the Gateway process.

```nginx
# /etc/nginx/sites-enabled/tenant-wildcard.conf
server {
    listen 443 ssl http2;
    server_name ~^(?<tenant>[a-z0-9-]{2,40})\.kblabs\.ru$;

    ssl_certificate     /etc/letsencrypt/live/kblabs.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/kblabs.ru/privkey.pem;

    # Security headers
    add_header Referrer-Policy  "no-referrer"   always;
    add_header X-Frame-Options  "DENY"          always;
    add_header X-Content-Type-Options "nosniff" always;

    # Studio SPA (client-side routing → index.html fallback)
    location / {
        root  /var/www/studio/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Gateway API — trust-proxy headers passed through (CD-10)
    location /api/ {
        proxy_pass         http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_pass_header  Set-Cookie;
    }
}

# HTTP → HTTPS redirect
server {
    listen 80;
    server_name ~^[a-z0-9-]{2,40}\.kblabs\.ru$;
    return 301 https://$host$request_uri;
}
```

Reserved subdomains (`api`, `www`, `docs`, `mail`, `admin`, `static`, `cdn`) need their own
server blocks **before** the wildcard block so they take precedence.

### Deploy Studio

```bash
# Build
pnpm --filter @kb-labs/studio-app build

# Deploy (adjust path as needed)
rsync -av --delete studio/app/dist/ vps:/var/www/studio/dist/
nginx -t && nginx -s reload
```

---

## Trust-Proxy (CD-10)

The Gateway is started with `trustProxy: true` (Fastify). nginx must send the real client IP:

```nginx
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header X-Real-IP         $remote_addr;
```

Verify in gateway logs: each request should show the real client IP, not `127.0.0.1`.

---

## Cookie Attributes (verified by AUTH-02, AUTH-29)

| Cookie | HttpOnly | Secure | SameSite | Path | TTL |
|---|---|---|---|---|---|
| `kb_access` | ✅ | ✅ | Strict | `/` | 15m |
| `kb_refresh` | ✅ | ✅ | Strict | `/api/auth/refresh` | 30d |
| `kb_csrf` | ❌ (JS-readable) | ✅ | Strict | `/` | 30d |

No `Domain` attribute — cookies are origin-scoped to `{tenant}.kblabs.ru` automatically.

---

## Production Readiness Checklist

### Before first deploy

- [ ] `AUTH_JWT_ACCESS_SECRET` and `AUTH_JWT_REFRESH_SECRET` are unique, 32+ chars, stored in secrets manager
- [ ] `AUTH_BOOTSTRAP_ADMIN_PASSWORD` is strong and changed after first login
- [ ] Wildcard SSL certificate is valid: `openssl s_client -connect kb-cloud.kblabs.ru:443`
- [ ] nginx wildcard config applied, reserved subdomains have own server blocks
- [ ] `AUTH_COOKIE_SECURE=true` (default) — never disable in production
- [ ] `AUTH_HIBP_ENABLED=true` (default) — outbound HTTPS to `api.pwnedpasswords.com` allowed

### After first deploy (manual smoke test)

- [ ] `curl -i https://kb-cloud.kblabs.ru/api/auth/providers` → 200 with wildcard cert
- [ ] Login via browser → cookies present with HttpOnly/Secure/SameSite=Strict
- [ ] No `role` field in `/api/auth/me` response (CD-3)
- [ ] Cross-tenant guard: `curl -H "Host: other-tenant.kblabs.ru" https://kb-cloud.kblabs.ru/api/auth/me` with tenant-A cookies → 401
- [ ] `password123` on invite activation → 400 with "pwned" reason (HIBP working)
- [ ] Gateway logs show real client IPs (not `127.0.0.1`)
- [ ] Security events (`failed-login`, `refresh-reuse-detected`, `csrf-failed`) appear in gateway logs with structured fields

### Ongoing

- [ ] Certbot auto-renewal cron is active: `crontab -l | grep certbot`
- [ ] Gateway memory usage is stable after 1h (LRU cache for user status checks, CD-1)
- [ ] Bootstrap admin runs idempotent on every restart (no duplicate users in DB)

---

## Invite Flow (no email, admin-only)

1. Admin opens `/admin/invites`
2. Fills the email, clicks **Send invite**
3. Activation URL is shown in the UI (copied to clipboard via `navigator.clipboard`)
4. Admin shares the URL with the invited user out-of-band (Slack, email, etc.)
5. User opens the URL, sets a password → auto-logged in as `tenant-member`

The URL contains a one-time token. After activation the token is consumed and the URL
becomes invalid (AUTH-15). Invites expire after `AUTH_INVITE_TTL` (default 7 days, AUTH-14).

---

## Tenant Provisioning

Currently tenants are bootstrapped from env vars only. There is no tenant provisioning UI.

To add a new tenant:
1. Set `AUTH_BOOTSTRAP_TENANT_ID=new-tenant` + `AUTH_BOOTSTRAP_ADMIN_EMAIL/PASSWORD`
2. Restart the gateway — the admin user for the new tenant is created
3. Add a DNS A record for `new-tenant.kblabs.ru` → the VPS IP
4. The wildcard nginx config picks it up automatically

---

## What is NOT implemented in this iteration

See `docs/adr/ADR-0020-identity-and-authentication.md` § "What we are NOT doing" for the
complete list. Key items:

- No password reset via email (admin must re-invite the user)
- No 2FA / MFA
- No SSO / OAuth2 / OIDC
- No account lockout (would be a DoS vector)
- No real-time audit log (security events are in gateway logs only)
- No tenant provisioning UI
