import type { Metadata } from 'next';
import { Geist_Mono, Outfit, Raleway } from 'next/font/google';
import { ThemeProvider } from '@/components/common/ThemeProvider';
import Providers from '@/lib/providers';
import { cn } from '@/lib/utils';
import './globals.css';

const ralewayHeading = Raleway({ subsets: ['latin'], variable: '--font-heading' });
const outfit = Outfit({ subsets: ['latin'], variable: '--font-sans' });
const fontMono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Gym admin',
  description: 'Trainer and owner admin',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        'antialiased',
        fontMono.variable,
        'font-sans',
        outfit.variable,
        ralewayHeading.variable,
      )}
    >
      <body>
        <ThemeProvider>
          <Providers>{children}</Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
