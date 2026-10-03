const HOME = '/admin';
// Any address works as a base: only "did it stay on the base address" matters.
const BASE = 'http://app.invalid';

/**
 * The page to open after signing in: `raw` when it is a path inside the app, otherwise Home (BR-REC-39).
 * Refused: no leading "/", "//" and "/\" (another site once a browser reads them), a scheme or a host,
 * and control characters (browsers drop tabs and line breaks, so "/\t/evil.com" becomes "//evil.com").
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw) return HOME;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return HOME;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are exactly what is refused
  if (/[\u0000-\u001f\u007f]/.test(raw)) return HOME;
  try {
    return new URL(raw, BASE).origin === BASE ? raw : HOME;
  } catch {
    return HOME;
  }
}
