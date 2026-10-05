'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type * as React from 'react';

// BR-REC-136: the device decides (light/dark); a manual choice (ThemeToggle in the sidebar footer and
// Login) is stored and wins. next-themes sets the class in a blocking script before paint, so there is no
// wrong-theme flash. BR-REC-234: no single-letter shortcut (WCAG 2.1.4); the toggle is the only way.
function ThemeProvider({ children, ...props }: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      themes={['light', 'dark']}
      enableSystem
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}

export { ThemeProvider };
