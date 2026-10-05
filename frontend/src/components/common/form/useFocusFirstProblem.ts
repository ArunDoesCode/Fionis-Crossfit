'use client';

import { useCallback } from 'react';
import type { FieldErrors } from 'react-hook-form';
import { firstProblem } from '@/lib/forms/firstProblem';

const FOCUSABLE = 'input, textarea, select, button, [tabindex]:not([tabindex="-1"])';

/** The element of a field: the FormItem that carries `data-field="<name>"`. */
const itemOf = (name: string): HTMLElement | null =>
  document.querySelector<HTMLElement>(`[data-field="${CSS.escape(name)}"]`);

/** Opens a closed <details> or a closed collapsible panel (hidden, opened by its `aria-controls` trigger). */
function openAncestors(element: HTMLElement): boolean {
  let opened = false;
  const details = element.closest('details');
  if (details && !details.open) {
    details.open = true;
    opened = true;
  }
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (!parent.hidden || !parent.id) continue;
    const trigger = document.querySelector<HTMLElement>(
      `[aria-controls="${CSS.escape(parent.id)}"]`,
    );
    trigger?.click();
    opened = opened || Boolean(trigger);
  }
  return opened;
}

/** Puts the cursor in a field (and scrolls to it, smoothly unless the device asks for less motion). */
export function focusField(name: string): void {
  const item = itemOf(name);
  if (!item) return;
  const go = () => {
    const target = item.matches(FOCUSABLE) ? item : item.querySelector<HTMLElement>(FOCUSABLE);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    item.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
    target?.focus({ preventScroll: true });
  };
  if (openAncestors(item)) requestAnimationFrame(go);
  else go();
}

/**
 * "Save jumps to the first problem" (BR-REC-189): pass the result to `handleSubmit(onValid, focusFirst)`.
 * `order` is the field names in screen order.
 */
export function useFocusFirstProblem(order: readonly string[]) {
  return useCallback(
    (errors: FieldErrors) => {
      const name = firstProblem(errors, order);
      if (name) focusField(name);
    },
    [order],
  );
}
