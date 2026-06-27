import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  variant?: 'positive' | 'negative' | 'info' | 'neutral';
}

const variantConfig = {
  positive: {
    bg:       'bg-green-50',
    border:   'border-green-100',
    iconBg:   'bg-green-100',
    iconText: 'text-green-600',
    value:    'text-green-700',
    title:    'text-green-800',
  },
  negative: {
    bg:       'bg-red-50',
    border:   'border-red-100',
    iconBg:   'bg-red-100',
    iconText: 'text-red-600',
    value:    'text-red-700',
    title:    'text-red-800',
  },
  info: {
    bg:       'bg-blue-50',
    border:   'border-blue-100',
    iconBg:   'bg-blue-100',
    iconText: 'text-blue-600',
    value:    'text-blue-700',
    title:    'text-blue-800',
  },
  neutral: {
    bg:       'bg-white',
    border:   'border-gray-100',
    iconBg:   'bg-gray-100',
    iconText: 'text-gray-600',
    value:    'text-gray-900',
    title:    'text-gray-600',
  },
};

export default function StatCard({
  title,
  value,
  subtitle,
  icon,
  variant = 'neutral',
}: StatCardProps) {
  const cfg = variantConfig[variant];

  return (
    <div
      className={cn(
        'rounded-xl border p-5 flex items-start gap-4 shadow-sm transition-transform hover:scale-[1.01]',
        cfg.bg,
        cfg.border
      )}
    >
      {icon && (
        <div
          className={cn(
            'w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0',
            cfg.iconBg
          )}
        >
          <span className={cn('w-6 h-6', cfg.iconText)}>{icon}</span>
        </div>
      )}
      <div className="min-w-0">
        <p className={cn('text-sm font-medium truncate', cfg.title)}>{title}</p>
        <p className={cn('text-2xl font-bold mt-1 leading-none', cfg.value)}>
          {value}
        </p>
        {subtitle && (
          <p className="text-xs text-gray-500 mt-1.5">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
