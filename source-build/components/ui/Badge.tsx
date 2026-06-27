import { cn } from '@/lib/utils';

interface BadgeProps {
  label: string;
  className?: string;
}

export function Badge({ label, className }: BadgeProps) {
  return (
    <span className={cn('badge', className)}>{label}</span>
  );
}
