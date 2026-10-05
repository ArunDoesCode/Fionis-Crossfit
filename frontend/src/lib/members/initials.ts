const firstLetter = (word: string): string => Array.from(word)[0] ?? '';

/**
 * BR-REC-223: the first letters of the first and last word of the shown name, at most 2, upper case.
 * "Surya Pratap" -> "SP", "Madonna" -> "M", "Anna Maria de Souza" -> "AS".
 */
export const initialsOf = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  const last = words[words.length - 1];
  if (!first || !last) return '';
  const letters = words.length === 1 ? firstLetter(first) : firstLetter(first) + firstLetter(last);
  return letters.toLocaleUpperCase();
};
