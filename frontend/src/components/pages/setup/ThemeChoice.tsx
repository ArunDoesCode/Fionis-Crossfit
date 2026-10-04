'use client';

import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';
import ChoiceChips from '@/components/common/ChoiceChips';
import { SETUP_TEXT } from '@/lib/setup/text';

type ThemeName = 'system' | 'light' | 'dark';

const OPTIONS: readonly { value: ThemeName; label: string }[] = [
  { value: 'system', label: SETUP_TEXT.hub.theme.system },
  { value: 'light', label: SETUP_TEXT.hub.theme.light },
  { value: 'dark', label: SETUP_TEXT.hub.theme.dark },
];

const isThemeName = (value: string | undefined): value is ThemeName =>
  value === 'system' || value === 'light' || value === 'dark';

// The server cannot know the stored theme, so nothing is shown as chosen until the browser has mounted
// (no hydration mismatch). BR-REC-136: the device decides ("System"); a manual choice is stored and wins.
const subscribe = () => () => {};

export default function ThemeChoice() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  return (
    <ChoiceChips
      legend={SETUP_TEXT.hub.theme.legend}
      hideLegend
      options={OPTIONS}
      value={mounted && isThemeName(theme) ? theme : null}
      onChange={setTheme}
    />
  );
}
