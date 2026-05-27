# KB Labs — nginx template

Drop-in nginx configuration for fronting a self-hosted KB Labs deployment.

Includes:

- `sites/` — per-service `server` blocks for the KB Labs services that
  expose HTTP (gateway, web, docs, studio). Each one has `{{ PLACEHOLDERS }}`
  for the domain, upstream port, and certificate paths.
- `snippets/` — reusable `proxy_set_header` / error-handling blocks.
- `error-pages/` — generic "service unavailable" HTML/JSON.

This is **a starting point**, not a finished deployment. Copy it into your
own infrastructure repository (private), fill in the placeholders, deploy
however you ship configs to your edge (Ansible, GitHub Actions, plain rsync).

## Why a template, not a script

KB Labs doesn't try to own your edge. Teams already have opinions on
nginx vs caddy vs traefik, on Let's Encrypt vs corporate CA, on
single-server vs k8s ingress. The template hands you a sane reference
config you can adapt — it does not run `apt install nginx` on your host.

If you want zero-config: see `deploy.yaml` (ADR-0014) for the declarative
delivery flow that ships KB Labs services themselves. The nginx layer in
front of them stays your call.

## Quick start

```bash
# Copy into your infra repo
cp -r templates/nginx /path/to/your-infra-repo/nginx
cd /path/to/your-infra-repo/nginx

# Render placeholders. Pick whatever tool you like — here's a one-liner
# using envsubst from gettext (no extra deps on most Linux/macOS).
export KB_DOMAIN=kblabs.example.com
export KB_GATEWAY_PORT=4000
export KB_WEB_PORT=3000
export KB_DOCS_PORT=3001
export KB_CERT_PATH=/etc/letsencrypt/live/kblabs.example.com

for f in sites/*.tmpl; do
  envsubst < "$f" > "${f%.tmpl}.conf"
done
```

## File layout (after rendering)

```
nginx/
├── sites/
│   ├── gateway.conf          → api.<your-domain>     → :4000
│   ├── web.conf              → <your-domain>         → :3000
│   ├── docs.conf             → docs.<your-domain>    → :3001
│   └── studio.conf           → studio.<your-domain>  → :3002 (when deployed)
├── snippets/
│   ├── proxy-common.conf     # include inside `location` blocks
│   ├── error-pages.conf      # include inside `server` blocks
│   └── maps.conf             # load from /etc/nginx/conf.d/
└── error-pages/
    ├── 5xx.html              # branded "temporarily unavailable"
    └── 5xx.json              # JSON variant for API clients
```

## Deploying to /etc/nginx

Snippets go under a kb-labs-scoped subdir so they don't clash with anything
you already have:

```bash
sudo install -d /etc/nginx/snippets/kb-labs
sudo install -m 0644 snippets/proxy-common.conf  /etc/nginx/snippets/kb-labs/
sudo install -m 0644 snippets/error-pages.conf   /etc/nginx/snippets/kb-labs/
sudo install -m 0644 snippets/maps.conf          /etc/nginx/conf.d/kb-maps.conf
sudo install -d /var/www/kb-errors
sudo cp error-pages/* /var/www/kb-errors/
sudo chown -R www-data:www-data /var/www/kb-errors

# Site configs (only the ones you actually use)
sudo install -m 0644 sites/*.conf /etc/nginx/sites-available/
for f in sites/*.conf; do
  sudo ln -sf "/etc/nginx/sites-available/$(basename "$f")" \
              "/etc/nginx/sites-enabled/$(basename "$f" .conf)"
done

sudo nginx -t && sudo systemctl reload nginx
```

## Customising the error page

`error-pages/5xx.html` is intentionally minimal and unbranded. Edit it to
match your product — change the title, drop in your logo, adjust colors.
The structural pieces that matter (request id, `Accept`-based JSON fallback)
live in `snippets/error-pages.conf`, not in the HTML.

## See also

- KB Labs control plane docs: <https://kblabs.ru>
- `templates/deploy/deploy.yaml` — declarative service delivery (ADR-0014)
