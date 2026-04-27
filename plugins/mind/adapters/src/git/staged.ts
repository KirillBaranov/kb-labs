/**
 * Git staged files utilities for KB Labs Mind
 */

import { spawn } from 'node:child_process';
import { MindError } from '@kb-labs/mind-core';

/**
 * List staged files in git repository
 */
export async function listStagedFiles(cwd: string): Promise<string[]> {
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
    return [];
  }

  try {
    // Get staged files
    const result = spawn('git', [
      'diff',
      '--cached',
      '--name-only'
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

    return output.trim().split('\n').filter(Boolean);
  } catch (error: unknown) {
    throw new MindError('MIND_GIT_ERROR', `Git staged files failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
