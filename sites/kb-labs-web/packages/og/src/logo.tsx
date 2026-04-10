import * as React from 'react';

interface FlaskLogoProps {
  size?: number;
}

export function FlaskLogo({ size = 56 }: FlaskLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
    >
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#0B1320" />
      <path
        d="M27 10h10v7l-1.6 2.3v8.4c0 2.2.9 4.4 2.4 6.1l6.4 9c2.8 3.9.1 9.2-4.7 9.2H24.5c-4.8 0-7.5-5.3-4.7-9.2l6.4-9c1.5-1.7 2.4-3.9 2.4-6.1v-8.4L27 17z"
        fill="#EAF3FF"
      />
      <path
        d="M21.8 43.2c2.2-2.8 18.2-2.8 20.4 0l2 2.8c1.8 2.6-.1 6-3.2 6H23c-3.1 0-5-3.4-3.2-6z"
        fill="#3B82F6"
      />
      <ellipse cx="28" cy="35.2" rx="3.3" ry="5.4" fill="#FFFFFF" opacity="0.48" />
      <circle cx="35.5" cy="46.2" r="1.6" fill="#BFDBFE" />
    </svg>
  );
}
