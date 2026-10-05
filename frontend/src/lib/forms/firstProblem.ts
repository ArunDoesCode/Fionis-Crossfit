/** The top error summary shows from this many errors (BR-REC-189). */
export const SUMMARY_MIN = 3;

/**
 * The first field with an error in screen order: names in `order` first, then any other name that has an
 * error (in the order of `errors`). `undefined` when there is no error.
 */
export function firstProblem(errors: object, order: readonly string[]): string | undefined {
  const known = order.find((name) => name in errors);
  return known ?? Object.keys(errors)[0];
}
