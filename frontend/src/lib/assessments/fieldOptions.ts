// How a field behaves on a phone (D17, BR-REC-91). Pure.

/** A minus key is offered unless the measurement's lower check limit is 0 or more (Flexibility has -5). */
export const canBeNegative = (plausibleMin: number | null): boolean =>
  plausibleMin === null || plausibleMin < 0;

/** The keypad key: "next" moves to the next field, the last field says "done". */
export const enterKeyHintFor = (index: number, count: number): 'next' | 'done' =>
  index >= count - 1 ? 'done' : 'next';
