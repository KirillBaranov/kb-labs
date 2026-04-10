import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { routing } from '@/i18n/routing';
import { LegalLayout } from '../LegalLayout';
import { buildPageMetadata } from '@/lib/page-metadata';


type Props = { params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return buildPageMetadata({
    locale,
    title: t('legal.dpa.meta.title'),
    description: t('legal.dpa.meta.description'),
    path: '/legal/dpa',
  });
}

export default async function DpaPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <SiteHeader />
      <main>
        <LegalLayout title="Data Processing Agreement" updated="January 2026" currentHref="/legal/dpa">

          <p>
            This Data Processing Agreement (&quot;DPA&quot;) supplements our Terms of Service and applies
            where KB Labs processes personal data on your behalf as a data processor under GDPR
            or equivalent data protection law.
          </p>

          <h2>Definitions</h2>
          <ul>
            <li><strong>Controller</strong> — you, the customer, who determines the purposes and means of processing.</li>
            <li><strong>Processor</strong> — KB Labs, acting on your instructions to process personal data.</li>
            <li><strong>Sub-processor</strong> — a third party engaged by KB Labs to assist in processing.</li>
            <li><strong>Personal data</strong> — any information relating to an identified or identifiable natural person.</li>
          </ul>

          <h2>Processing instructions</h2>
          <p>
            KB Labs will process personal data only on your documented instructions, including those set
            out in the Terms of Service and this DPA, unless required to do so by applicable law.
            KB Labs will promptly inform you if any instruction infringes data protection law.
          </p>

          <h2>Confidentiality</h2>
          <p>
            KB Labs will ensure that persons authorised to process personal data are subject to
            appropriate confidentiality obligations and are trained in data protection requirements.
          </p>

          <h2>Security measures</h2>
          <p>
            KB Labs implements and maintains appropriate technical and organisational security measures,
            including encryption at rest (AES-256), encryption in transit (TLS 1.3), access controls,
            and regular security reviews. See our <Link href={`/${locale}/security`}>Security page</Link> for details.
          </p>

          <h2>Sub-processors</h2>
          <p>
            KB Labs uses the following categories of sub-processors to deliver the Service:
          </p>
          <ul>
            <li><strong>Cloud infrastructure</strong> — hosting, storage, and networking</li>
            <li><strong>Payment processing</strong> — Stripe (PCI DSS Level 1 certified)</li>
            <li><strong>Email delivery</strong> — transactional email service</li>
            <li><strong>Monitoring</strong> — error tracking and performance monitoring</li>
          </ul>
          <p>
            We will notify you of any intended changes to sub-processors with at least 14 days&apos; notice.
            A current list of sub-processors is available on request at <a href="mailto:privacy@kblabs.ru">privacy@kblabs.ru</a>.
          </p>

          <h2>International transfers</h2>
          <p>
            Where personal data is transferred outside the EEA or UK, KB Labs ensures appropriate
            safeguards are in place, such as Standard Contractual Clauses (SCCs) or adequacy decisions.
            Enterprise customers may request EU-only data residency.
          </p>

          <h2>Data subject rights</h2>
          <p>
            KB Labs will assist you in responding to requests from data subjects exercising their rights
            under applicable data protection law (access, rectification, erasure, portability, etc.),
            taking into account the nature of the processing and the information available.
          </p>

          <h2>Data breach notification</h2>
          <p>
            KB Labs will notify you without undue delay, and in any event within 72 hours, of becoming
            aware of a personal data breach affecting your data. Notification will include the nature
            of the breach, categories and approximate number of affected data subjects, and recommended
            mitigation steps.
          </p>

          <h2>Deletion and return</h2>
          <p>
            On termination of the Services, KB Labs will delete all personal data within 30 days,
            unless applicable law requires retention. On request, we will provide a written
            confirmation of deletion.
          </p>

          <h2>Audit rights</h2>
          <p>
            You may audit KB Labs&apos; compliance with this DPA, subject to 30 days&apos; written notice
            and at your expense. We will provide access to relevant documentation and, where available,
            share third-party audit reports (SOC 2, etc.) in lieu of an on-site audit.
          </p>

          <h2>Contact</h2>
          <p>
            For DPA-related enquiries, email <a href="mailto:privacy@kblabs.ru">privacy@kblabs.ru</a>.
            Enterprise customers can request a countersigned DPA for their records.
          </p>

        </LegalLayout>
      </main>
      <SiteFooter />
    </>
  );
}
