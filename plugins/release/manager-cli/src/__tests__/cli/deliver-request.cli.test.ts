/**
 * `kb release deliver-request` — the one command CI runs.
 *
 * The command is exercised end to end rather than mocked: the `commit-channel`
 * operation touches only the bundle fetcher and the CAS store, both of which are
 * local-file backed, so a real temp directory gives a real run of the real
 * adapter without a registry, a GitHub token or a network.
 *
 * What matters here is the command's contract with the workflow around it — it
 * reads a `kb.release-delivery-request/1` document, refuses anything that is not
 * one *before* an adapter is constructed, and prints `DeliveryEvidence`-shaped
 * JSON — not the delivery semantics, which are covered against the adapters
 * themselves in `shared/__tests__/control-plane-delivery.test.ts`.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DeliveryEvidenceSchema,
  type DeliveryEvidence,
} from '@kb-labs/release-manager-contracts';
import { createCapturedUI, createMockContext, mockCLIInput } from '@kb-labs/sdk/testing';
import { afterEach, describe, expect, it } from 'vitest';

import deliverRequestCommand from '../../cli/commands/deliver-request.js';
import {
  CAS_ABSENT,
  FileCasStore,
  buildDeliveryRequest,
  channelPointerKey,
} from '../../shared/control-plane/index.js';
import { buildDeliveryBundle, sealedPointer } from '../../shared/__tests__/fixtures/delivery-bundle.js';

/** `CommandResult` is a union; only the failing arm carries `error`. */
function errorOf(result: { error?: string } | unknown): string | undefined {
  return (result as { error?: string }).error;
}

const RECEIPT = 'rcpt-cli-1';

const tempDirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kb-release-deliver-cli-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) { rmSync(tempDirs.pop()!, { recursive: true, force: true }); }
});

function scenario(): { bundleDir: string; casDir: string; requestPath: string; pointerSha256: string } {
  const bundleDir = tempDir();
  const casDir = tempDir();
  const bundle = buildDeliveryBundle(bundleDir, { channel: 'stable' });

  const request = buildDeliveryRequest({
    receiptId: RECEIPT,
    candidateId: bundle.candidateId,
    bundleUri: `file://${bundleDir}`,
    bundleSha256: bundle.bundleSha256,
    stepId: 'commit-stable-pointer',
    operation: 'commit-channel',
    targetChannel: 'stable',
    expectedPreviousPointerSha256: null,
    pointerPlanSha256: bundle.pointer.sha256,
  });
  const requestPath = join(tempDir(), 'request.json');
  writeFileSync(requestPath, JSON.stringify(request, null, 2));

  return { bundleDir, casDir, requestPath, pointerSha256: bundle.pointer.sha256 };
}

function write(path: string, value: unknown): string {
  writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  return path;
}

describe('release:deliver-request', () => {
  it('DR-01: executes the request and emits DeliveryEvidence-shaped JSON', async () => {
    const { casDir, requestPath, pointerSha256 } = scenario();
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await deliverRequestCommand.execute(ctx as never, mockCLIInput({
      flags: { request: requestPath, 'cas-dir': casDir, repository: 'kb-labs/kb-labs', 'run-id': '42', json: true },
    }));

    expect(result.ok).toBe(true);
    const payload = captured.json[0] as { ok: boolean; evidence: DeliveryEvidence; mutations: DeliveryEvidence[] };
    expect(payload.ok).toBe(true);
    // The output is a real contract document, not a bag of fields shaped like one.
    const evidence = DeliveryEvidenceSchema.parse(payload.evidence);
    expect(evidence).toMatchObject({
      schema: 'kb.delivery-evidence/1',
      receiptId: RECEIPT,
      operation: 'commit-channel',
      targetChannel: 'stable',
      result: 'succeeded',
    });
    expect(evidence.artifacts[0]!.sha256).toBe(pointerSha256);
    // Run correlation is derived from the request, never from a branch or from
    // "the most recent run" (§6A.5).
    expect(evidence.ciRunId).toBe(`${RECEIPT}:${evidence.candidateId}:commit-stable-pointer:42`);
    // Per-mutation evidence is exposed so a resumed Workflow can read what landed.
    expect(payload.mutations).toHaveLength(1);
  });

  it('DR-02: the pointer really lands in the CAS directory the flag names', async () => {
    const { casDir, requestPath, pointerSha256 } = scenario();
    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    await deliverRequestCommand.execute(ctx as never, mockCLIInput({
      flags: { request: requestPath, 'cas-dir': casDir, repository: 'kb-labs/kb-labs', json: true },
    }));

    const stored = await new FileCasStore(casDir).read(channelPointerKey('stable'));
    expect(stored).not.toBeNull();
    const { canonicalSha256 } = await import('@kb-labs/release-manager-contracts');
    expect(canonicalSha256(JSON.parse(stored!.body) as unknown)).toBe(pointerSha256);
  });

  it('DR-03: a schema-invalid request document is refused before any adapter runs', async () => {
    const { casDir } = scenario();
    // A plausible-looking document with the wrong schema tag and a bad digest.
    const requestPath = write(join(tempDir(), 'bad.json'), {
      schema: 'kb.release-delivery-request/2',
      receiptId: RECEIPT,
      candidateId: 'platform-2.119.0-a',
      bundle: { uri: 'file:///tmp/nope', sha256: 'not-a-digest' },
      operation: 'commit-channel',
    });
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await deliverRequestCommand.execute(ctx as never, mockCLIInput({
      flags: { request: requestPath, 'cas-dir': casDir, repository: 'kb-labs/kb-labs', json: true },
    }));

    expect(result.ok).toBe(false);
    const payload = captured.json[0] as { ok: boolean; error: string };
    expect(payload.ok).toBe(false);
    expect(payload.error).toMatch(/unreadable delivery request/);
    // Nothing was published, staged or written: the CAS directory is untouched.
    expect(new FileCasStore(casDir).keys()).toEqual([]);
  });

  it('DR-04: malformed JSON is rejected the same way, with the parse error attached', async () => {
    const { casDir } = scenario();
    const requestPath = write(join(tempDir(), 'broken.json'), '{ this is not json');
    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });

    const result = await deliverRequestCommand.execute(ctx as never, mockCLIInput({
      flags: { request: requestPath, 'cas-dir': casDir, repository: 'kb-labs/kb-labs', json: true },
    }));

    expect(result.ok).toBe(false);
    expect(errorOf(result)).toMatch(/unreadable delivery request/);
  });

  it('DR-05: missing --request, --repository or --cas-dir each fail with an actionable message', async () => {
    const { requestPath } = scenario();
    const runWith = async (flags: Record<string, unknown>) => {
      const { ui } = createCapturedUI();
      const ctx = createMockContext({ ui, cwd: '/project' });
      return deliverRequestCommand.execute(ctx as never, mockCLIInput({ flags: flags as never }));
    };

    expect(errorOf(await runWith({ json: true }))).toMatch(/requires --request/);
    const previousRepository = process.env.GITHUB_REPOSITORY;
    const previousCasDir = process.env.KB_RELEASE_CAS_DIR;
    delete process.env.GITHUB_REPOSITORY;
    delete process.env.KB_RELEASE_CAS_DIR;
    try {
      expect(errorOf(await runWith({ request: requestPath, json: true }))).toMatch(/requires --repository/);
      expect(errorOf(await runWith({ request: requestPath, repository: 'kb-labs/kb-labs', json: true })))
        .toMatch(/requires --cas-dir/);
    } finally {
      if (previousRepository !== undefined) { process.env.GITHUB_REPOSITORY = previousRepository; }
      if (previousCasDir !== undefined) { process.env.KB_RELEASE_CAS_DIR = previousCasDir; }
    }
  });

  it('DR-06: a delivery refusal is reported with its diagnostic code, not as a crash', async () => {
    const { bundleDir, casDir, requestPath } = scenario();
    // Somebody else already moved the pointer: the request's `null` precondition
    // ("nothing published yet") is no longer true.
    const foreign = sealedPointer('stable', 'platform-9.9.9');
    await new FileCasStore(casDir).putIfMatch(channelPointerKey('stable'), foreign.body, CAS_ABSENT);
    expect(bundleDir).toBeTruthy();

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: '/project' });
    const result = await deliverRequestCommand.execute(ctx as never, mockCLIInput({
      flags: { request: requestPath, 'cas-dir': casDir, repository: 'kb-labs/kb-labs', json: true },
    }));

    expect(result.ok).toBe(false);
    const payload = captured.json[0] as { ok: boolean; error: { code?: string; message: string } };
    expect(payload.error.code).toBe('KB_RELEASE_POINTER_PRECONDITION_MISMATCH');
    expect(payload.error.message).toMatch(/drift, not a conflict to resolve here/);
    // The foreign pointer survived: a refusal is never an overwrite.
    const stored = await new FileCasStore(casDir).read(channelPointerKey('stable'));
    expect(stored!.body).toBe(foreign.body);
  });
});
