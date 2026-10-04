import type { IsoDate } from '@/lib/domain/dates';
import type { DueListItem, MemberDueItem } from './types';

/** What the row sheet needs to know about the row it was opened from. */
export interface DueTarget {
  memberId: string;
  typeId: string;
  /** The sheet's spoken name: the member on the lists, the assessment on the member page. */
  title: string;
  /** The line under the title, when there is one. */
  detail?: string;
  /** Assess soon is on: the sheet offers "Remove Assess soon". */
  flagged: boolean;
  /** A reminder is on until this day: the sheet offers "Remove reminder". */
  snoozedUntil: IsoDate | null;
  /** The lists offer "Open member"; the member page already is the member. */
  openMember: boolean;
}

/** A row of Home / S3: the member's name, the assessment under it. A listed row never has a reminder (it is hidden). */
export const listTarget = (item: DueListItem): DueTarget => ({
  memberId: item.memberId,
  typeId: item.typeId,
  title: item.fullName,
  detail: item.typeName,
  flagged: item.flagged,
  snoozedUntil: null,
  openMember: true,
});

/** A line of the member page. */
export const lineTarget = (memberId: string, line: MemberDueItem): DueTarget => ({
  memberId,
  typeId: line.typeId,
  title: line.typeName,
  flagged: line.flagged,
  snoozedUntil: line.snoozedUntil,
  openMember: false,
});
