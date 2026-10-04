import { isApiError } from '@/lib/api/errors';
import { messageForCode } from '@/lib/messages/errors';
import { ASSESSMENT_TEXT } from './text';

/**
 * The sentence next to the Save bar after a refused or failed Save, or null when the global handler owns it
 * (a 401 opens Login). A refusal the server explains (`NO_VALUES`, `DATE_IN_FUTURE`…) goes through
 * `messageForCode` (BR-REC-128); no answer at all, a timeout or a server error is "Not saved — check the
 * connection and tap Save again" (BR-REC-86).
 */
export function saveFailureText(error: unknown): string | null {
  if (isApiError(error)) {
    if (error.status === 401) return null;
    if (error.status < 500 && error.code !== undefined) return messageForCode(error.code);
  }
  return ASSESSMENT_TEXT.notSaved;
}
