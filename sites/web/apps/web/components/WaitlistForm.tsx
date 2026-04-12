'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

type WaitlistFormProps = {
  size?: 'default' | 'large';
};

export function WaitlistForm({ size = 'default' }: WaitlistFormProps) {
  const t = useTranslations();
  const [email, setEmail] = useState('');
  const [useCase, setUseCase] = useState('release');
  const [deploymentPreference, setDeploymentPreference] = useState('onprem_now');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || status === 'loading') return;

    setStatus('loading');

    // Simulate API call — replace with real endpoint.
    // Keep payload explicit so backend integration is straightforward.
    const payload = { email, useCase, deploymentPreference };
    void payload;
    await new Promise((r) => setTimeout(r, 900));

    setStatus('done');
  }

  if (status === 'done') {
    return (
      <p className={`waitlist-thanks${size === 'large' ? ' waitlist-thanks--lg' : ''}`}>
        {t('signup.form.success')}
      </p>
    );
  }

  return (
    <form
      className={`waitlist-form${size === 'large' ? ' waitlist-form--lg' : ''}`}
      onSubmit={handleSubmit}
    >
      <label className="waitlist-field">
        <span className="waitlist-field-label">{t('signup.form.emailAriaLabel')}</span>
        <input
          className="waitlist-input"
          type="email"
          placeholder={t('signup.form.emailPlaceholder')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={status === 'loading'}
          aria-label={t('signup.form.emailAriaLabel')}
        />
      </label>

      <label className="waitlist-field">
        <span className="waitlist-field-label">{t('signup.form.fields.useCase.label')}</span>
        <select
          className="waitlist-select"
          value={useCase}
          onChange={(e) => setUseCase(e.target.value)}
          disabled={status === 'loading'}
          aria-label={t('signup.form.fields.useCase.label')}
        >
          <option value="release">{t('signup.form.fields.useCase.options.release')}</option>
          <option value="qa">{t('signup.form.fields.useCase.options.qa')}</option>
          <option value="commit_policy">{t('signup.form.fields.useCase.options.commitPolicy')}</option>
          <option value="monorepo">{t('signup.form.fields.useCase.options.monorepo')}</option>
          <option value="agent_workflows">{t('signup.form.fields.useCase.options.agentWorkflows')}</option>
          <option value="other">{t('signup.form.fields.useCase.options.other')}</option>
        </select>
      </label>

      <label className="waitlist-field">
        <span className="waitlist-field-label">{t('signup.form.fields.deploymentPreference.label')}</span>
        <select
          className="waitlist-select"
          value={deploymentPreference}
          onChange={(e) => setDeploymentPreference(e.target.value)}
          disabled={status === 'loading'}
          aria-label={t('signup.form.fields.deploymentPreference.label')}
        >
          <option value="onprem_now">{t('signup.form.fields.deploymentPreference.options.onPremNow')}</option>
          <option value="saas_later">{t('signup.form.fields.deploymentPreference.options.saasLater')}</option>
          <option value="undecided">{t('signup.form.fields.deploymentPreference.options.undecided')}</option>
        </select>
      </label>

      <button
        className="waitlist-btn"
        type="submit"
        disabled={status === 'loading'}
      >
        {status === 'loading' ? t('signup.form.submitting') : t('signup.form.submit')}
      </button>
    </form>
  );
}
