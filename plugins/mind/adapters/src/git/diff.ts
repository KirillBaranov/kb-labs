/**
 * Git diff utilities for KB Labs Mind
 */

import { spawn } from 'node:child_process';
import { MindError } from '@kb-labs/mind-core';
import type { RecentDiff } from '@kb-labs/mind-core';

/**
 * Get git diff since a specific revision
 */
export async function gitDiffSince(cwd: string, since: string): Promise<RecentDiff> {
  try {
    // Check if we're in a git repository
    const checkResult = spawn('git', ['rev-parse', '--git-dir'], { cwd, stdio: 'pipe' });
    await new Promise((resolve, reject) => {
      checkResult.on('close', (code) => {
        if (code === 0) {resolve(code);}
        else {reject(new Error('Not in git repository'));}
      });
      checkResult.on('error', reject);
    });
  } catch {
    return { schemaVersion: '1.0', generator: 'kb-labs-mind@0.1.0', since, files: [] };
  }

  try {
    // Get diff with name-status and unified format
    const result = spawn('git', [
      'diff',
      '--name-status',
      '--unified=0',
      since
    ], { cwd, stdio: 'pipe' });

    const output = await new Promise<string>((resolve, reject) => {
      let stdout = '';
      result.stdout?.on('data', (data) => {
        stdout += data.toString();
      });
      result.on('close', (code) => {
        if (code === 0) {resolve(stdout);}
        else {reject(new Error(`Git command failed with code ${code}`));}
      });
    });

    const files = parseDiffOutput(output);

    return {
      schemaVersion: "1.0",
      generator: "kb-labs-mind@0.1.0",
      since,
      files
    };
  } catch (error: any) {
    throw new MindError('MIND_GIT_ERROR', `Git diff failed: ${error.message}`);
  }
}

/**
 * Parse git diff output
 */
function parseDiffOutput(output: string): RecentDiff['files'] {
  const lines = output.trim().split('\n');
  const files: RecentDiff['files'] = [];

  for (const line of lines) {
    if (!line.trim()) {continue;}

    // Parse git status format: STATUS\tPATH
    const match = line.match(/^([AMD])\t(.+)$/);
    if (match) {
      const [, status, path] = match;
      if (path) {
        files.push({
          path,
          status: status as 'A'|'M'|'D'|'R'
        });
      }
    }
  }

  return files;
}
