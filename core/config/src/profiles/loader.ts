/**
 * @module @kb-labs/core-config/profiles/loader
 * Load + validate profiles[] section from kb.config.*
 */

import { KbError, ERROR_HINTS } from '../errors/kb-error';
import { readKbConfig } from '../api/read-kb-config';
import {
  ProfilesV2Schema,
  type ProfileV2,
} from './types';

export interface ProfilesSectionResult {
  profiles: ProfileV2[];
  sourcePath?: string;
  format?: 'json' | 'yaml';
}

export async function readProfilesSection(cwd: string): Promise<ProfilesSectionResult> {
  const kbConfig = await readKbConfig(cwd);
  if (!kbConfig?.data) {
    return { profiles: [] };
  }

  const rawProfiles = (kbConfig.data as any)?.profiles;

  if (rawProfiles === undefined) {
    return {
      profiles: [],
      sourcePath: kbConfig.path,
      format: kbConfig.format,
    };
  }

  const parsed = ProfilesV2Schema.safeParse(rawProfiles);
  if (!parsed.success) {
    throw new KbError(
      'ERR_PROFILE_INVALID_FORMAT',
      'Invalid profiles[] section in kb.config.',
      ERROR_HINTS.ERR_PROFILE_INVALID_FORMAT,
      {
        issues: parsed.error.issues,
        sourcePath: kbConfig.path,
      }
    );
  }

  return {
    profiles: parsed.data,
    sourcePath: kbConfig.path,
    format: kbConfig.format,
  };
}

