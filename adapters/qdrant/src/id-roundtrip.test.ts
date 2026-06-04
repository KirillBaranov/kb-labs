import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Regression: the vector store MUST round-trip the caller's id.
 *
 * Qdrant point ids must be UUID/uint, so the adapter hashes the caller's id
 * one-way (`stringToUUID`). Before the fix it returned that UUID from search —
 * so a consumer correlating results by id (e.g. mind fusing vector hits back to
 * their chunk records via `byId.get(id)`) silently dropped EVERY vector result,
 * collapsing hybrid retrieval to BM25-only. These tests pin the round-trip.
 */

// In-memory fake of @qdrant/js-client-rest: upsert stores points, search /
// retrieve / scroll echo them back with their payloads (incl. the reserved id).
const store = new Map<string | number, { id: string | number; vector: number[]; payload: Record<string, unknown> }>();

vi.mock("@qdrant/js-client-rest", () => ({
  QdrantClient: class {
    async getCollections() {
      return { collections: [] };
    }
    async createCollection() {
      return true;
    }
    async upsert(_c: string, { points }: { points: Array<{ id: string | number; vector: number[]; payload: Record<string, unknown> }> }) {
      for (const p of points) {
        store.set(p.id, p);
      }
      return { status: "completed" };
    }
    async search() {
      return [...store.values()].map((p) => ({ id: p.id, score: 0.9, payload: p.payload }));
    }
    async retrieve(_c: string, { ids }: { ids: Array<string | number> }) {
      return ids.map((id) => store.get(id)).filter(Boolean);
    }
    async scroll() {
      return { points: [...store.values()] };
    }
  },
}));

import { QdrantVectorStore } from "./index";

describe("QdrantVectorStore — id round-trip", () => {
  beforeEach(() => store.clear());

  const original = "src/Feature/Service.cs#10-42";

  it("search returns the caller's original id, not the internal UUID", async () => {
    const vs = new QdrantVectorStore({ url: "http://localhost:6333", dimension: 3 });
    await vs.upsert([{ id: original, vector: [0.1, 0.2, 0.3], metadata: { path: "src/Feature/Service.cs" } }]);

    const hits = await vs.search([0.1, 0.2, 0.3], 5);

    expect(hits[0]?.id).toBe(original);
    expect(hits[0]?.id).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/); // not a UUID
  });

  it("does not leak the reserved id key into returned metadata", async () => {
    const vs = new QdrantVectorStore({ url: "http://localhost:6333", dimension: 3 });
    await vs.upsert([{ id: original, vector: [0.1, 0.2, 0.3], metadata: { path: "src/Feature/Service.cs" } }]);

    const hits = await vs.search([0.1, 0.2, 0.3], 5);

    expect(hits[0]?.metadata).toEqual({ path: "src/Feature/Service.cs" });
    expect(Object.keys(hits[0]?.metadata ?? {}).some((k) => k.startsWith("__kb"))).toBe(false);
  });
});
