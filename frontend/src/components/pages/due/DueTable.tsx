'use client';

import { useMemo } from 'react';
import DataTable, { createDataTableColumnHelper } from '@/components/common/DataTable';
import StatusBadge from '@/components/common/StatusBadge';
import TableRowLink from '@/components/common/TableRowLink';
import DueMoreButton from '@/components/pages/due/DueMoreButton';
import { recordHref } from '@/lib/due/links';
import { dueRowStatus } from '@/lib/due/status';
import { type DueTarget, listTarget } from '@/lib/due/target';
import type { DueListItem } from '@/lib/due/types';

interface DueTableProps {
  items: DueListItem[];
  onMore: (target: DueTarget) => void;
}

const helper = createDataTableColumnHelper<DueListItem>();

// The due list from 1024 px (BR-REC-183, lg): name (the row's link to Record assessment), assessment, due
// status, and the "⋯" row action.
export default function DueTable({ items, onMore }: DueTableProps) {
  const columns = useMemo(
    () =>
      helper.columns([
        helper.display({
          id: 'name',
          header: 'Name',
          cell: ({ row }) => (
            <TableRowLink href={recordHref(row.original.memberId, row.original.typeId)}>
              {row.original.fullName}
            </TableRowLink>
          ),
        }),
        helper.display({
          id: 'type',
          header: 'Assessment',
          cell: ({ row }) => row.original.typeName,
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
          header: '',
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
    [onMore],
  );
  return <DataTable columns={columns} data={items} />;
}
