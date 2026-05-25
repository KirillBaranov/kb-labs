'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CheckCircle2, CloudUpload, ListChecks, MessageCircle, type LucideIcon } from 'lucide-react';
import { WaitlistForm } from './WaitlistForm';

const PERK_ICONS: LucideIcon[] = [CloudUpload, ListChecks, MessageCircle];

type Perk = { label: string; description: string };

type Props = {
  locale: string;
  perks: Perk[];
  formTitle: string;
  formDescription: string;
  formNotePrefix: string;
  formNoteLink: string;
  formNoteSuffix: string;
  successMessage: string;
};

export function SignupFormCard({
  locale,
  perks,
  formTitle,
  formDescription,
  formNotePrefix,
  formNoteLink,
  formNoteSuffix,
  successMessage,
}: Props) {
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="mx-auto max-w-sm rounded-2xl border border-line bg-surface p-10">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex size-12 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-500">
            <CheckCircle2 size={24} />
          </div>
          <p className="text-base font-semibold text-kb-text">{successMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_1.15fr] lg:items-start">

      {/* Left — perks */}
      <div className="flex flex-col gap-6 pt-1">
        {perks.map((perk, i) => {
          const Icon = PERK_ICONS[i];
          return (
            <div key={perk.label} className="flex gap-4">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-accent">
                {Icon && <Icon size={16} />}
              </div>
              <div>
                <p className="text-sm font-semibold text-kb-text">{perk.label}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-muted/60">{perk.description}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Right — form */}
      <div className="rounded-2xl border border-line bg-surface p-6 lg:p-8">
        <h2 className="mb-1 text-xl font-semibold text-kb-text">{formTitle}</h2>
        <p className="mb-6 text-sm text-muted/55">{formDescription}</p>
        <WaitlistForm onSuccess={() => setDone(true)} />
        <p className="mt-5 text-xs text-muted/50 dark:text-muted/35">
          {formNotePrefix}{' '}
          <Link
            href={`/${locale}/legal/privacy`}
            className="underline underline-offset-2 hover:text-muted/60 transition-colors"
          >
            {formNoteLink}
          </Link>
          {formNoteSuffix}
        </p>
      </div>

    </div>
  );
}
