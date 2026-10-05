import type { MemberSearchField } from './directory';

/**
 * BR-REC-231: the field picked from the text. Only digits (spaces, `+`, `-` allowed) -> phone,
 * text with `@` -> email, anything else (and nothing typed) -> name.
 */
export const fieldForText = (text: string): MemberSearchField => {
  if (text.includes('@')) return 'email';
  if (/^[\d\s+-]*\d[\d\s+-]*$/.test(text)) return 'phone';
  return 'name';
};

/** The field in use: a manual pick wins while there is text; once the text is cleared the pick is gone. */
export const activeSearchField = (
  text: string,
  manual: MemberSearchField | null,
): MemberSearchField => (text.trim() === '' ? 'name' : (manual ?? fieldForText(text)));
