import type { ExportFile } from '@/lib/api/progress/fetchers';
import { PROGRESS_TEXT } from './text';

/** The three CSV files of S18 (BR-REC-119); the Reports header offers the same three (BR-REC-228). */
export const EXPORT_FILES: readonly { file: ExportFile; title: string }[] = [
  { file: 'members.csv', title: PROGRESS_TEXT.export.members },
  { file: 'memberships.csv', title: PROGRESS_TEXT.export.memberships },
  { file: 'measurements.csv', title: PROGRESS_TEXT.export.measurements },
];
