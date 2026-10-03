import type { Metadata, Viewport } from 'next';
import { Geist_Mono, Outfit, Raleway } from 'next/font/google';
import { ThemeProvider } from '@/components/common/ThemeProvider';
import Providers from '@/lib/providers';
import { cn } from '@/lib/utils';
import './globals.css';

// BR-REC-150 / 174 (tactic 22): three self-hosted fonts, Latin only, size-matched fallback, swap.
// Only Outfit (all text, inputs, buttons) is preloaded. Raleway (page and section titles, weight 600
// only) and Geist Mono (number columns only) are fetched by the browser when a screen uses them.
const outfit = Outfit({
  subsets: ['latin'],
  display: 'swap',
  adjustFontFallback: true,
  preload: true,
  variable: '--font-outfit',
});
const raleway = Raleway({
  subsets: ['latin'],
  weight: '600',
  display: 'swap',
  adjustFontFallback: true,
  preload: false,
  variable: '--font-raleway',
});
const geistMono = Geist_Mono({
  subsets: ['latin'],
  display: 'swap',
  adjustFontFallback: true,
  preload: false,
  variable: '--font-geist-mono',
});

export const metadata: Metadata = {
  title: 'Gym admin',
  description: 'Trainer and owner admin',
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
      className={cn('antialiased', outfit.variable, raleway.variable, geistMono.variable)}
    >
      <body>
        <ThemeProvider>
          <Providers>{children}</Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
