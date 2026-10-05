import type { Metadata, Viewport } from 'next';
import { Outfit, Poppins } from 'next/font/google';
import { ThemeProvider } from '@/components/common/ThemeProvider';
import Providers from '@/lib/providers';
import './globals.css';

// BR-REC-150 / 174 / 220 (tactic 22): two self-hosted fonts, Latin only, size-matched fallback, swap.
// Only Outfit (all text, inputs, buttons, numbers with `tabular-nums`) is preloaded. Poppins (page and
// section titles, weight 600 only) is fetched by the browser when a screen uses it.
const outfit = Outfit({
  subsets: ['latin'],
  display: 'swap',
  adjustFontFallback: true,
  preload: true,
  variable: '--font-outfit',
});
const poppins = Poppins({
  subsets: ['latin'],
  weight: '600',
  display: 'swap',
  adjustFontFallback: true,
  preload: false,
  variable: '--font-poppins',
});
// BR-REC-234: every page sets its own title; "%s · Fionis India" is the template, "Fionis India" the default.
export const metadata: Metadata = {
  title: { default: 'Fionis India', template: '%s · Fionis India' },
  description: 'Fionis CRM',
};

// `viewport-fit=cover` lets the bottom bars use the safe area on phones with a home indicator.
// Zoom stays enabled (BR-REC-137: 200% text zoom).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`antialiased ${outfit.variable} ${poppins.variable}`}
    >
      <body>
        <ThemeProvider>
          {/* BR-REC-234: first stop for the keyboard; the target is the content area of every screen. */}
          <a href="#main" className="skip-link">
            Skip to content
          </a>
          <Providers>{children}</Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
