/**
 * In-memory adapters standing in for CI, the launcher smoke and the channel
 * endpoint until PR 6 supplies the real ones.
 *
 * They are honest implementations of the interfaces rather than stubs, because
 * the DoD for PR 5 is "every transition, every restart, duplicate/late/wrong
 * evidence, crash after each stable mutation, probe failure after pointer
 * commit, compensation failure, lease blocking" — none of which can be tested
 * against a stub that always succeeds. So each one records what it was asked to
 * do (that record is what makes "was this step replayed?" assertable) and each
 * one can be scripted to fail transiently or terminally.
 *
 * They are also what `--dry-run` uses. A dry run that called real CI would not
 * be a dry run, and a dry run that skipped the calls entirely would not exercise
 * the state machine — which is the only thing worth dry-running.
 */

import {
  DeliveryEvidenceSchema,
  type DeliveryEvidence,
  type ReleaseDeliveryRequest,
  type ReleaseObservationSignal,
} from '@kb-labs/release-manager-contracts';

import {
  assertEvidenceMatches,
  rejectingFailure,
  transientFailure,
  type ActivationAdapter,
  type DeliveryAdapter,
  type ObservationSource,
  type SmokeAdapter,
} from './adapters.js';

export interface FakeAdapterCall {
  step: string;
  receiptId: string;
  candidateId: string;
  bundleSha256: string;
  target?: string;
}

/** Scripted outcome for one named step, consumed once per attempt. */
export type FakeOutcome =
  | { kind: 'ok' }
  | { kind: 'transient'; message?: string }
  | { kind: 'reject'; message?: string }
  | { kind: 'degraded' }
  /** Simulates a crash *after* the external mutation but before acknowledgement. */
  | { kind: 'crash-after'; message?: string };

export class FakeReleaseCrash extends Error {
  constructor(step: string, message?: string) {
    super(message ?? `simulated crash after ${step}`);
    this.name = 'FakeReleaseCrash';
  }
}

function evidence(input: {
  receiptId: string;
  candidateId: string;
  bundleSha256: string;
  operation: DeliveryEvidence['operation'];
  ciRunId: string;
  result?: DeliveryEvidence['result'];
  targetChannel?: DeliveryEvidence['targetChannel'];
  observedDistTags?: DeliveryEvidence['observedDistTags'];
}): DeliveryEvidence {
  return DeliveryEvidenceSchema.parse({
    schema: 'kb.delivery-evidence/1',
    receiptId: input.receiptId,
    candidateId: input.candidateId,
    bundleSha256: input.bundleSha256,
    operation: input.operation,
    ...(input.targetChannel ? { targetChannel: input.targetChannel } : {}),
    ciRunId: input.ciRunId,
    observedAt: '2026-08-31T00:00:00Z',
    artifacts: [],
    observedDistTags: input.observedDistTags ?? [],
    result: input.result ?? 'succeeded',
    signature: null,
  });
}

/**
 * Shared scripting/recording machinery.
 *
 * `calls` is the assertion surface for the resume rules: after a crash and a
 * resume, a forbidden step must appear exactly once and the replayed step
 * exactly twice with *identical* identity.
 */
export class FakeAdapterScript {
  readonly calls: FakeAdapterCall[] = [];
  private readonly outcomes = new Map<string, FakeOutcome[]>();
  private runId = 0;

  /** Queues outcomes for `step`; anything unscripted succeeds. */
  script(step: string, ...outcomes: FakeOutcome[]): this {
    this.outcomes.set(step, [...(this.outcomes.get(step) ?? []), ...outcomes]);
    return this;
  }

  nextCiRunId(): string {
    this.runId += 1;
    return `fake-ci-${this.runId}`;
  }

  countOf(step: string): number {
    return this.calls.filter(call => call.step === step).length;
  }

  /** Records the call, then applies the next scripted outcome for that step. */
  enter(call: FakeAdapterCall): FakeOutcome {
    this.calls.push(call);
    const queue = this.outcomes.get(call.step);
    const outcome = queue?.shift() ?? { kind: 'ok' as const };
    if (outcome.kind === 'transient') { throw transientFailure(outcome.message ?? `${call.step} timed out`); }
    if (outcome.kind === 'reject') { throw rejectingFailure(outcome.message ?? `${call.step} failed verification`); }
    return outcome;
  }

  /** Applied after the side effect, so a crash leaves the fake world mutated. */
  afterEffect(step: string, outcome: FakeOutcome): void {
    if (outcome.kind === 'crash-after') { throw new FakeReleaseCrash(step, outcome.message); }
  }
}

export class FakeDeliveryAdapter implements DeliveryAdapter {
  constructor(readonly script: FakeAdapterScript) {}

  async publishArtifacts(request: ReleaseDeliveryRequest): Promise<DeliveryEvidence> {
    const outcome = this.script.enter({
      step: 'publish-artifacts',
      receiptId: request.receiptId,
      candidateId: request.candidateId,
      bundleSha256: request.expectedBundleSha256,
    });
    const produced = evidence({
      receiptId: request.receiptId,
      candidateId: request.candidateId,
      bundleSha256: request.expectedBundleSha256,
      operation: 'publish-artifacts',
      ciRunId: this.script.nextCiRunId(),
    });
    this.script.afterEffect('publish-artifacts', outcome);
    assertEvidenceMatches(request, produced);
    return produced;
  }
}

export class FakeSmokeAdapter implements SmokeAdapter {
  constructor(readonly script: FakeAdapterScript) {}

  async smokeExactVersion(input: {
    receiptId: string;
    candidateId: string;
    releaseId: string;
    bundleSha256: string;
  }): Promise<DeliveryEvidence> {
    const outcome = this.script.enter({ step: 'public-smoke', ...input });
    const produced = evidence({
      receiptId: input.receiptId,
      candidateId: input.candidateId,
      bundleSha256: input.bundleSha256,
      operation: 'publish-artifacts',
      ciRunId: this.script.nextCiRunId(),
    });
    this.script.afterEffect('public-smoke', outcome);
    return produced;
  }
}

/**
 * Channel endpoint with an actual mutable pointer.
 *
 * The pointer being real state — not a recorded call — is what makes the
 * compensation tests meaningful: "CAS the previous pointer back first" is only
 * checkable if there is something to read back afterwards.
 */
export class FakeActivationAdapter implements ActivationAdapter {
  readonly pointers = new Map<string, { pointerSha256: string | null; releaseId: string | null }>();
  readonly aliases = new Map<string, string>();

  constructor(readonly script: FakeAdapterScript) {}

  setPointer(channel: string, pointerSha256: string | null, releaseId: string | null): void {
    this.pointers.set(channel, { pointerSha256, releaseId });
  }

  async readPointer(channel: string): Promise<{ pointerSha256: string | null; releaseId: string | null }> {
    return this.pointers.get(channel) ?? { pointerSha256: null, releaseId: null };
  }

  async stageChannel(request: ReleaseDeliveryRequest): Promise<DeliveryEvidence> {
    const outcome = this.script.enter({
      step: 'stage-channel',
      receiptId: request.receiptId,
      candidateId: request.candidateId,
      bundleSha256: request.expectedBundleSha256,
      target: request.targetChannel,
    });
    const produced = evidence({
      receiptId: request.receiptId,
      candidateId: request.candidateId,
      bundleSha256: request.expectedBundleSha256,
      operation: 'stage-channel',
      targetChannel: request.targetChannel,
      ciRunId: this.script.nextCiRunId(),
    });
    this.script.afterEffect('stage-channel', outcome);
    assertEvidenceMatches(request, produced);
    return produced;
  }

  async commitChannel(request: ReleaseDeliveryRequest): Promise<DeliveryEvidence> {
    const step = request.operation === 'compensate-channel' ? 'compensate-channel' : 'commit-channel';
    const outcome = this.script.enter({
      step,
      receiptId: request.receiptId,
      candidateId: request.candidateId,
      bundleSha256: request.expectedBundleSha256,
      target: request.targetChannel,
    });
    const channel = request.targetChannel ?? 'stable';
    const current = await this.readPointer(channel);
    if (request.expectedPreviousPointerSha256 !== undefined
      && current.pointerSha256 !== request.expectedPreviousPointerSha256) {
      throw rejectingFailure(
        `pointer CAS precondition failed for ${channel}: expected ${String(request.expectedPreviousPointerSha256)}, found ${String(current.pointerSha256)}`,
      );
    }
    this.pointers.set(channel, {
      pointerSha256: request.pointerPlanSha256 ?? request.expectedBundleSha256,
      releaseId: request.candidateId,
    });
    const produced = evidence({
      receiptId: request.receiptId,
      candidateId: request.candidateId,
      bundleSha256: request.expectedBundleSha256,
      operation: request.operation,
      targetChannel: request.targetChannel,
      ciRunId: this.script.nextCiRunId(),
    });
    // Crash *after* the pointer moved: the world changed, the caller never
    // learned that it did. This is the exact shape a resume has to survive.
    this.script.afterEffect(step, outcome);
    assertEvidenceMatches(request, produced);
    return produced;
  }

  async moveAlias(input: {
    receiptId: string;
    candidateId: string;
    bundleSha256: string;
    package: string;
    tag: string;
    version: string;
  }): Promise<DeliveryEvidence> {
    const outcome = this.script.enter({
      step: 'npm-alias',
      receiptId: input.receiptId,
      candidateId: input.candidateId,
      bundleSha256: input.bundleSha256,
      target: `${input.package}@${input.tag}`,
    });
    this.aliases.set(`${input.package}@${input.tag}`, input.version);
    const produced = evidence({
      receiptId: input.receiptId,
      candidateId: input.candidateId,
      bundleSha256: input.bundleSha256,
      operation: 'commit-channel',
      ciRunId: this.script.nextCiRunId(),
      result: outcome.kind === 'degraded' ? 'degraded' : 'succeeded',
      observedDistTags: [{ package: input.package, tag: input.tag, version: input.version }],
    });
    this.script.afterEffect('npm-alias', outcome);
    return produced;
  }

  async probePublic(input: {
    receiptId: string;
    candidateId: string;
    bundleSha256: string;
    channel: string;
    expectedReleaseId: string;
  }): Promise<DeliveryEvidence> {
    const outcome = this.script.enter({
      step: 'public-probe',
      receiptId: input.receiptId,
      candidateId: input.candidateId,
      bundleSha256: input.bundleSha256,
      target: input.channel,
    });
    const produced = evidence({
      receiptId: input.receiptId,
      candidateId: input.candidateId,
      bundleSha256: input.bundleSha256,
      operation: 'commit-channel',
      targetChannel: input.channel as DeliveryEvidence['targetChannel'],
      ciRunId: this.script.nextCiRunId(),
    });
    this.script.afterEffect('public-probe', outcome);
    return produced;
  }
}

export class FakeObservationSource implements ObservationSource {
  constructor(private readonly signals: readonly ReleaseObservationSignal[] = []) {}

  async collect(): Promise<readonly ReleaseObservationSignal[]> {
    return this.signals;
  }
}

export interface FakeAdapterSet {
  script: FakeAdapterScript;
  delivery: FakeDeliveryAdapter;
  smoke: FakeSmokeAdapter;
  activation: FakeActivationAdapter;
  observation: FakeObservationSource;
}

export function createFakeAdapters(signals: readonly ReleaseObservationSignal[] = []): FakeAdapterSet {
  const script = new FakeAdapterScript();
  return {
    script,
    delivery: new FakeDeliveryAdapter(script),
    smoke: new FakeSmokeAdapter(script),
    activation: new FakeActivationAdapter(script),
    observation: new FakeObservationSource(signals),
  };
}
