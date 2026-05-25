'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Button,
  FormField,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@kb-labs/web-site-ui';
import { CheckCircle2 } from 'lucide-react';

type WaitlistFormProps = {
  size?: 'default' | 'large';
  onSuccess?: () => void;
};

export function WaitlistForm({ size = 'default', onSuccess }: WaitlistFormProps) {
  const t = useTranslations();
  const [email, setEmail] = useState('');
  const [useCase, setUseCase] = useState('release');
  const [useCaseOther, setUseCaseOther] = useState('');
  const [deploymentPreference, setDeploymentPreference] = useState('onprem_now');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || status === 'loading') return;
    setStatus('loading');
    const payload = { email, useCase, useCaseOther: useCase === 'other' ? useCaseOther : undefined, deploymentPreference };
    void payload;
    await new Promise((r) => setTimeout(r, 900));
    setStatus('done');
    onSuccess?.();
  }

  if (status === 'done') {
    return (
      <div className="flex min-h-[220px] flex-col items-center justify-center gap-4 py-4 text-center">
        <div className="flex size-12 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-500">
          <CheckCircle2 size={24} />
        </div>
        <p className="text-base font-semibold text-kb-text">
          {t('signup.form.success')}
        </p>
      </div>
    );
  }

  const isLarge = size === 'large';

  return (
    <form onSubmit={handleSubmit} className={isLarge ? 'space-y-5' : 'space-y-4'}>

      <FormField label={t('signup.form.emailAriaLabel')} htmlFor="wl-email" required>
        <Input
          id="wl-email"
          type="email"
          placeholder={t('signup.form.emailPlaceholder')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={status === 'loading'}
        />
      </FormField>

      <FormField label={t('signup.form.fields.useCase.label')} htmlFor="wl-usecase">
        <Select value={useCase} onValueChange={setUseCase} disabled={status === 'loading'}>
          <SelectTrigger id="wl-usecase">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="release">{t('signup.form.fields.useCase.options.release')}</SelectItem>
            <SelectItem value="qa">{t('signup.form.fields.useCase.options.qa')}</SelectItem>
            <SelectItem value="commit_policy">{t('signup.form.fields.useCase.options.commitPolicy')}</SelectItem>
            <SelectItem value="monorepo">{t('signup.form.fields.useCase.options.monorepo')}</SelectItem>
            <SelectItem value="agent_workflows">{t('signup.form.fields.useCase.options.agentWorkflows')}</SelectItem>
            <SelectItem value="other">{t('signup.form.fields.useCase.options.other')}</SelectItem>
          </SelectContent>
        </Select>
      </FormField>

      {useCase === 'other' && (
        <FormField label={t('signup.form.fields.useCaseOther.label')} htmlFor="wl-usecase-other">
          <Textarea
            id="wl-usecase-other"
            placeholder={t('signup.form.fields.useCaseOther.placeholder')}
            value={useCaseOther}
            onChange={(e) => setUseCaseOther(e.target.value)}
            disabled={status === 'loading'}
            rows={3}
          />
        </FormField>
      )}

      <FormField label={t('signup.form.fields.deploymentPreference.label')} htmlFor="wl-deploy">
        <Select value={deploymentPreference} onValueChange={setDeploymentPreference} disabled={status === 'loading'}>
          <SelectTrigger id="wl-deploy">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="onprem_now">{t('signup.form.fields.deploymentPreference.options.onPremNow')}</SelectItem>
            <SelectItem value="saas_later">{t('signup.form.fields.deploymentPreference.options.saasLater')}</SelectItem>
            <SelectItem value="undecided">{t('signup.form.fields.deploymentPreference.options.undecided')}</SelectItem>
          </SelectContent>
        </Select>
      </FormField>

      <Button
        type="submit"
        variant="primary"
        size={isLarge ? 'lg' : 'md'}
        className="w-full justify-center"
        disabled={status === 'loading'}
      >
        {status === 'loading' ? t('signup.form.submitting') : t('signup.form.submit')}
      </Button>

    </form>
  );
}
