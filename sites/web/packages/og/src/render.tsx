import * as React from 'react';
import { ImageResponse } from 'next/og';

import { BRAND, OG_SIZE, OG_CONTENT_TYPE } from './brand';
import { loadFont } from './fonts';
import { FlaskLogo } from './logo';

export { OG_SIZE, OG_CONTENT_TYPE };

export type OgVariant = 'default' | 'docs' | 'blog' | 'product' | 'changelog' | 'marketplace';

export interface RenderOgImageOptions {
  /** Main heading rendered with display weight. */
  title: string;
  /** Optional supporting line shown under the title. */
  description?: string;
  /** Optional pill in the bottom-right corner (e.g. "Docs", "Blog"). */
  badge?: string;
  /** Optional eyebrow text shown above the title. */
  eyebrow?: string;
  /** Branding URL shown in the bottom-left. Defaults to "kblabs.ru". */
  url?: string;
}

function fitTitleSize(title: string): number {
  const len = title.length;
  if (len <= 28) return 84;
  if (len <= 48) return 72;
  if (len <= 72) return 60;
  if (len <= 100) return 50;
  return 44;
}

export async function renderOgImage(options: RenderOgImageOptions): Promise<ImageResponse> {
  const { title, description, badge, eyebrow, url = 'kblabs.ru' } = options;

  const [headingFont, bodyFont] = await Promise.all([
    loadFont({ family: 'plus-jakarta-sans', weight: 800 }),
    loadFont({ family: 'inter', weight: 500 }),
  ]);

  const titleSize = fitTitleSize(title);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          backgroundColor: BRAND.bg,
          backgroundImage: `radial-gradient(ellipse 120% 80% at 85% 0%, ${BRAND.accent}33 0%, transparent 55%), radial-gradient(ellipse 100% 70% at 0% 100%, ${BRAND.accentSoft}22 0%, transparent 60%), linear-gradient(160deg, ${BRAND.bg} 0%, ${BRAND.bgGradientEnd} 100%)`,
          color: BRAND.text,
          fontFamily: 'Inter',
          padding: '72px 88px',
          overflow: 'hidden',
        }}
      >
        {/* Dot grid overlay (matches site background pattern) */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'radial-gradient(circle, rgba(234,243,255,0.08) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
            display: 'flex',
          }}
        />

        {/* Decorative corner glow */}
        <div
          style={{
            position: 'absolute',
            top: -120,
            right: -120,
            width: 360,
            height: 360,
            borderRadius: '50%',
            backgroundColor: BRAND.accent,
            opacity: 0.18,
            filter: 'blur(80px)',
            display: 'flex',
          }}
        />

        {/* Top: brand */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            zIndex: 1,
          }}
        >
          <FlaskLogo size={56} />
          <div
            style={{
              fontFamily: 'Plus Jakarta Sans',
              fontSize: 32,
              fontWeight: 800,
              letterSpacing: -0.5,
            }}
          >
            KB Labs
          </div>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1, display: 'flex' }} />

        {/* Title block */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
            zIndex: 1,
            maxWidth: 1024,
          }}
        >
          {eyebrow ? (
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: 2,
                textTransform: 'uppercase',
                color: BRAND.accent,
              }}
            >
              {eyebrow}
            </div>
          ) : null}

          <div
            style={{
              fontFamily: 'Plus Jakarta Sans',
              fontSize: titleSize,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: -1.5,
              color: BRAND.text,
            }}
          >
            {title}
          </div>

          {description ? (
            <div
              style={{
                fontSize: 26,
                lineHeight: 1.4,
                color: BRAND.muted,
                maxWidth: 920,
                fontWeight: 500,
              }}
            >
              {description}
            </div>
          ) : null}
        </div>

        {/* Bottom row: url + badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 48,
            paddingTop: 28,
            borderTop: `1px solid ${BRAND.line}`,
            zIndex: 1,
          }}
        >
          <div
            style={{
              fontSize: 22,
              color: BRAND.muted,
              fontWeight: 500,
              letterSpacing: 0.2,
            }}
          >
            {url}
          </div>

          {badge ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '10px 22px',
                borderRadius: 999,
                backgroundColor: BRAND.accent,
                color: '#ffffff',
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: 1.4,
                textTransform: 'uppercase',
              }}
            >
              {badge}
            </div>
          ) : null}
        </div>

        {/* Accent bar */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            bottom: 0,
            width: '100%',
            height: 8,
            backgroundColor: BRAND.accent,
            display: 'flex',
          }}
        />
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        {
          name: 'Plus Jakarta Sans',
          data: headingFont,
          style: 'normal',
          weight: 800,
        },
        {
          name: 'Inter',
          data: bodyFont,
          style: 'normal',
          weight: 500,
        },
      ],
    },
  );
}
