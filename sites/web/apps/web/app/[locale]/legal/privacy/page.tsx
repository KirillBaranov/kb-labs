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
    title: t('legal.privacy.meta.title'),
    description: t('legal.privacy.meta.description'),
    path: '/legal/privacy',
  });
}

export default async function PrivacyPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <SiteHeader />
      <main>
        <LegalLayout title="Privacy Policy" updated="April 2026" currentHref="/legal/privacy">

          <p>
            KB Labs (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) operates the KB Labs platform and website.
            This Privacy Policy explains what data we collect, why we collect it, and how you can control it.
          </p>

          <h2>What we collect</h2>
          <p>We collect the following categories of data:</p>
          <ul>
            <li><strong>Account data</strong> — name, email address, and password (hashed) when you register.</li>
            <li><strong>Usage data</strong> — workflow runs, API calls, plugin invocations, and feature usage, aggregated and used to improve the platform.</li>
            <li><strong>Cookies</strong> — session cookies required for authentication and optional analytics cookies. See our <Link href={`/${locale}/legal/cookies`}>Cookie Policy</Link>.</li>
          </ul>

          <h2>How we use your data</h2>
          <ul>
            <li>To provide, operate, and improve the KB Labs platform</li>
            <li>To send transactional emails (account activity, billing receipts)</li>
            <li>To send product updates, if you have opted in</li>
            <li>To detect, prevent, and investigate security incidents</li>
            <li>To comply with legal obligations</li>
          </ul>
          <p>We do not sell your data. We do not use your workflow content to train machine learning models.</p>

          <h2>Website &amp; docs analytics</h2>
          <p>
            We collect anonymous usage analytics on <strong>kblabs.ru</strong> and <strong>docs.kblabs.ru</strong>
            to understand how visitors use the site and which documentation pages are helpful.
          </p>
          <p><strong>What we collect:</strong></p>
          <ul>
            <li>Page views (URL path, referrer, UTM parameters)</li>
            <li>Outbound link clicks (destination URL, link text)</li>
            <li>CTA clicks (e.g. &quot;Install&quot; button)</li>
            <li>Install command copy events</li>
            <li>Doc page feedback (👍/👎 per page — no free-text, no identity)</li>
            <li>Anonymous device ID (random UUID stored in <code>localStorage</code>, not linked to your identity)</li>
          </ul>
          <p><strong>What we do NOT collect:</strong></p>
          <ul>
            <li>Name, email, or any personally identifiable information</li>
            <li>IP addresses (not stored in analytics)</li>
            <li>Browser fingerprints</li>
          </ul>
          <p>
            Analytics on <strong>kblabs.ru</strong> are <strong>opt-in</strong> — you must accept cookies via the banner before
            any events are sent. On <strong>docs.kblabs.ru</strong> we collect only anonymous page view data and explicit
            doc feedback (a deliberate button click) without a consent gate, as no personal data is processed.
          </p>
          <p>
            All analytics flow through the KB Labs Gateway (<code>api.kblabs.ru</code>) and are stored in a
            self-hosted JSONL file. No third-party analytics services (Google Analytics, Segment, PostHog, etc.) are used.
            See our <Link href={`/${locale}/legal/cookies`}>Cookie Policy</Link> for localStorage details.
          </p>

          <h2>CLI telemetry (kb-create)</h2>
          <p>
            When you install KB Labs via <code>kb-create</code>, the installer may collect anonymous usage telemetry
            if you opt in during the setup wizard. Telemetry is <strong>off by default</strong> and requires explicit consent.
          </p>
          <p><strong>What we collect:</strong></p>
          <ul>
            <li>Operating system and architecture (e.g. macOS arm64)</li>
            <li>kb-create version</li>
            <li>Package manager used (pnpm, npm)</li>
            <li>Services and plugins selected</li>
            <li>Install duration, success or failure status</li>
            <li>Demo consent choice (demo / local / own key)</li>
            <li>Anonymous device ID (random, not linked to your identity)</li>
          </ul>
          <p><strong>What we do NOT collect:</strong></p>
          <ul>
            <li>Source code, file contents, or diffs</li>
            <li>File names or project structure</li>
            <li>API keys or credentials</li>
            <li>IP addresses (not logged by our Gateway)</li>
          </ul>
          <p>
            Telemetry is sent to the KB Labs Gateway with a device-scoped JWT token.
            You can disable telemetry at any time by setting <code>KB_TELEMETRY_DISABLED=true</code> or
            toggling it off in the setup wizard.
          </p>

          <h2>Demo mode (AI-powered code review)</h2>
          <p>
            When you run <code>kb-create --demo</code>, the installer offers an AI-powered code review
            of your recent commits. This feature requires explicit consent before any data leaves your machine.
          </p>
          <p><strong>Three consent options:</strong></p>
          <ul>
            <li><strong>Yes, run demo</strong> — git diffs from your last commits are sent to the KB Labs Gateway,
            which proxies them to OpenAI for analysis. Diffs are <strong>not stored</strong> — the Gateway is a pass-through proxy.
            50 free AI calls are included per device.</li>
            <li><strong>Local only</strong> — no network requests are made. Only local checks run (commit policy, build, test, lint).
            No data leaves your machine.</li>
            <li><strong>Use my own API key</strong> — diffs are sent directly to your chosen LLM provider.
            KB Labs Gateway is bypassed entirely — we see nothing.</li>
          </ul>
          <p>
            The Gateway logs only token counts for rate-limiting purposes. No diff content, file names,
            or code is stored or logged. Demo tokens expire after the call limit is reached.
          </p>

          <h2>Data sharing</h2>
          <p>We share data only with:</p>
          <ul>
            <li><strong>Infrastructure providers</strong> — cloud hosting and storage (under DPA)</li>
            <li><strong>Analytics</strong> — aggregated, anonymised usage data only</li>
            <li><strong>Legal requirements</strong> — when required by applicable law</li>
          </ul>

          <h2>Data retention</h2>
          <p>
            We retain account data for the duration of your subscription plus 30 days after deletion.
            Workflow run logs are retained according to your plan (7 days on Hobby, 30 days on Pro, configurable on Enterprise).
            Anonymised usage analytics may be retained indefinitely.
          </p>

          <h2>Your rights</h2>
          <p>Under GDPR and applicable law, you have the right to:</p>
          <ul>
            <li>Access the personal data we hold about you</li>
            <li>Correct inaccurate data</li>
            <li>Request deletion (&quot;right to be forgotten&quot;)</li>
            <li>Export your data in a portable format</li>
            <li>Object to or restrict processing</li>
            <li>Withdraw consent at any time</li>
          </ul>
          <p>To exercise any of these rights, email <a href="mailto:privacy@kblabs.ru">privacy@kblabs.ru</a>. We respond within 30 days.</p>

          <h2>Security</h2>
          <p>
            We use encryption at rest (AES-256) and in transit (TLS 1.3), access controls, and regular security reviews.
            For details, see our <Link href={`/${locale}/security`}>Security page</Link>.
          </p>

          <h2>Changes to this policy</h2>
          <p>
            We&apos;ll notify you by email and update the &quot;last updated&quot; date before making material changes.
            Continued use of the platform after changes constitutes acceptance.
          </p>

          <h2>Contact</h2>
          <p>
            Questions? Email <a href="mailto:privacy@kblabs.ru">privacy@kblabs.ru</a> or write to KB Labs, Remote-first, Russia.
          </p>

        </LegalLayout>
      </main>
      <SiteFooter />
    </>
  );
}
