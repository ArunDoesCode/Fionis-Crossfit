/** Smooth scrolling unless the device asks for less motion (BR-REC-137). */
export const scrollBehavior = (): ScrollBehavior =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

/** The id of the Date field. */
export const dateDomId = (formId: string): string => `${formId}-date`;

/** The id of a measurement's field (Time fields add "-min" / "-sec" to it). */
export const fieldDomId = (formId: string, metricId: string): string => `${formId}-${metricId}`;

/** Scrolls to a field and puts the cursor there ("Save jumps to the first problem", BR-REC-134). */
export function focusField(id: string): void {
  const element = document.getElementById(id) ?? document.getElementById(`${id}-min`);
  if (!element) return;
  element.scrollIntoView({ block: 'center', behavior: scrollBehavior() });
  element.focus({ preventScroll: true });
}
