/**
 * Document-backed implementation of `IHostStore`.
 *
 * The gateway used to talk directly to a SQL adapter — that path is gone.
 * Storage now goes through the platform's document database abstraction
 * (`IDocumentDatabase`), so the same code runs on sqlite locally and any
 * future driver (postgres-JSONB, mongo) in production without changes.
 *
 * Schema:
 * - `hosts` collection — one document per host, identified by the
 *   `(hostId, namespaceId)` pair (unique compound index).
 * - `host_tokens` collection — one document per machine token, with a
 *   unique index on `token` and a secondary index on
 *   `(hostId, namespaceId)` so cascading delete from `hosts` is cheap.
 *
 * The collections are declared with `ensureCollection` on first use; the
 * call is idempotent so repeated boots don't churn the indexes.
 */

import type {
  IDocumentDatabase,
  BaseDocument,
} from '@kb-labs/core-platform/adapters';
import type { IHostStore, HostDescriptor } from '@kb-labs/gateway-contracts';

const HOSTS_COLLECTION = 'hosts';
const TOKENS_COLLECTION = 'host_tokens';

interface HostDoc extends BaseDocument {
  hostId: string;
  namespaceId: string;
  name: string;
  capabilities: HostDescriptor['capabilities'];
  hostType?: HostDescriptor['hostType'];
  workspaces?: HostDescriptor['workspaces'];
  plugins?: HostDescriptor['plugins'];
}

interface TokenDoc extends BaseDocument {
  token: string;
  hostId: string;
  namespaceId: string;
}

const docToDescriptor = (doc: HostDoc): HostDescriptor => ({
  hostId: doc.hostId,
  name: doc.name,
  namespaceId: doc.namespaceId,
  capabilities: doc.capabilities,
  // Persisted hosts surface as offline until the in-memory cache sees them
  // again. The cache layer (HostRegistryCache) flips status on liveness.
  status: 'offline',
  lastSeen: doc.updatedAt,
  connections: [],
  hostType: doc.hostType,
  workspaces: doc.workspaces,
  plugins: doc.plugins,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

export class HostStore implements IHostStore {
  private initialised: Promise<void> | null = null;

  constructor(private readonly docs: IDocumentDatabase) {}

  private async ensureSchema(): Promise<void> {
    if (!this.initialised) {
      this.initialised = (async () => {
        await this.docs.ensureCollection(HOSTS_COLLECTION, {
          indexes: [
            // Compound unique index acts as the logical primary key.
            { path: ['hostId', 'namespaceId'], unique: true },
            { path: 'namespaceId' },
          ],
        });
        await this.docs.ensureCollection(TOKENS_COLLECTION, {
          indexes: [
            { path: 'token', unique: true },
            { path: ['hostId', 'namespaceId'] },
          ],
        });
      })();
    }
    await this.initialised;
  }

  async save(descriptor: HostDescriptor): Promise<void> {
    await this.ensureSchema();
    const now = Date.now();
    await this.docs.updateOne<HostDoc>(
      HOSTS_COLLECTION,
      { $and: [{ hostId: { $eq: descriptor.hostId } }, { namespaceId: { $eq: descriptor.namespaceId } }] },
      {
        $set: {
          hostId: descriptor.hostId,
          namespaceId: descriptor.namespaceId,
          name: descriptor.name,
          capabilities: descriptor.capabilities,
          hostType: descriptor.hostType,
          workspaces: descriptor.workspaces,
          plugins: descriptor.plugins,
          // updatedAt is bumped by the driver; createdAt seed only matters on insert.
          ...(descriptor.createdAt !== undefined ? { createdAt: descriptor.createdAt } : { createdAt: now }),
        },
      },
      { upsert: true },
    );
  }

  async get(hostId: string, namespaceId: string): Promise<HostDescriptor | null> {
    await this.ensureSchema();
    const [doc] = await this.docs.find<HostDoc>(
      HOSTS_COLLECTION,
      { $and: [{ hostId: { $eq: hostId } }, { namespaceId: { $eq: namespaceId } }] },
      { limit: 1 },
    );
    return doc ? docToDescriptor(doc) : null;
  }

  async list(namespaceId: string): Promise<HostDescriptor[]> {
    await this.ensureSchema();
    const docs = await this.docs.find<HostDoc>(
      HOSTS_COLLECTION,
      { namespaceId: { $eq: namespaceId } },
      { sort: { createdAt: 1 } },
    );
    return docs.map(docToDescriptor);
  }

  async listAll(): Promise<HostDescriptor[]> {
    await this.ensureSchema();
    const docs = await this.docs.find<HostDoc>(
      HOSTS_COLLECTION,
      {},
      { sort: { namespaceId: 1, createdAt: 1 } },
    );
    return docs.map(docToDescriptor);
  }

  async delete(hostId: string, namespaceId: string): Promise<boolean> {
    await this.ensureSchema();
    // Cascade tokens first so we never have a dangling token pointing at a
    // host that no longer exists.
    await this.docs.deleteMany<TokenDoc>(
      TOKENS_COLLECTION,
      { $and: [{ hostId: { $eq: hostId } }, { namespaceId: { $eq: namespaceId } }] },
    );
    const removed = await this.docs.deleteMany<HostDoc>(
      HOSTS_COLLECTION,
      { $and: [{ hostId: { $eq: hostId } }, { namespaceId: { $eq: namespaceId } }] },
    );
    return removed > 0;
  }

  async saveToken(token: string, hostId: string, namespaceId: string): Promise<void> {
    await this.ensureSchema();
    await this.docs.updateOne<TokenDoc>(
      TOKENS_COLLECTION,
      { token: { $eq: token } },
      { $set: { token, hostId, namespaceId } },
      { upsert: true },
    );
  }

  async resolveToken(token: string): Promise<{ hostId: string; namespaceId: string } | null> {
    await this.ensureSchema();
    const [doc] = await this.docs.find<TokenDoc>(
      TOKENS_COLLECTION,
      { token: { $eq: token } },
      { limit: 1 },
    );
    return doc ? { hostId: doc.hostId, namespaceId: doc.namespaceId } : null;
  }

  async deleteToken(token: string): Promise<void> {
    await this.ensureSchema();
    await this.docs.deleteMany<TokenDoc>(TOKENS_COLLECTION, { token: { $eq: token } });
  }
}
