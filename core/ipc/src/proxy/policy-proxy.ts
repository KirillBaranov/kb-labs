/**
 * @module @kb-labs/core-ipc/proxy/policy
 *
 * Child-side proxy for `IPolicyDecisionPoint`. All RPCs go to `policy` on
 * the parent, where the single engine instance lives (built from
 * `documentDatabase`). Workers never resolve authorization locally —
 * decisions stay centralized so a membership/relation change takes effect
 * immediately and audit is in one place.
 */

import type {
  Identity,
  IPolicyDecisionPoint,
  ListResourcesOptions,
  PolicyContext,
  PolicyDecision,
  Resource,
  ResourceRef,
} from '@kb-labs/core-contracts';
import type { ITransport } from '../transport/transport';
import { RemoteAdapter } from './remote-adapter';

export class PolicyProxy
  extends RemoteAdapter<IPolicyDecisionPoint>
  implements IPolicyDecisionPoint
{
  constructor(transport: ITransport) {
    super('policy', transport);
  }

  async check(
    identity: Identity,
    action: string,
    resource?: Resource,
    ctx?: PolicyContext,
  ): Promise<PolicyDecision> {
    return (await this.callRemote('check', [identity, action, resource, ctx])) as PolicyDecision;
  }

  async enumeratePermissions(identity: Identity): Promise<string[]> {
    return (await this.callRemote('enumeratePermissions', [identity])) as string[];
  }

  async listResources(
    identity: Identity,
    action: string,
    resourceType: string,
    opts?: ListResourcesOptions,
  ): Promise<ResourceRef[]> {
    return (await this.callRemote('listResources', [
      identity,
      action,
      resourceType,
      opts,
    ])) as ResourceRef[];
  }
}
