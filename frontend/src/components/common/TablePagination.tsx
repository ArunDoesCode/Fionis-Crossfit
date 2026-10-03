'use client';

import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const PAGE_SIZES = [10, 20, 50, 100] as const;

interface TablePaginationProps {
  offset: number;
  limit: number;
  total: number;
  onPageChange: (offset: number) => void;
  onLimitChange?: (limit: number) => void;
}

// Offset/limit pagination for server-paginated tables (state lives in nuqs).
export default function TablePagination({
  offset,
  limit,
  total,
  onPageChange,
  onLimitChange,
}: TablePaginationProps) {
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);

  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <p className="text-sm text-muted-foreground">
        {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-2">
        {onLimitChange && (
          <Select value={String(limit)} onValueChange={(value) => onLimitChange(Number(value))}>
            <SelectTrigger aria-label="Rows per page" className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button
          variant="outline"
          size="icon"
          type="button"
          aria-label="Previous page"
          disabled={offset <= 0}
          onClick={() => onPageChange(Math.max(0, offset - limit))}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
        </Button>
        <Button
          variant="outline"
          size="icon"
          type="button"
          aria-label="Next page"
          disabled={offset + limit >= total}
          onClick={() => onPageChange(offset + limit)}
        >
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
        </Button>
      </div>
    </div>
  );
}
