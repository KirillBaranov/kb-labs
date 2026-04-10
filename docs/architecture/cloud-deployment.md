# KB Labs Cloud Deployment Architecture

## 🏗️ Oracle Cloud Free Tier Setup

```
┌─────────────────────────────────────────────────────────────┐
│                   Oracle Cloud Free Tier                     │
│                  (Frankfurt / Ashburn)                        │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  VM.Standard.A1.Flex (ARM)                          │    │
│  │  • 4 vCPU                                           │    │
│  │  • 24 GB RAM                                        │    │
│  │  • 200 GB SSD                                       │    │
│  │  • Ubuntu 22.04                                     │    │
│  │                                                      │    │
│  │  ┌──────────────────────────────────────────┐      │    │
│  │  │  Docker Containers                        │      │    │
│  │  │                                           │      │    │
│  │  │  ┌─────────────┐  ┌─────────────┐       │      │    │
│  │  │  │   MinIO     │  │   Qdrant    │       │      │    │
│  │  │  │  (S3 API)   │  │  (Vectors)  │       │      │    │
│  │  │  │  Port 9000  │  │  Port 6333  │       │      │    │
│  │  │  │  Port 9001  │  │             │       │      │    │
│  │  │  └─────────────┘  └─────────────┘       │      │    │
│  │  │                                           │      │    │
│  │  │  ┌─────────────┐  ┌─────────────┐       │      │    │
│  │  │  │   Redis     │  │  MongoDB    │       │      │    │
│  │  │  │  (Cache)    │  │  (Docs)     │       │      │    │
│  │  │  │  Port 6379  │  │  Port 27017 │       │      │    │
│  │  │  └─────────────┘  └─────────────┘       │      │    │
│  │  │                                           │      │    │
│  │  └──────────────────────────────────────────┘      │    │
│  │                                                      │    │
│  │  Persistent Storage:                                │    │
│  │  • ~/kb-labs-cloud/data/minio     (files)          │    │
│  │  • ~/kb-labs-cloud/data/qdrant    (vectors)        │    │
│  │  • ~/kb-labs-cloud/data/redis     (cache)          │    │
│  │  • ~/kb-labs-cloud/data/mongodb   (docs)           │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
│  Public IP: 123.45.67.89                                     │
│  Cost: $0/month (Always Free)                                │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ Internet
                              │
        ┌─────────────────────┴─────────────────────┐
        │                                           │
        ▼                                           ▼
┌───────────────┐                           ┌───────────────┐
│   Mac Device  │                           │ Windows Device│
│               │                           │               │
│  KB Labs CLI  │                           │  KB Labs CLI  │
│  • Storage ───┼──────────────────────────>│  • Storage    │
│    → MinIO    │       Same Config         │    → MinIO    │
│  • Mind RAG ──┼──────────────────────────>│  • Mind RAG   │
│    → Qdrant   │       Shared Data         │    → Qdrant   │
│  • Cache      │                           │  • Cache      │
│    → Redis    │                           │    → Redis    │
└───────────────┘                           └───────────────┘
```

---

## 🔄 Data Flow

### Upload Flow (Mac → Oracle)

```
1. User runs: pnpm kb storage write file.txt

2. KB Labs → @kb-labs/adapters-s3

3. S3 Adapter → MinIO API (http://123.45.67.89:9000)

4. MinIO → Stores in ~/kb-labs-cloud/data/minio/kb-labs-storage/file.txt

5. File persisted on Oracle Cloud 200 GB SSD ✅
```

### Download Flow (Windows → Oracle)

```
1. User runs: pnpm kb storage read file.txt

2. KB Labs → @kb-labs/adapters-s3

3. S3 Adapter → MinIO API (http://123.45.67.89:9000)

4. MinIO → Returns ~/kb-labs-cloud/data/minio/kb-labs-storage/file.txt

5. File downloaded to Windows ✅
```

### Mind RAG Search Flow

```
1. User runs: pnpm kb mind rag-query --text "..." --agent

2. Mind Engine → Embed query → @kb-labs/adapters-qdrant

3. Qdrant Adapter → Vector search (http://123.45.67.89:6333)

4. Qdrant → Returns top K chunks from ~/kb-labs-cloud/data/qdrant/

5. Results displayed to user ✅
```

---

## 📊 Resource Allocation

### Oracle VM (24 GB RAM)

```
Service        | RAM   | CPU  | Disk  | Purpose
---------------|-------|------|-------|---------------------------
MinIO          | 2 GB  | 0.5  | 50 GB | File storage (S3 API)
Qdrant         | 8 GB  | 1.0  | 50 GB | Vector database (Mind RAG)
Redis          | 1 GB  | 0.2  | 1 GB  | Cache
MongoDB        | 2 GB  | 0.5  | 20 GB | Document storage
System/Buffer  | 10 GB | 1.8  | 79 GB | OS + headroom
---------------|-------|------|-------|---------------------------
TOTAL          | 23 GB | 4.0  | 200GB | Always Free Limits ✅
```

**Headroom:** 10 GB RAM free for spikes and future services

---

## 🔐 Security Architecture

### Network Security

```
┌─────────────────────────────────────────────────────┐
│  Internet                                            │
└───────────────────┬──────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│  Oracle Cloud Security List (Firewall)              │
│  • Allow: TCP 22 (SSH)                              │
│  • Allow: TCP 9000, 9001 (MinIO)                    │
│  • Allow: TCP 6333 (Qdrant)                         │
│  • Allow: TCP 6379 (Redis)                          │
│  • Allow: TCP 27017 (MongoDB)                       │
│  • Deny: Everything else                            │
└───────────────────┬──────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│  Ubuntu Firewall (iptables)                         │
│  • Disabled for simplicity                          │
│  • Can enable for extra security                    │
└───────────────────┬──────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│  Application Authentication                         │
│  • MinIO: admin + password                          │
│  • Qdrant: API key                                  │
│  • Redis: password                                  │
│  • MongoDB: username + password                     │
└─────────────────────────────────────────────────────┘
```

### Enhanced Security (Optional)

#### Option A: Tailscale VPN

```
┌─────────────┐          ┌─────────────┐          ┌─────────────┐
│  Mac Device │          │  Tailscale  │          │ Windows Dev │
│             │◄────────►│   Network   │◄────────►│             │
└─────────────┘          └──────┬──────┘          └─────────────┘
                                │
                                │ Encrypted WireGuard Tunnel
                                │
                         ┌──────▼──────┐
                         │ Oracle VM   │
                         │ (Private)   │
                         └─────────────┘

Benefits:
• No public internet exposure
• End-to-end encryption
• No firewall rules needed
• Access from anywhere
```

#### Option B: SSH Tunnels

```bash
# On Mac/Windows
ssh -i ~/.ssh/oracle_cloud \
    -L 9000:localhost:9000 \
    -L 6333:localhost:6333 \
    -L 6379:localhost:6379 \
    ubuntu@123.45.67.89

# Access via localhost
# http://localhost:9000 → MinIO
# http://localhost:6333 → Qdrant
```

#### Option C: IP Whitelist

```
Oracle Security List:
• Source: YOUR_HOME_IP/32 (Mac)
• Source: YOUR_WORK_IP/32 (Windows)
• Deny all other IPs
```

---

## 💾 Backup Strategy

### Automated Daily Backups

```
┌──────────────────────────────────────────────────────┐
│  Cron Job (2:00 AM daily)                            │
│  ~/backup.sh                                         │
└───────────────────┬──────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────┐
│  Compress Data                                       │
│  tar -czf backup-20260217.tar.gz data/               │
└───────────────────┬──────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────┐
│  Store on VM (7 days retention)                      │
│  ~/backups/backup-20260217.tar.gz                    │
└───────────────────┬──────────────────────────────────┘
                    │
                    ▼ (Optional)
┌──────────────────────────────────────────────────────┐
│  Upload to External Storage                          │
│  • Backblaze B2 (10 GB free)                         │
│  • Personal Google Drive                             │
│  • Local Mac via rsync                               │
└──────────────────────────────────────────────────────┘
```

### Manual Backup

```bash
# SSH to VM
ssh ubuntu@123.45.67.89

# Backup to local Mac
rsync -avz ubuntu@123.45.67.89:~/kb-labs-cloud/data/ ~/kb-labs-backup/
```

---

## 📈 Scaling Path

### Current: Solo Dev ($0/month)

```
Oracle Free Tier (24 GB RAM)
├── Dev usage only
├── 1-2 concurrent users (you)
└── ~1000 Mind RAG queries/day
```

### Future: Small Team ($5-10/month)

```
Hetzner VPS (4 GB → 8 GB RAM)
├── 2-5 users
├── ~10K queries/day
└── Add PostgreSQL for better DB
```

### Future: Production SaaS ($50-200/month)

```
Managed Services
├── AWS S3 (storage)
├── Qdrant Cloud (vectors)
├── ElastiCache (Redis)
├── RDS PostgreSQL (DB)
└── Multi-region deployment
```

---

## 🎯 Performance Expectations

### Network Latency (from Mac/Windows to Oracle)

| Your Location | Oracle Region | Latency | Good For |
|---------------|---------------|---------|----------|
| Europe | Frankfurt | ~20-50ms | ✅ Excellent |
| US East | Ashburn | ~20-50ms | ✅ Excellent |
| US West | Ashburn | ~80-120ms | ⚠️ OK |
| Asia | Tokyo | ~50-100ms | ✅ Good |
| Russia | Frankfurt | ~50-150ms | ⚠️ OK |

### Operation Performance

| Operation | Latency | Throughput |
|-----------|---------|------------|
| MinIO Upload (1 MB file) | ~100-300ms | ~5-10 MB/s |
| MinIO Download (1 MB) | ~50-150ms | ~10-20 MB/s |
| Qdrant Search (1 query) | ~20-100ms | ~50-100 QPS |
| Redis Get/Set | ~10-50ms | ~1000 ops/s |

**Conclusion:** Good enough for personal use, acceptable latency for most operations.

---

## 💰 Cost Monitoring

### Always Free vs Pay As You Go

```
┌─────────────────────────────────────────────────────┐
│  Your Usage (Always Free)                           │
│  ✅ VM: VM.Standard.A1.Flex (4 OCPU, 24 GB)         │
│  ✅ Storage: 200 GB Block Volume                    │
│  ✅ Network: ~1 GB/month egress                     │
│  ────────────────────────────────────────────────   │
│  Monthly Cost: $0.00                                │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  If You Exceed (Pay As You Go)                      │
│  ❌ VM: Upgrade to 8 OCPU → $15/month              │
│  ❌ Storage: 500 GB → $2.50/month                   │
│  ❌ Network: 100 GB egress → $0.85/month            │
│  ────────────────────────────────────────────────   │
│  Monthly Cost: ~$18/month                           │
└─────────────────────────────────────────────────────┘
```

**Safety:** You'll get email warning before any charges!

---

## 🔧 Maintenance

### Weekly Tasks

- Check disk usage: `df -h`
- Check Docker status: `docker-compose ps`
- Review logs: `docker-compose logs --tail=100`

### Monthly Tasks

- Update system: `sudo apt update && sudo apt upgrade`
- Update Docker images: `docker-compose pull && docker-compose up -d`
- Verify backups: `ls -lh ~/backups/`

### Quarterly Tasks

- Review security list (IP whitelist)
- Rotate passwords
- Check Oracle billing dashboard (should be $0)

---

**Last Updated:** 2026-02-17
**Architecture Version:** 1.0
**Next Review:** After S3 adapter implementation
