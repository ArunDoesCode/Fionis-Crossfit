'use client';

import { Moon02Icon, Sun03Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';

// The server cannot know the stored theme, so icon state and the accessible label are driven by the
// `dark` class on <html> (set by the next-themes script before paint). Nothing here reads the theme
// during render, hence no hydration mismatch and no mounted-state flicker.
const ICON =
  'absolute inset-0 size-4 transition-[rotate,scale,opacity] duration-300 ease-in-out motion-reduce:transition-none';

export default function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={className}
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      <span className="relative size-4" aria-hidden="true">
        <HugeiconsIcon
          icon={Sun03Icon}
          strokeWidth={2}
          className={`${ICON} rotate-0 scale-100 opacity-100 dark:-rotate-90 dark:scale-0 dark:opacity-0`}
        />
        <HugeiconsIcon
          icon={Moon02Icon}
          strokeWidth={2}
          className={`${ICON} rotate-90 scale-0 opacity-0 dark:rotate-0 dark:scale-100 dark:opacity-100`}
        />
      </span>
      <span className="sr-only dark:hidden">Switch to dark mode</span>
      <span className="sr-only hidden dark:inline">Switch to light mode</span>
    </Button>
  );
}
