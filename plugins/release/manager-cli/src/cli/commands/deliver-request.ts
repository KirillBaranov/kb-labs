/**
 * `kb release deliver-request` — the one command CI runs.
 *
 * This is the whole CI surface of the release train. The GitHub Actions
 * workflow around it fetches a bundle, runs this, and uploads the evidence; it
 * makes no decision, which is why it can be 100 lines of YAML instead of the
 * 484 that `release-build-candidate.yml` and `release-deliver-candidate.yml`
 * were between them.
 *
 * Its input is a `ReleaseDeliveryRequest` document — `{receiptId, candidateId,
 * bundle:{uri,sha256}, operation}` plus the pointer preconditions where the
 * operation needs them. There is no `flow`, no `version`, no package pattern and
 * no manifest path, because CI is not permitted to know those things: knowing
 * them is what would let it choose differently from what was approved.
 *
 * Its output is a `DeliveryEvidence` document on stdout. Nothing else. In
 * particular this command is given no receipt store, no ledger and no lease —
 * §6A.1.4 — so a CI runner holding these credentials still cannot write a single
 * byte of operational state.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  ReleaseDeliveryRequestSchema,
  type DeliveryEvidence,
  type ReleaseDeliveryRequest,
} from '@kb-labs/release-manager-contracts';
import {
  defineCommand,
  type CLIInput,
  type CommandResult,
  type PluginContextV3,
} from '@kb-labs/sdk';

import {
  CiActivationAdapter,
  CiDeliveryAdapter,
  FileCasStore,
  GhReleaseAssetStore,
  LocalBundleFetcher,
  ShellNpmRegistry,
  type DeliveryEvidenceSink,
} from '../../shared/control-plane/index.js';

interface DeliverRequestFlags {
  request?: string;
  'cas-dir'?: string;
  repository?: string;
  registry?: string;
  'run-id'?: string;
  json?: boolean;
}

function readRequest(path: string): ReleaseDeliveryRequest {
  const raw = path === '-' ? readFileSync(0, 'utf8') : readFileSync(resolve(path), 'utf8');
  return ReleaseDeliveryRequestSchema.parse(JSON.parse(raw));
}

export default defineCommand({
  id: 'release:deliver-request',
  description: 'Execute one ReleaseDeliveryRequest and emit DeliveryEvidence',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<DeliverRequestFlags>): Promise<CommandResult<unknown>> {
      const { flags } = input;
      if (!flags.request) {
        const message = 'release deliver-request requires --request <path|-> holding a kb.release-delivery-request/1 document.';
        if (flags.json) { ctx.ui?.json?.({ ok: false, error: message }); } else { ctx.ui?.write?.(message); }
        return { ok: false, error: message };
      }

      let request: ReleaseDeliveryRequest;
      try {
        request = readRequest(flags.request);
      } catch (error) {
        const message = `unreadable delivery request: ${(error as Error).message}`;
        if (flags.json) { ctx.ui?.json?.({ ok: false, error: message }); } else { ctx.ui?.write?.(message); }
        return { ok: false, error: message };
      }

      // Run correlation is derived from the request, never from the branch or
      // from "the most recent run" (§6A.5). The GitHub run id only disambiguates
      // repeats of the same step.
      const ciRunId = `${request.receiptId}:${request.candidateId}:${request.stepId}`
        + (flags['run-id'] ? `:${flags['run-id']}` : '');

      const repository = flags.repository ?? process.env.GITHUB_REPOSITORY;
      if (!repository) {
        const message = 'release deliver-request requires --repository or GITHUB_REPOSITORY for immutable asset publication.';
        if (flags.json) { ctx.ui?.json?.({ ok: false, error: message }); } else { ctx.ui?.write?.(message); }
        return { ok: false, error: message };
      }

      // §3.1 leaves the mutable-document endpoint as an S3-compatible store with
      // conditional PUT, to be validated before it is trusted. Until that
      // validation happens the CAS primitives run against a local-file store
      // with the same semantics, so the delivery logic is already written
      // against the interface the real client will implement.
      const casDir = flags['cas-dir'] ?? process.env.KB_RELEASE_CAS_DIR;
      if (!casDir) {
        const message = 'release deliver-request requires --cas-dir or KB_RELEASE_CAS_DIR for the mutable-document store.';
        if (flags.json) { ctx.ui?.json?.({ ok: false, error: message }); } else { ctx.ui?.write?.(message); }
        return { ok: false, error: message };
      }

      const emitted: DeliveryEvidence[] = [];
      const emit: DeliveryEvidenceSink = evidence => { emitted.push(evidence); };
      const shared = {
        fetcher: new LocalBundleFetcher(),
        npm: new ShellNpmRegistry({ ...(flags.registry ? { registry: flags.registry } : {}) }),
        assets: new GhReleaseAssetStore({ repository }),
        cas: new FileCasStore(resolve(casDir)),
        ciRunId,
        emit,
      };

      try {
        let evidence: DeliveryEvidence;
        switch (request.operation) {
          case 'publish-artifacts':
            evidence = await new CiDeliveryAdapter(shared).publishArtifacts(request);
            break;
          case 'stage-channel':
            evidence = await new CiActivationAdapter(shared).stageChannel(request);
            break;
          case 'commit-channel':
          case 'compensate-channel':
            evidence = await new CiActivationAdapter(shared).commitChannel(request);
            break;
          default: {
            const message = `unsupported delivery operation: ${String(request.operation)}`;
            if (flags.json) { ctx.ui?.json?.({ ok: false, error: message }); } else { ctx.ui?.write?.(message); }
            return { ok: false, error: message };
          }
        }

        // Every mutation's evidence, in order, plus the aggregate. A Workflow
        // resuming after a crash reads the partial list to learn what already
        // landed; the aggregate alone would not tell it.
        const payload = { ok: true, evidence, mutations: emitted };
        if (flags.json) { ctx.ui?.json?.(payload); }
        ctx.ui?.write?.(`::kb-output::${JSON.stringify({
          receiptId: evidence.receiptId,
          candidateId: evidence.candidateId,
          operation: evidence.operation,
          ciRunId: evidence.ciRunId,
          result: evidence.result,
        })}`);
        return { ok: true, result: payload };
      } catch (error) {
        const message = (error as Error).message;
        const code = (error as { code?: string }).code;
        const payload = { ok: false, error: { ...(code ? { code } : {}), message }, mutations: emitted };
        if (flags.json) { ctx.ui?.json?.(payload); } else { ctx.ui?.write?.(message); }
        return { ok: false, error: message };
      }
    },
  },
});
