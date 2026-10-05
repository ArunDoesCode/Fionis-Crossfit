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
import { withCount } from '@/lib/format';
import { foldText, MIN_SEARCH_CHARS, searchMembers } from '@/lib/members/directory';
import { MEMBER_FILTERS, type MemberFilter, memberListParams } from '@/lib/members/listParams';
import type { MembershipStatus } from '@/lib/members/types';
import { useFieldPick } from '@/lib/members/useFieldPick';
import { UI_TEXT, WORDS } from '@/lib/messages/words';

const FILTER_LABELS: Record<MemberFilter, string> = {
  all: 'All',
  active: 'Active',
  expiring: WORDS.endsSoon,
  expired: WORDS.ended,
  archived: 'Archived',
};

// What each chip counts: the same scope the list shows for it, with no text.
const FILTER_SCOPE: Record<MemberFilter, { archived: boolean; membership?: MembershipStatus }> = {
  all: { archived: false },
  active: { archived: false, membership: 'active' },
  expiring: { archived: false, membership: 'expiring' },
  expired: { archived: false, membership: 'expired' },
  archived: { archived: true },
};

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
  // BR-REC-231: the field follows the text unless picked by hand; a non-Name pick kept in the URL seeds it.
  const { field, pick } = useFieldPick(q, by === 'name' ? null : by);
  const rows = useMemo(
    () =>
      data &&
      searchMembers(data, {
        text: q,
        field,
        archived: status === 'archived',
        membership:
          status === 'active' || status === 'expiring' || status === 'expired' ? status : undefined,
      }),
    [data, q, field, status],
  );
  // Counts on the filter chips (BR-REC-226): the whole directory, whatever is typed.
  const filterOptions = useMemo(
    () =>
      MEMBER_FILTERS.map((value) => ({
        value,
        label: withCount(
          FILTER_LABELS[value],
          data && searchMembers(data, { text: '', field: 'name', ...FILTER_SCOPE[value] }).length,
        ),
      })),
    [data],
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
        field={field}
        onChange={(value) => void setParams({ q: value })}
        onFieldChange={(value) => {
          pick(value);
          void setParams({ by: value });
        }}
      />
      <ChoiceChips
        legend="Show"
        hideLegend
        options={filterOptions}
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
