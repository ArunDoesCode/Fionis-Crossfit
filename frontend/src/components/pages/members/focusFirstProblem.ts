import { fieldId, MEMBER_FORM_ORDER } from '@/lib/members/formFields';

const FOCUSABLE = 'input, textarea, button';

/**
 * "Save jumps to the first problem" (BR-REC-134): scrolls to the first field, in screen order, that has
 * an error and puts the cursor there. A field inside a closed "More details" opens it first. Chips (a set
 * of buttons in a box with the field's id) focus their first button.
 */
export function focusFirstProblem(formId: string, errors: Record<string, unknown>): void {
  const field = MEMBER_FORM_ORDER.find((name) => name in errors);
  if (!field) return;
  const element = document.getElementById(fieldId(formId, field));
  if (!element) return;
  const details = element.closest('details');
  if (details) details.open = true;
  const target = element.matches(FOCUSABLE)
    ? element
    : element.querySelector<HTMLElement>(FOCUSABLE);
  element.scrollIntoView({ block: 'center', behavior: 'smooth' });
  target?.focus({ preventScroll: true });
}
