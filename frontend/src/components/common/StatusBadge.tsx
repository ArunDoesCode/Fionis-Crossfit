import {
  Alert02Icon,
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  InformationCircleIcon,
  MinusSignCircleIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { Badge } from '@/components/ui/badge';
import type { StatusTone } from '@/lib/statusTone';
import { cn } from '@/lib/utils';

// BR-REC-125: status is never colour alone. Each tone has its own icon shape as well as the words,
// so a grey-scale screenshot still reads: tick = fine, triangle = soon, circle with ! = late, i = info, dash = other.
const TONES: Record<StatusTone, { icon: IconSvgElement; className: string }> = {
  success: { icon: CheckmarkCircle02Icon, className: 'bg-success-soft text-success' },
  warning: { icon: Alert02Icon, className: 'bg-warning-soft text-warning' },
  danger: { icon: AlertCircleIcon, className: 'bg-danger-soft text-danger' },
  info: { icon: InformationCircleIcon, className: 'bg-info-soft text-info' },
  neutral: { icon: MinusSignCircleIcon, className: 'bg-neutral-soft text-neutral' },
};

interface StatusBadgeProps {
  tone: StatusTone;
  /** The words ("Active", "Ends in 5 days", "Overdue 12 days"...). Required: colour never stands alone. */
  children: React.ReactNode;
  className?: string;
}

export default function StatusBadge({ tone, children, className }: StatusBadgeProps) {
  const { icon, className: toneClass } = TONES[tone];
  return (
    <Badge
      variant="secondary"
      className={cn('h-7 gap-1.5 px-2.5 text-sm [&>svg]:size-4!', toneClass, className)}
    >
      <HugeiconsIcon icon={icon} strokeWidth={2} aria-hidden="true" />
      {children}
    </Badge>
  );
}
