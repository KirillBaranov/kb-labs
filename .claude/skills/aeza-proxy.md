---
name: aeza-proxy
description: Connect to the Aeza VPS (Helsinki) hosting the OpenAI proxy
globs:
  - "infra/openai-proxy-fly/**"
  - "infra/openai-proxy/**"
---

# Aeza Proxy VPS

Remote Ubuntu 24.04 VPS on Aeza (Helsinki region) that hosts the OpenAI HTTP proxy.
Used by the VPS in Russia to reach `api.openai.com` through a non-RF egress IP.

## Connecting

SSH key and host are stored locally — do NOT hardcode the IP in tracked files.

Connection details are in:
- `~/.ssh/config` (host alias `aeza-proxy`)
- `~/.claude/projects/-Users-kirillbaranov-Desktop-kb-labs-workspace/memory/project_aeza_proxy.md` (IP, credentials reference)

```bash
ssh aeza-proxy                              # via ~/.ssh/config alias
ssh -i ~/.ssh/aeza_proxy root@<IP>          # explicit, IP from memory
```

The SSH key is `~/.ssh/aeza_proxy` (ed25519). Root login via key only.

## Server details

- OS: Ubuntu 24.04
- Region: Helsinki (HELs-1)
- Resources: 1 vCPU, 2GB RAM, 30GB disk
- Provider panel: https://my.aeza.net/

## Service: openai-proxy

Source code: `infra/openai-proxy-fly/server.js` (Node.js HTTP proxy).
Runs as a systemd unit (details in memory file once deployed).

```bash
# On the server
systemctl status openai-proxy
journalctl -u openai-proxy -f
```

## Deploying changes

Copy `server.js` to the server and restart the unit:

```bash
scp infra/openai-proxy-fly/server.js aeza-proxy:/opt/openai-proxy/
ssh aeza-proxy "systemctl restart openai-proxy"
```

## Secrets

- `OPENAI_API_KEY` — in `/etc/openai-proxy.env` on the server (root-only readable)
- `PROXY_SECRET` — same file; clients send it via `x-proxy-secret` header

Never commit these. Never print them in logs or PRs.

## Important

- IP address must NEVER be committed to the repo or mentioned in tracked docs
- Keep `/etc/openai-proxy.env` permissions at `600`
- UFW should allow only 22 (SSH) and 443 (or the proxy port) inbound
