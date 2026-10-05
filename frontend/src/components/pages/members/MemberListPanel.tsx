'use client';

import Link from 'next/link';
import { useQueryStates } from 'nuqs';
import { useMemo } from 'react';
import ChoiceChips from '@/components/common/ChoiceChips';
import EmptyState from '@/components/common/EmptyState';
import MemberSearch from '@/components/common/MemberSearch';
import MemberDirectoryResults from '@/components/pages/members/MemberDirectoryResults';
import { Button } from '@/components/ui/button';
import { useMemberDirectory } from '@/lib/api/members/queries';
import { foldText, MIN_SEARCH_CHARS, searchMembers } from '@/lib/members/directory';
import { MEMBER_FILTERS, type MemberFilter, memberListParams } from '@/lib/members/listParams';
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

// S5 Members (BR-REC-57, 201, 202, 204): search (2+ letters, by name, email or phone) and the chips All ·
// Active · Ends soon · Ended · Archived. Search under Archived looks only at archived members. The text, the
// field and the chip live in the URL (replaced, one history entry), so Back from a member returns to the
// same list.
export default function MemberListPanel() {
  const [{ q, by, status }, setParams] = useQueryStates(memberListParams);
  const searching = foldText(q).length >= MIN_SEARCH_CHARS;
  const text = q.trim();
  const { data, isError, refetch } = useMemberDirectory();
  const rows = useMemo(
    () =>
      data &&
      searchMembers(data, {
        text: q,
        field: by,
        archived: status === 'archived',
        membership:
          status === 'active' || status === 'expiring' || status === 'expired' ? status : undefined,
      }),
    [data, q, by, status],
  );

  // BR-REC-130: one sentence, and at most one action ("No members yet." [Add member]).
  let empty: React.ReactNode;
  if (searching) {
    empty = (
      <EmptyState
        title={
          status === 'archived'
            ? `No archived member matches "${text}".`
            : `No member matches "${text}".`
        }
        action={
          <Button
            variant="secondary"
            size="lg"
            nativeButton={false}
            render={<Link href="/admin/members/new" />}
          >
            {UI_TEXT.screens.addMember}
          </Button>
        }
      />
    );
  } else if (status === 'all') {
    empty = (
      <EmptyState
        title="No members yet."
        action={
          <Button
            variant="secondary"
            size="lg"
            nativeButton={false}
            render={<Link href="/admin/members/new" />}
          >
            {UI_TEXT.screens.addMember}
          </Button>
        }
      />
    );
  } else {
    empty = <EmptyState title={NOTHING_IN_FILTER[status]} />;
  }

  return (
    <>
      <MemberSearch
        text={q}
        field={by}
        onChange={(value) => void setParams({ q: value })}
        onFieldChange={(value) => void setParams({ by: value })}
      />
      <ChoiceChips
        legend="Show"
        hideLegend
        options={FILTER_OPTIONS}
        value={status}
        onChange={(value) => void setParams({ status: value })}
      />
      <MemberDirectoryResults
        rows={rows}
        isError={isError}
        onRetry={() => void refetch()}
        table
        empty={empty}
      />
    </>
  );
}
