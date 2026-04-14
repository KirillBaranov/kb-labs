# openai-proxy-vps

Transparent forward proxy to `api.openai.com`, hosted on an Aeza VPS in Helsinki.
Replaces the previous Cloudflare Worker (`infra/openai-proxy/`) which had no
control over egress region.

## Why

Cloudflare Workers run at the PoP closest to the caller; for callers in RF that
meant a Russian/Finnish Cloudflare edge which OpenAI sometimes rate-limits or
blocks. This VPS is a fixed-region Helsinki egress — stable IP, no surprises.

## What it does

Dumb HTTP forwarder. No auth, no API key injection — the caller sends their own
`Authorization: Bearer <OPENAI_KEY>` header. We just:

1. Strip identity/forwarding headers so OpenAI sees our IP, not the caller's
2. Forward path/method/body as-is to `https://api.openai.com`
3. Stream the response back

## Configuration

- `PORT` (default `8080`)

## Deploying

Host connection is in your local `~/.ssh/config` as `aeza-proxy` (see the
`aeza-proxy` skill). Do not hardcode the IP here.

```bash
scp infra/openai-proxy-vps/server.js aeza-proxy:/opt/openai-proxy/
ssh aeza-proxy 'systemctl restart openai-proxy'
ssh aeza-proxy 'systemctl status openai-proxy'
```

## Server layout

- `/opt/openai-proxy/server.js` — this file, deployed
- `/etc/systemd/system/openai-proxy.service` — systemd unit
- Node.js 22 via NodeSource

## Using from a client

Set `OPENAI_PROXY_URL` in the caller's env to `http://<ip>:8080/v1` and point
any OpenAI-compatible client's `baseURL` at it.
