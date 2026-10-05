'use client';

import { useMemo } from 'react';
import ActionsHeader from '@/components/common/ActionsHeader';
import DataTable, { createDataTableColumnHelper } from '@/components/common/DataTable';
import PersonCell from '@/components/common/PersonCell';
import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import type { IsoDate } from '@/lib/domain/dates';
import { formatDay, formatPhone } from '@/lib/format';
import { membershipStatusText } from '@/lib/members/membershipText';
import type { EndingItem, EndingStatus } from '@/lib/members/types';

interface EndingTableProps {
  items: EndingItem[];
  status: EndingStatus;
  today: IsoDate;
  onRenew: (memberId: string) => void;
}

const helper = createDataTableColumnHelper<EndingItem>();

// Memberships ending from 1024 px (BR-REC-183, 226): name with avatar (the row's link), phone, status, end date, Renew.
export default function EndingTable({ items, status, today, onRenew }: EndingTableProps) {
  const columns = useMemo(
    () =>
      helper.columns([
        helper.display({
          id: 'name',
          header: 'Name',
          cell: ({ row }) => (
            <PersonCell
              name={row.original.fullName}
              href={`/admin/members/${row.original.memberId}`}
            />
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
            const text = membershipStatusText({ status, ...row.original }, today);
            return <StatusBadge tone={text.tone}>{text.detail}</StatusBadge>;
          },
        }),
        helper.display({
          id: 'endOn',
          header: 'Ends on',
          cell: ({ row }) => formatDay(row.original.endOn),
        }),
        helper.display({
          id: 'renew',
          header: () => <ActionsHeader />,
          cell: ({ row }) => (
            <Button
              type="button"
              variant="secondary"
              className="relative z-10"
              aria-label={`Renew ${row.original.fullName}`}
              onClick={() => onRenew(row.original.memberId)}
            >
              Renew
            </Button>
          ),
        }),
      ]),
    [status, today, onRenew],
  );
  return <DataTable columns={columns} data={items} />;
}
