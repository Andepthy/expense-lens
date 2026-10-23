import { useEffect, useRef, type ReactNode } from 'react';
import { Button, LoadingIndicator, Snackbar } from 'material/react';
import type { SnackbarElement } from 'material/elements';
import { AlertTriangle, CheckCircle2, Info, ShieldAlert, type LucideIcon } from 'lucide-react';
import type { LensNotice } from '../services/useExpenseLens';

export function PageLoading({ label = '正在加载本地数据…' }: { label?: string }) {
  return (
    <div className="page-state" role="status" aria-live="polite">
      <LoadingIndicator size={56} ariaLabel={label} />
      <p>{label}</p>
    </div>
  );
}

export function PageError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="inline-alert" data-tone="error" role="alert">
      <AlertTriangle size={22} aria-hidden="true" />
      <div className="inline-alert-copy">
        <strong>无法读取本地数据</strong>
        <p>{message}</p>
      </div>
      {onRetry ? (
        <Button variant="text" onClick={onRetry}>
          重试
        </Button>
      ) : null}
    </div>
  );
}

export interface InlineAlertProps {
  tone?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
}

const ALERT_ICONS: Record<NonNullable<InlineAlertProps['tone']>, LucideIcon> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertTriangle,
};

export function InlineAlert({ tone = 'info', title, children, action, icon }: InlineAlertProps) {
  const Icon = icon ?? ALERT_ICONS[tone];
  return (
    <div className="inline-alert" data-tone={tone}>
      <Icon size={21} aria-hidden="true" />
      <div className="inline-alert-copy">
        {title ? <strong>{title}</strong> : null}
        <div className="inline-alert-body">{children}</div>
      </div>
      {action ? <div className="inline-alert-action">{action}</div> : null}
    </div>
  );
}

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  compact?: boolean;
}

export function EmptyState({ icon: Icon, title, description, action, compact = false }: EmptyStateProps) {
  return (
    <div className={compact ? 'empty-state empty-state--compact' : 'empty-state'}>
      <span className="empty-icon" aria-hidden="true">
        <Icon size={compact ? 22 : 28} strokeWidth={1.8} />
      </span>
      <div className="empty-copy">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  );
}

export function StatusChip({
  children,
  tone = 'neutral',
  title,
}: {
  children: ReactNode;
  tone?: string;
  title?: string;
}) {
  return (
    <span className="chip" data-tone={tone} title={title}>
      {children}
    </span>
  );
}

export function NoticeSnackbar({ notice }: { notice: LensNotice | null }) {
  const ref = useRef<SnackbarElement>(null);

  useEffect(() => {
    if (!notice) return;
    ref.current?.show();
  }, [notice]);

  return (
    <Snackbar
      ref={ref}
      message={notice?.message ?? ''}
      duration={notice?.tone === 'error' ? 'long' : 'short'}
      dismissible
      closeLabel="关闭提示"
      queueBehavior="replace"
    />
  );
}

/** A short, reusable destructive confirmation glyph for danger cards. */
export function DangerGlyph() {
  return <ShieldAlert size={22} aria-hidden="true" />;
}
