'use client';

import { useMemo } from 'react';
import DataTable, { createDataTableColumnHelper } from '@/components/common/DataTable';
import PersonCell from '@/components/common/PersonCell';
import StatusBadge from '@/components/common/StatusBadge';
import type { IsoDate } from '@/lib/domain/dates';
import { formatDay, formatPhone } from '@/lib/format';
import { memberListBadge } from '@/lib/members/membershipText';
import type { MemberListItem } from '@/lib/members/types';

interface MemberTableProps {
  items: MemberListItem[];
  today: IsoDate;
}

const helper = createDataTableColumnHelper<MemberListItem>();

// Members from 1024 px (BR-REC-183, 226): name with avatar (the row's link), phone, status, last assessment.
export default function MemberTable({ items, today }: MemberTableProps) {
  const columns = useMemo(
    () =>
      helper.columns([
        helper.display({
          id: 'name',
          header: 'Name',
          cell: ({ row }) => (
            <PersonCell name={row.original.fullName} href={`/admin/members/${row.original.id}`} />
          ),
        }),
        helper.display({
          id: 'phone',
          header: 'Phone',
          cell: ({ row }) => formatPhone(row.original.phone),
        }),
        helper.display({
          id: 'status',
          header: 'Status',
          cell: ({ row }) => {
            const badge = memberListBadge(row.original, today);
            return <StatusBadge tone={badge.tone}>{badge.text}</StatusBadge>;
          },
        }),
        helper.display({
          id: 'assessed',
          header: 'Last assessment',
          cell: ({ row }) =>
            row.original.lastAssessedOn ? formatDay(row.original.lastAssessedOn) : 'Never assessed',
        }),
      ]),
    [today],
  );
  return <DataTable columns={columns} data={items} />;
}
