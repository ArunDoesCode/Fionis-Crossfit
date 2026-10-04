'use client';

import { useQueryStates } from 'nuqs';
import { useCallback } from 'react';
import ChoiceChips from '@/components/common/ChoiceChips';
import EmptyState from '@/components/common/EmptyState';
import LinkButton from '@/components/common/LinkButton';
import SearchField from '@/components/common/SearchField';
import MemberResults from '@/components/pages/members/MemberResults';
import { useMemberList } from '@/lib/api/members/queries';
import {
  filterToStatus,
  MEMBER_FILTERS,
  type MemberFilter,
  memberListParams,
} from '@/lib/members/listParams';
import { isSearchReady } from '@/lib/members/search';
import { UI_TEXT, WORDS } from '@/lib/messages/words';

const FILTER_LABELS: Record<MemberFilter, string> = {
  all: 'All',
  active: 'Active',
  expiring: WORDS.endsSoon,
  expired: WORDS.ended,
  archived: 'Archived',
};
const FILTER_OPTIONS = MEMBER_FILTERS.map((value) => ({ value, label: FILTER_LABELS[value] }));

const NOTHING_IN_FILTER: Record<Exclude<MemberFilter, 'all'>, string> = {
  active: 'No active members.',
  expiring: 'No memberships end soon.',
  expired: 'No ended memberships.',
  archived: 'No archived members.',
};

// S5 Members (BR-REC-07, 56, 57): search (2+ letters) and the chips All · Active · Ends soon · Ended ·
// Archived. Search under Archived looks only at archived members. The text and the chip live in the URL, so
// Back from a member returns to the same list.
export default function MemberListPanel() {
  const [{ q, status }, setParams] = useQueryStates(memberListParams);
  const searching = isSearchReady(q);
  const query = useMemberList({
    q: searching ? q.trim() : undefined,
    status: filterToStatus(status),
  });
  const setQ = useCallback((value: string) => void setParams({ q: value }), [setParams]);

  // BR-REC-130: one sentence, and at most one action ("No members yet." [Add member]).
  let empty: React.ReactNode;
  if (searching) {
    const who = status === 'archived' ? 'No archived member' : 'No member';
    empty = <EmptyState title={`${who} matches "${q.trim()}".`} />;
  } else if (status === 'all') {
    empty = (
      <EmptyState
        title="No members yet."
        action={
          <LinkButton href="/admin/members/new" variant="secondary">
            {UI_TEXT.screens.addMember}
          </LinkButton>
        }
      />
    );
  } else {
    empty = <EmptyState title={NOTHING_IN_FILTER[status]} />;
  }

  return (
    <>
      <SearchField label={UI_TEXT.searchMembers} value={q} onChange={setQ} />
      <ChoiceChips
        legend="Show"
        hideLegend
        options={FILTER_OPTIONS}
        value={status}
        onChange={(value) => void setParams({ status: value })}
      />
      <MemberResults query={query} empty={empty} />
    </>
  );
}
