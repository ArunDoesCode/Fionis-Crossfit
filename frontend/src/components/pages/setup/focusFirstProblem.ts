// BR-REC-134: Save stays tappable and jumps to the first problem. `order` is the order of the fields on
// screen, `ids` maps a field name to the id of the element that takes focus (a Time field's first box is
// `<id>-min`). Fields without an element (chips) are skipped in favour of the next problem.
export function focusFirstProblem(
  errors: object,
  order: readonly string[],
  ids: Readonly<Record<string, string>>,
): void {
  for (const field of order) {
    if (!(field in errors)) continue;
    const element = document.getElementById(ids[field] ?? '');
    if (!element) continue;
    element.focus({ preventScroll: true });
    element.scrollIntoView({ block: 'center' });
    return;
  }
}
