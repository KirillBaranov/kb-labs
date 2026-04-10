import type { PermissionPreset } from '../types';

/**
 * CI Environment preset - for plugins running in CI/CD
 * Includes GitHub Actions, GitLab CI, and common CI variables
 */
export const ciEnvironment: PermissionPreset = {
  id: 'ci-environment',
  description: 'CI/CD environment - GitHub Actions, GitLab CI tokens and vars',
  permissions: {
    env: {
      read: [
        // Common CI
        'CI',
        'CI_*',
        'CONTINUOUS_INTEGRATION',
        // GitHub Actions
        'GITHUB_TOKEN',
        'GITHUB_*',
        'GH_TOKEN',
        // GitLab CI
        'GITLAB_*',
        'CI_JOB_TOKEN',
        // Jenkins
        'JENKINS_*',
        'BUILD_*',
        // Generic
        'BRANCH_NAME',
        'TAG_NAME',
        'COMMIT_SHA',
      ],
    },
  },
};
