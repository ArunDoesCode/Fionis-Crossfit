'use client';

import { useMemo } from 'react';
import ActionsHeader from '@/components/common/ActionsHeader';
import DataTable, { createDataTableColumnHelper } from '@/components/common/DataTable';
import PersonCell from '@/components/common/PersonCell';
import StatusBadge from '@/components/common/StatusBadge';
import DueMoreButton from '@/components/pages/due/DueMoreButton';
import { useMemberDirectory } from '@/lib/api/members/queries';
import { recordHref } from '@/lib/due/links';
import { dueRowStatus } from '@/lib/due/status';
import { type DueTarget, listTarget } from '@/lib/due/target';
import { dueItemsText } from '@/lib/due/text';
import type { DueListItem } from '@/lib/due/types';
import { formatPhone } from '@/lib/format';

interface DueTableProps {
  items: DueListItem[];
  /** Measurements turned on per assessment id, for "All 15 measurements". */
  turnedOn: Map<string, number>;
  onMore: (target: DueTarget) => void;
}

const helper = createDataTableColumnHelper<DueListItem>();

// The due list from 1024 px (BR-REC-183, 226, lg): name with avatar (the row's link to Record assessment),
// phone (from the cached member directory, blank until it loads), assessment, what is due, due status, and
// the "⋯" row action.
export default function DueTable({ items, turnedOn, onMore }: DueTableProps) {
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
          header: () => <ActionsHeader />,
          cell: ({ row }) => (
            <div className="relative z-10 flex justify-end">
              <DueMoreButton
                name={row.original.fullName}
                onOpen={() => onMore(listTarget(row.original))}
              />
            </div>
          ),
        }),
      ]),
    [onMore, phones, turnedOn],
  );
  return <DataTable columns={columns} data={items} />;
}
