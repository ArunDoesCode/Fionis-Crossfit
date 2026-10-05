// Spec: docs/specs/member-records/performance.md BR-REC-211 (draft autosave at most every 300 ms, written on
// page hide), BR-REC-85 (a cleared draft stays cleared). Headless: the hook is run through React's hook
// dispatcher by a tiny runner (no DOM in bun test), with fake timers, a fake window and a fake storage.
import { afterEach, beforeEach, describe, expect, jest, test } from 'bun:test';
import * as React from 'react';
import { clearDraft, draftKey } from '@/lib/assessments/draft';
import { useDraftAutosave } from '@/lib/assessments/useDraftAutosave';

type Props = Parameters<typeof useDraftAutosave>[0];
type Inputs = Props['inputs'];

const internals = (
  React as unknown as {
    __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: { H: unknown };
  }
).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

function renderHookRunner(initial: Props) {
  const refs: { current: unknown }[] = [];
  const effects: { deps?: unknown[]; cleanup?: (() => void) | undefined }[] = [];
  let props = initial;
  const render = () => {
    let r = 0;
    let e = 0;
    const pendingEffects: (() => void)[] = [];
    const dispatcher = {
      useRef: (init: unknown) => {
        const i = r++;
        refs[i] = refs[i] ?? { current: init };
        return refs[i];
      },
      useEffect: (fn: () => (() => void) | undefined, deps?: unknown[]) => {
        const i = e++;
        const prev = effects[i];
        const same =
          prev?.deps &&
          deps &&
          prev.deps.length === deps.length &&
          deps.every((d, k) => Object.is(d, prev.deps?.[k]));
        if (same) return;
        pendingEffects.push(() => {
          prev?.cleanup?.();
          effects[i] = { deps, cleanup: fn() };
        });
      },
    };
    const before = internals.H;
    internals.H = dispatcher;
    try {
      // biome-ignore lint/correctness/useHookAtTopLevel: the runner supplies the hook dispatcher
      useDraftAutosave(props);
    } finally {
      internals.H = before;
    }
    for (const run of pendingEffects) run();
  };
  render();
  return {
    rerender(next: Partial<Props>) {
      props = { ...props, ...next };
      render();
    },
    unmount() {
      for (const eff of effects) eff?.cleanup?.();
    },
  };
}

class FakeStorage {
  data = new Map<string, string>();
  sets: string[] = [];
  get length() {
    return this.data.size;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.sets.push(k);
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

let storage: FakeStorage;
let listeners: Record<string, (() => void)[]>;
const g = globalThis as unknown as { window?: unknown };
let originalWindow: unknown;

beforeEach(() => {
  jest.useFakeTimers();
  storage = new FakeStorage();
  listeners = {};
  originalWindow = g.window;
  g.window = {
    localStorage: storage,
    addEventListener: (t: string, f: () => void) => {
      listeners[t] = [...(listeners[t] ?? []), f];
    },
    removeEventListener: (t: string, f: () => void) => {
      listeners[t] = (listeners[t] ?? []).filter((x) => x !== f);
    },
  };
});
afterEach(() => {
  jest.useRealTimers();
  g.window = originalWindow;
});

const pagehide = () => {
  for (const f of [...(listeners.pagehide ?? [])]) f();
};
const KEY_A = draftKey('m1', 't1', '2026-10-01');
const KEY_B = draftKey('m1', 't1', '2026-10-02');
const typed = (v: string): Inputs => ({ weight: v }) as unknown as Inputs;
const base = (over: Partial<Props> = {}): Props => ({
  key: KEY_A,
  active: true,
  isEstimated: false,
  inputs: typed('80'),
  ...over,
});

describe('BR-REC-211 draft autosave', () => {
  test('BR-REC-211 typing is written after at most 300 ms', () => {
    renderHookRunner(base());
    jest.advanceTimersByTime(300);
    expect(storage.getItem(KEY_A)).not.toBeNull();
  });

  test('BR-REC-211 five quick edits cause at most one write per 300 ms', () => {
    const h = renderHookRunner(base({ inputs: typed('1') }));
    for (const v of ['12', '123', '1234', '12345']) {
      jest.advanceTimersByTime(40);
      h.rerender({ inputs: typed(v) });
    }
    jest.advanceTimersByTime(299);
    expect(storage.sets.length).toBeLessThanOrEqual(1);
    jest.advanceTimersByTime(1000);
    expect(JSON.parse(storage.getItem(KEY_A) as string).values).toEqual({ weight: '12345' });
  });

  test('BR-REC-211 pagehide writes the pending state at once', () => {
    renderHookRunner(base());
    expect(storage.getItem(KEY_A)).toBeNull();
    pagehide();
    expect(storage.getItem(KEY_A)).not.toBeNull();
  });

  test('BR-REC-211 pagehide after a key change writes the CURRENT key, not the old one', () => {
    const h = renderHookRunner(base({ inputs: typed('80') }));
    jest.advanceTimersByTime(300);
    storage.sets.length = 0;
    h.rerender({ key: KEY_B, inputs: typed('90') });
    pagehide();
    expect(storage.sets).toContain(KEY_B);
    expect(JSON.parse(storage.getItem(KEY_B) as string).values).toEqual({ weight: '90' });
  });

  test('BR-REC-211 a key change never writes the old key with the new inputs', () => {
    const h = renderHookRunner(base({ inputs: typed('80') }));
    jest.advanceTimersByTime(300);
    storage.data.delete(KEY_A);
    storage.sets.length = 0;
    h.rerender({ key: KEY_B, inputs: typed('90') });
    jest.advanceTimersByTime(1000);
    expect(storage.sets).not.toContain(KEY_A);
    expect(storage.getItem(KEY_A)).toBeNull();
  });

  test('BR-REC-85 a clear after a pending write leaves no draft: no timer write, no write on unmount', () => {
    const h = renderHookRunner(base());
    clearDraft(storage, KEY_A); // the save succeeded and cleared the draft
    h.rerender({ active: false }); // the save flow switches autosave off
    jest.advanceTimersByTime(1000);
    pagehide();
    h.unmount();
    expect(storage.getItem(KEY_A)).toBeNull();
  });

  test('BR-REC-85 unmounting with an unwritten edit keeps it (nothing lost on leaving)', () => {
    const h = renderHookRunner(base());
    h.unmount();
    expect(storage.getItem(KEY_A)).not.toBeNull();
  });
});
