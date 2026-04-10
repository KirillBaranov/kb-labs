import { describe, it, expect } from 'vitest';
import {
  minimal,
  gitWorkflow,
  npmPublish,
  fullEnv,
  kbPlatform,
  llmAccess,
  vectorStore,
  ciEnvironment,
} from '../presets';

describe('Permission Presets', () => {
  describe('minimal', () => {
    it('should have id and description', () => {
      expect(minimal.id).toBe('minimal');
      expect(minimal.description).toBeTruthy();
    });

    it('should include basic system env vars', () => {
      const envVars = minimal.permissions.env?.read ?? [];
      expect(envVars).toContain('PATH');
      expect(envVars).toContain('NODE_ENV');
      expect(envVars).toContain('LANG');
    });

    it('should NOT include HOME or USER', () => {
      const envVars = minimal.permissions.env?.read ?? [];
      expect(envVars).not.toContain('HOME');
      expect(envVars).not.toContain('USER');
    });
  });

  describe('gitWorkflow', () => {
    it('should have id and description', () => {
      expect(gitWorkflow.id).toBe('git-workflow');
      expect(gitWorkflow.description).toBeTruthy();
    });

    it('should include HOME for git config', () => {
      const envVars = gitWorkflow.permissions.env?.read ?? [];
      expect(envVars).toContain('HOME');
    });

    it('should include USER for git author', () => {
      const envVars = gitWorkflow.permissions.env?.read ?? [];
      expect(envVars).toContain('USER');
    });

    it('should include GIT_* wildcard', () => {
      const envVars = gitWorkflow.permissions.env?.read ?? [];
      expect(envVars).toContain('GIT_*');
    });

    it('should include SSH env vars for auth', () => {
      const envVars = gitWorkflow.permissions.env?.read ?? [];
      expect(envVars).toContain('SSH_AUTH_SOCK');
      expect(envVars).toContain('SSH_AGENT_PID');
    });

    it('should allow .git directory access', () => {
      const allow = gitWorkflow.permissions.fs?.allow ?? [];
      expect(allow).toContain('**/.git/**');
    });
  });

  describe('npmPublish', () => {
    it('should have id and description', () => {
      expect(npmPublish.id).toBe('npm-publish');
      expect(npmPublish.description).toBeTruthy();
    });

    it('should include HOME for .npmrc', () => {
      const envVars = npmPublish.permissions.env?.read ?? [];
      expect(envVars).toContain('HOME');
    });

    it('should include npm token vars', () => {
      const envVars = npmPublish.permissions.env?.read ?? [];
      expect(envVars).toContain('NPM_TOKEN');
      expect(envVars).toContain('NPM_AUTH_TOKEN');
      expect(envVars).toContain('NODE_AUTH_TOKEN');
    });

    it('should include npm_* wildcard', () => {
      const envVars = npmPublish.permissions.env?.read ?? [];
      expect(envVars).toContain('npm_*');
    });

    it('should allow package.json and lock files', () => {
      const allow = npmPublish.permissions.fs?.allow ?? [];
      expect(allow).toContain('**/package.json');
      expect(allow).toContain('**/package-lock.json');
      expect(allow).toContain('**/pnpm-lock.yaml');
    });

    it('should allow npm registry domains', () => {
      const domains = npmPublish.permissions.network?.fetch ?? [];
      expect(domains).toContain('registry.npmjs.org');
      expect(domains).toContain('npm.pkg.github.com');
    });
  });

  describe('fullEnv', () => {
    it('should have id and description', () => {
      expect(fullEnv.id).toBe('full-env');
      expect(fullEnv.description).toBeTruthy();
    });

    it('should include wildcard for all env vars', () => {
      const envVars = fullEnv.permissions.env?.read ?? [];
      expect(envVars).toContain('*');
    });
  });

  describe('kbPlatform', () => {
    it('should have id and description', () => {
      expect(kbPlatform.id).toBe('kb-platform');
      expect(kbPlatform.description).toBeTruthy();
    });

    it('should include KB_* wildcard', () => {
      const envVars = kbPlatform.permissions.env?.read ?? [];
      expect(envVars).toContain('KB_*');
    });

    it('should allow .kb directory access', () => {
      const allow = kbPlatform.permissions.fs?.allow ?? [];
      expect(allow).toContain('.kb/**');
    });
  });

  describe('llmAccess', () => {
    it('should have id and description', () => {
      expect(llmAccess.id).toBe('llm-access');
      expect(llmAccess.description).toBeTruthy();
    });

    it('should include OpenAI env vars', () => {
      const envVars = llmAccess.permissions.env?.read ?? [];
      expect(envVars).toContain('OPENAI_API_KEY');
      expect(envVars).toContain('OPENAI_ORG_ID');
    });

    it('should include Anthropic env vars', () => {
      const envVars = llmAccess.permissions.env?.read ?? [];
      expect(envVars).toContain('ANTHROPIC_API_KEY');
    });

    it('should allow LLM API domains', () => {
      const domains = llmAccess.permissions.network?.fetch ?? [];
      expect(domains).toContain('api.openai.com');
      expect(domains).toContain('api.anthropic.com');
    });
  });

  describe('vectorStore', () => {
    it('should have id and description', () => {
      expect(vectorStore.id).toBe('vector-store');
      expect(vectorStore.description).toBeTruthy();
    });

    it('should include Qdrant env vars', () => {
      const envVars = vectorStore.permissions.env?.read ?? [];
      expect(envVars).toContain('QDRANT_URL');
      expect(envVars).toContain('QDRANT_API_KEY');
    });

    it('should include Pinecone env vars', () => {
      const envVars = vectorStore.permissions.env?.read ?? [];
      expect(envVars).toContain('PINECONE_API_KEY');
    });

    it('should allow vector store domains', () => {
      const domains = vectorStore.permissions.network?.fetch ?? [];
      expect(domains).toContain('localhost');
      expect(domains).toContain('*.qdrant.io');
      expect(domains).toContain('*.pinecone.io');
    });
  });

  describe('ciEnvironment', () => {
    it('should have id and description', () => {
      expect(ciEnvironment.id).toBe('ci-environment');
      expect(ciEnvironment.description).toBeTruthy();
    });

    it('should include CI indicator', () => {
      const envVars = ciEnvironment.permissions.env?.read ?? [];
      expect(envVars).toContain('CI');
    });

    it('should include GitHub Actions vars', () => {
      const envVars = ciEnvironment.permissions.env?.read ?? [];
      expect(envVars).toContain('GITHUB_TOKEN');
      expect(envVars).toContain('GITHUB_*');
    });

    it('should include GitLab CI vars', () => {
      const envVars = ciEnvironment.permissions.env?.read ?? [];
      expect(envVars).toContain('GITLAB_*');
      expect(envVars).toContain('CI_JOB_TOKEN');
    });
  });
});
