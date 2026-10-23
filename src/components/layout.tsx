import type { ReactNode } from 'react';
import { Card } from 'material/react';
import type { LucideIcon } from './iconMarkup';

export interface PageHeaderProps {
  title: string;
  description: string;
  actions?: ReactNode;
}

/**
 * Every page has the same header rhythm. The visible page name lives in the
 * app bar; the hidden h1 gives the document a proper heading and a stable
 * accessible name.
 */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="page-head">
      <div className="page-head-copy">
        <h1 className="visually-hidden">{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export interface SectionCardProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  variant?: 'elevated' | 'filled' | 'outlined';
  flush?: boolean;
}

export function SectionCard({
  title,
  subtitle,
  action,
  children,
  className,
  variant = 'outlined',
  flush = false,
}: SectionCardProps) {
  return (
    <Card
      variant={variant}
      className={['section-card', flush ? 'section-card--flush' : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      <div className="section-head">
        <div className="section-copy">
          <h2>{title}</h2>
          {subtitle ? <p className="section-subtitle">{subtitle}</p> : null}
        </div>
        {action ? <div className="section-action">{action}</div> : null}
      </div>
      {children}
    </Card>
  );
}

export interface MetricCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: LucideIcon;
  tone?: 'default' | 'expense' | 'income' | 'warning';
  footer?: ReactNode;
}

export function MetricCard({ label, value, hint, icon: Icon, tone = 'default', footer }: MetricCardProps) {
  return (
    <Card variant="filled" className={`metric-card metric-card--${tone}`}>
      <div className="metric-top">
        <span className="metric-label">{label}</span>
        <span className="metric-icon" aria-hidden="true">
          <Icon size={20} strokeWidth={1.9} />
        </span>
      </div>
      <div className="metric-value">{value}</div>
      {hint ? <p className="metric-hint">{hint}</p> : null}
      {footer ? <div className="metric-footer">{footer}</div> : null}
    </Card>
  );
}
