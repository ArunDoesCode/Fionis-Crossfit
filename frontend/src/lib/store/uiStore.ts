import { devtools } from 'zustand/middleware';
import { createStore } from 'zustand/vanilla';

// Minimal UI-only store (ids / flags, never server objects). Add feature stores as `[feature]Store.ts`.
export interface UiState {
  isSidebarOpen: boolean;
}
export interface UiActions {
  toggleSidebar: () => void;
  reset: () => void;
}
export type UiStore = UiState & UiActions;

const initialState: UiState = { isSidebarOpen: true };

export const createUiStore = (init: Partial<UiState> = {}) =>
  createStore<UiStore>()(
    devtools(
      (set) => ({
        ...initialState,
        ...init,
        toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
        reset: () => set(initialState),
      }),
      { name: 'ui-store', enabled: process.env.NODE_ENV !== 'production' },
    ),
  );
