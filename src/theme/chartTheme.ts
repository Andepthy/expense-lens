/** Chart colours are centralised here and resolved from the active M3 theme. */
export const CHART_SERIES = {
  expense: 'var(--el-chart-expense)',
  income: 'var(--el-chart-income)',
  refund: 'var(--el-chart-refund)',
  grid: 'var(--mtrl-sys-color-outline-variant)',
  axis: 'var(--mtrl-sys-color-on-surface-variant)',
  surface: 'var(--mtrl-sys-color-surface-container-high)',
  text: 'var(--mtrl-sys-color-on-surface)',
  muted: 'var(--mtrl-sys-color-on-surface-variant)',
} as const;

export const CHART_CATEGORY_COLORS = [
  'var(--el-chart-1)',
  'var(--el-chart-2)',
  'var(--el-chart-3)',
  'var(--el-chart-4)',
  'var(--el-chart-5)',
  'var(--el-chart-6)',
  'var(--el-chart-7)',
  'var(--el-chart-8)',
  'var(--el-chart-9)',
  'var(--el-chart-10)',
] as const;

export function categoryColor(index: number): string {
  return CHART_CATEGORY_COLORS[index % CHART_CATEGORY_COLORS.length] ?? CHART_SERIES.expense;
}

export const CHART_TOOLTIP_STYLE = {
  backgroundColor: CHART_SERIES.surface,
  border: `1px solid ${CHART_SERIES.grid}`,
  borderRadius: 12,
  color: CHART_SERIES.text,
  fontFamily: 'var(--mtrl-ref-typeface-plain)',
  fontSize: 12,
  padding: '8px 12px',
} as const;

export const CHART_TICK = {
  fill: CHART_SERIES.axis,
  fontFamily: 'var(--mtrl-ref-typeface-plain)',
  fontSize: 12,
} as const;
