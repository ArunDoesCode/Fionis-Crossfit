'use client';

import { createContext, useContext, useState } from 'react';
import { useStore } from 'zustand';
import { createUiStore, type UiStore } from './uiStore';

const UiStoreContext = createContext<ReturnType<typeof createUiStore> | null>(null);

// Mount on the subtree that needs it (e.g. the admin shell), not at the root.
export default function UiStoreProvider({ children }: { children: React.ReactNode }) {
  const [store] = useState(() => createUiStore());
  return <UiStoreContext.Provider value={store}>{children}</UiStoreContext.Provider>;
}

export function useUiStore<T>(selector: (s: UiStore) => T): T {
  const store = useContext(UiStoreContext);
  if (!store) throw new Error('useUiStore must be used within UiStoreProvider');
  return useStore(store, selector);
}
