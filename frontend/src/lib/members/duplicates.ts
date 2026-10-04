import type { MemberListItem } from './types';

/**
 * BR-REC-47: the other members who use the phone (the one being edited is dropped). Archived ones are
 * marked in the label. The warning only informs: it never blocks saving (BR-REC-04).
 */
export const duplicatePhoneMatches = (
  items: readonly Pick<MemberListItem, 'id' | 'fullName' | 'archivedAt'>[],
  selfId?: string,
): { id: string; label: string }[] =>
  items
    .filter((item) => item.id !== selfId)
    .map((item) => ({
      id: item.id,
      label: item.archivedAt ? `${item.fullName} (archived)` : item.fullName,
    }));
