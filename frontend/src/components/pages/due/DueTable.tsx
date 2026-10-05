'use client';

import { createContext, useContext, useMemo } from 'react';
import DataTable, { createDataTableColumnHelper } from '@/components/common/DataTable';
import PersonCell from '@/components/common/PersonCell';
import StatusBadge from '@/components/common/StatusBadge';
import DueMoreButton from '@/components/pages/due/DueMoreButton';
import { useMemberDirectory } from '@/lib/api/members/queries';
import { recordHref } from '@/lib/due/links';
import { dueRowStatus } from '@/lib/due/status';
import { type DueTarget, isSheetOpenFor, listTarget } from '@/lib/due/target';
import { dueItemsText } from '@/lib/due/text';
import type { DueListItem } from '@/lib/due/types';
import { formatPhone } from '@/lib/format';

interface DueTableProps {
  items: DueListItem[];
  /** Measurements turned on per assessment id, for "All 15 measurements". */
  turnedOn: Map<string, number>;
  onMore: (target: DueTarget) => void;
  /** The row whose sheet is open now, if any. */
  openTarget: DueTarget | null;
}

const helper = createDataTableColumnHelper<DueListItem>();

// The open sheet and the open handler reach the "⋯" cells through context, not through the columns: columns
// that change with the open row make TanStack rebuild every cell, the focused "⋯" remounts and keyboard
// focus is lost on open and close (BR-REC-234, 137).
interface SheetState {
  openTarget: DueTarget | null;
  onMore: (target: DueTarget) => void;
}
const SheetStateContext = createContext<SheetState>({ openTarget: null, onMore: () => {} });

function MoreCell({ item }: { item: DueListItem }) {
  const { openTarget, onMore } = useContext(SheetStateContext);
  return (
    <div className="relative z-10 flex justify-end">
      <DueMoreButton
        name={item.fullName}
        onOpen={() => onMore(listTarget(item))}
        expanded={isSheetOpenFor(openTarget, item.memberId, item.typeId)}
      />
    </div>
  );
}

// The due list from 1024 px (BR-REC-183, 226, lg): name with avatar (the row's link to Record assessment),
// phone (from the cached member directory, blank until it loads), assessment, what is due, due status, and
// the "⋯" row action.
export default function DueTable({ items, turnedOn, onMore, openTarget }: DueTableProps) {
  const directory = useMemberDirectory();
  const phones = useMemo(
    () => new Map((directory.data ?? []).map((member) => [member.id, member.phone])),
    [directory.data],
  );
  const columns = useMemo(
    () =>
      helper.columns([
        helper.display({
          id: 'name',
          header: 'Name',
          cell: ({ row }) => (
            <PersonCell
              name={row.original.fullName}
              href={recordHref(row.original.memberId, row.original.typeId)}
            />
          ),
        }),
        helper.display({
          id: 'phone',
          header: 'Phone',
          cell: ({ row }) => {
            const phone = phones.get(row.original.memberId);
            return phone ? formatPhone(phone) : '';
          },
        }),
        helper.display({
          id: 'type',
          header: 'Assessment',
          cell: ({ row }) => row.original.typeName,
        }),
        helper.display({
          id: 'items',
          header: 'What is due',
          cell: ({ row }) =>
            dueItemsText(
              row.original.items.map((item) => item.name),
              turnedOn.get(row.original.typeId) ?? Number.POSITIVE_INFINITY,
            ),
        }),
        helper.display({
          id: 'status',
          header: 'Due',
          cell: ({ row }) => {
            const status = dueRowStatus(row.original);
            return <StatusBadge tone={status.tone}>{status.text}</StatusBadge>;
          },
        }),
        helper.display({
          id: 'more',
          header: () => <span className="sr-only">Actions</span>, // no empty table header (BR-REC-226)
          cell: ({ row }) => <MoreCell item={row.original} />,
        }),
      ]),
    [phones, turnedOn],
  );
  const sheetState = useMemo(() => ({ openTarget, onMore }), [openTarget, onMore]);
  return (
    <SheetStateContext.Provider value={sheetState}>
      <DataTable columns={columns} data={items} />
    </SheetStateContext.Provider>
  );
}
