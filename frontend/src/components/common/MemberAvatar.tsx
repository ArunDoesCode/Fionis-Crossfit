import { initialsOf } from '@/lib/members/initials';
import { cn } from '@/lib/utils';

interface MemberAvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

// BR-REC-223: initials of the shown name in a circle, never a photo. sm 32 px and md 36 px are neutral;
// lg (64 px, the member page) is a navy circle with orange initials. Decorative: the name sits next to it.
const SIZES = {
  sm: 'size-8 bg-secondary text-secondary-foreground text-xs',
  md: 'size-9 bg-secondary text-secondary-foreground text-[13px]',
  lg: 'size-16 bg-sidebar text-sidebar-primary text-xl',
} as const;

export default function MemberAvatar({ name, size = 'md', className }: MemberAvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-heading font-semibold',
        SIZES[size],
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
