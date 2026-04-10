import type { Metadata } from 'next';

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
    title: t('legal.terms.meta.title'),
    description: t('legal.terms.meta.description'),
    path: '/legal/terms',
  });
}

export default async function TermsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <SiteHeader />
      <main>
        <LegalLayout title="Terms of Service" updated="January 2026" currentHref="/legal/terms">

          <p>
            These Terms of Service (&quot;Terms&quot;) govern your use of the KB Labs platform and services.
            By creating an account or using the platform, you agree to these Terms.
          </p>

          <h2>The service</h2>
          <p>
            KB Labs provides a workflow automation platform including a CLI, SDK, Studio UI, REST API,
            and plugin runtime (collectively, &quot;the Service&quot;). We reserve the right to modify,
            suspend, or discontinue any part of the Service with reasonable notice.
          </p>

          <h2>Your account</h2>
          <p>
            You are responsible for maintaining the confidentiality of your credentials and for all
            activity under your account. Notify us immediately at <a href="mailto:security@kblabs.ru">security@kblabs.ru</a> if
            you suspect unauthorized access.
          </p>
          <p>You must not:</p>
          <ul>
            <li>Share your account or API keys with third parties</li>
            <li>Use the Service to send spam or malicious content</li>
            <li>Attempt to reverse engineer or circumvent security controls</li>
            <li>Use the Service in violation of applicable law</li>
            <li>Exceed usage quotas through automated abuse</li>
          </ul>

          <h2>Intellectual property</h2>
          <p>
            You retain ownership of all workflow definitions, plugins, and content you create.
            By using the Service, you grant KB Labs a limited license to process your content
            solely to provide the Service.
          </p>
          <p>
            The KB Labs platform, brand, and documentation are our intellectual property.
            Open-source components are licensed under their respective licenses (see our GitHub).
          </p>

          <h2>Billing and payments</h2>
          <p>
            Paid plans are billed in advance on a monthly or annual cycle. All fees are non-refundable
            except where required by law. If you exceed your plan&apos;s usage limits, new runs will be
            queued (Hobby) or you will be notified to upgrade (Pro).
          </p>
          <p>
            We reserve the right to change pricing with 30 days&apos; notice. Price changes apply at
            the start of your next billing cycle.
          </p>

          <h2>Uptime and SLA</h2>
          <p>
            We target 99.9% monthly uptime on all paid plans. An SLA with financial remedies is
            available on Enterprise plans. Current status is published at{' '}
            <a href="https://status.kblabs.ru" target="_blank" rel="noreferrer">status.kblabs.ru</a>.
          </p>

          <h2>Limitation of liability</h2>
          <p>
            To the maximum extent permitted by law, KB Labs shall not be liable for indirect,
            incidental, or consequential damages arising from your use of the Service.
            Our total liability to you in any month shall not exceed the fees you paid in that month.
          </p>

          <h2>Termination</h2>
          <p>
            You may terminate your account at any time from your account settings. We may terminate
            or suspend access for material breach of these Terms with notice where practicable.
            On termination, your data is deleted within 30 days.
          </p>

          <h2>Governing law</h2>
          <p>
            These Terms are governed by applicable law. Disputes shall be resolved by binding
            arbitration or the courts of competent jurisdiction, at our mutual election.
          </p>

          <h2>Changes</h2>
          <p>
            We&apos;ll notify you by email 14 days before making material changes. Continued use
            after that date constitutes acceptance of the revised Terms.
          </p>

          <h2>Contact</h2>
          <p>
            Questions about these Terms? Email <a href="mailto:hello@kblabs.ru">hello@kblabs.ru</a>.
          </p>

        </LegalLayout>
      </main>
      <SiteFooter />
    </>
  );
}
