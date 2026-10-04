// Pure helpers for the text of a number field (BR-REC-76, 126). A number field is text until Save,
// so these work on the typed string and never parse it; the screen's parser decides what is valid.

/**
 * Flips the leading minus sign of typed number text: "95.5" -> "-95.5", "-95.5" -> "95.5", "" -> "-".
 * The sign is ASCII "-". Leading spaces are dropped. Used by the "Make negative" button of NumberField,
 * because the iPhone decimal keypad has no minus key.
 */
export const toggleMinus = (text: string): string => {
  const trimmed = text.trimStart();
  return trimmed.startsWith('-') ? trimmed.slice(1) : `-${trimmed}`;
};
