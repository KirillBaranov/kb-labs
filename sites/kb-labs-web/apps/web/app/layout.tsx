// Root layout — required for Next.js app router.
// Actual layout (fonts, providers) lives in [locale]/layout.tsx.
// This exists so that app/not-found.tsx can render properly.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
