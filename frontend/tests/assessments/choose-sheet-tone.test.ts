// Spec: docs/specs/member-records/ux.md (v11) BR-REC-185, BR-REC-197 + "Build clarifications (U1)":
//   status -> tone comes from one map (`toneFor`); overdue = danger, due soon = warning, reminder = info,
//   active = success, `neverRecorded` (a "Never recorded" row that is not yet overdue) = neutral.
// Bug: "Never recorded" was grey on the member page but amber in the Choose-assessment dialog.
// The sheet is a plain function component with no hooks: calling it returns its element tree, and the
// StatusBadge elements in it carry the tone and the words the user would see.
import { describe, expect, test } from 'bun:test';
import type { ReactElement, ReactNode } from 'react';
import StatusBadge from '@/components/common/StatusBadge';
import ChooseAssessmentSheet from '@/components/pages/assessments/ChooseAssessmentSheet';
import type { MemberDueRow } from '@/lib/assessments/types';
import { memberDueStatus } from '@/lib/due/status';
import { toneFor } from '@/lib/statusTone';

const TODAY = '2026-10-05';
const TYPE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const row = (over: Partial<MemberDueRow>): MemberDueRow => ({
  typeId: TYPE,
  typeName: 'Body composition',
  state: 'ok',
  neverRecorded: false,
  nextDueOn: '2026-11-10',
  daysOverdue: 0,
  flagged: false,
  snoozedUntil: null,
  items: [],
  ...over,
});

type Props = { type?: unknown; props?: Record<string, unknown> };

/** Every StatusBadge element anywhere in the tree (children and element-valued props such as `status`). */
const badges = (node: unknown, found: ReactElement[] = []): ReactElement[] => {
  if (Array.isArray(node)) {
    for (const child of node) badges(child, found);
    return found;
  }
  if (node && typeof node === 'object' && 'props' in node) {
    const el = node as Props & ReactElement;
    if (el.type === StatusBadge) found.push(el);
    for (const value of Object.values(el.props ?? {})) badges(value, found);
  }
  return found;
};

const text = (node: ReactNode): string =>
  Array.isArray(node) ? node.map(text).join('') : typeof node === 'string' ? node : '';

/** What the Choose-assessment dialog shows for one due row: { tone, words }. */
const inSheet = (due: MemberDueRow) => {
  const tree = ChooseAssessmentSheet({
    open: true,
    onOpenChange: () => {},
    firstName: 'Surya',
    assessments: [{ id: TYPE, name: 'Body composition' }],
    loadFailed: false,
    onRetry: () => {},
    due: [due],
    today: TODAY,
    onPick: () => {},
  });
  const found = badges(tree);
  expect(found.length).toBe(1);
  const props = (found[0] as Props).props as { tone: string; children: ReactNode };
  return { tone: props.tone, words: text(props.children) };
};

describe('BR-REC-185 Choose-assessment sheet: "Never recorded" has the one tone', () => {
  test('BR-REC-185 "Never recorded" not yet overdue is neutral, as the map says', () => {
    for (const state of ['ok', 'upcoming'] as const) {
      const shown = inSheet(row({ neverRecorded: true, state, nextDueOn: '2026-10-12' }));
      expect(shown.words).toBe('Never recorded');
      expect(shown.tone).toBe(toneFor('neverRecorded'));
      expect(shown.tone).toBe('neutral');
    }
  });

  test('BR-REC-185 the sheet and the member page show the same tone for "Never recorded"', () => {
    for (const state of ['ok', 'upcoming', 'overdue'] as const) {
      const due = row({
        neverRecorded: true,
        state,
        nextDueOn: '2026-10-01',
        daysOverdue: state === 'overdue' ? 4 : 0,
      });
      const onPage = memberDueStatus(due, TODAY);
      const shown = inSheet(due);
      expect(shown.words).toBe(onPage.text);
      expect(shown.tone).toBe(onPage.tone);
    }
  });
});

describe('BR-REC-185 / 197 Choose-assessment sheet: other statuses use the same map', () => {
  test.each<[string, Partial<MemberDueRow>, string]>([
    ['overdue 34 days', { state: 'overdue', nextDueOn: '2026-09-01', daysOverdue: 34 }, 'danger'],
    ['due in 5 days', { state: 'upcoming', nextDueOn: '2026-10-10', daysOverdue: -5 }, 'warning'],
    ['assess soon', { flagged: true, state: 'upcoming', nextDueOn: '2026-10-10' }, 'warning'],
    ['reminder on a day', { snoozedUntil: '2026-10-20', state: 'upcoming' }, 'info'],
  ])('BR-REC-185 %s -> %s', (_name, over, tone) => {
    expect(inSheet(row(over)).tone).toBe(tone as never);
  });

  test.each<[string, Partial<MemberDueRow>]>([
    ['overdue', { state: 'overdue', nextDueOn: '2026-09-01', daysOverdue: 34 }],
    ['due in 5 days', { state: 'upcoming', nextDueOn: '2026-10-10', daysOverdue: -5 }],
    ['due tomorrow', { state: 'upcoming', nextDueOn: '2026-10-06', daysOverdue: -1 }],
    ['assess soon', { flagged: true, state: 'upcoming', nextDueOn: '2026-10-10' }],
    ['reminder', { snoozedUntil: '2026-10-20', state: 'upcoming' }],
    ['next due (not due yet)', { state: 'ok', nextDueOn: '2026-12-12', daysOverdue: -68 }],
  ])('BR-REC-197 same words, same tone as the member page: %s', (_name, over) => {
    const due = row(over);
    const onPage = memberDueStatus(due, TODAY);
    const shown = inSheet(due);
    expect(shown.words).toBe(onPage.text);
    expect(shown.tone).toBe(onPage.tone);
  });
});
