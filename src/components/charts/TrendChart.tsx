import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCompactMoney, formatMoney } from '../../lib/format';
import { CHART_SERIES, CHART_TICK, CHART_TOOLTIP_STYLE } from '../../theme/chartTheme';
import { ChartEmpty } from './ChartEmpty';

export interface TrendPoint {
  key: string;
  label: string;
  expenseCents: number;
  incomeCents: number;
}

export interface TrendChartProps {
  points: TrendPoint[];
  granularity: 'day' | 'month';
}

export function TrendChart({ points, granularity }: TrendChartProps) {
  const hasData = points.some((point) => point.expenseCents > 0 || point.incomeCents > 0);

  if (!hasData) {
    return <ChartEmpty message="本期还没有可展示的收支数据" />;
  }

  return (
    <div className="chart-block">
      <div className="chart-legend" aria-hidden="true">
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: CHART_SERIES.expense }} />
          支出
        </span>
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: CHART_SERIES.income }} />
          收入
        </span>
      </div>
      <div className="chart-canvas" role="img" aria-label="收支趋势图">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={CHART_SERIES.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tick={CHART_TICK}
              tickLine={false}
              axisLine={{ stroke: CHART_SERIES.grid }}
              minTickGap={28}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={CHART_TICK}
              tickLine={false}
              axisLine={false}
              width={66}
              tickFormatter={(value: number) => formatCompactMoney(value)}
            />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              labelStyle={{ color: CHART_SERIES.muted, marginBottom: 4 }}
              itemStyle={{ color: CHART_SERIES.text }}
              formatter={(value, name) => [formatMoney(Number(value)), String(name)]}
              labelFormatter={(_label, payload) => {
                const point = payload?.[0]?.payload as TrendPoint | undefined;
                return point ? (granularity === 'day' ? point.key : point.key) : '';
              }}
            />
            <Line
              type="monotone"
              dataKey="expenseCents"
              name="支出"
              stroke={CHART_SERIES.expense}
              strokeWidth={2.4}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="incomeCents"
              name="收入"
              stroke={CHART_SERIES.income}
              strokeWidth={2.4}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table className="visually-hidden">
        <caption>收支趋势数据</caption>
        <thead>
          <tr>
            <th scope="col">{granularity === 'day' ? '日期' : '月份'}</th>
            <th scope="col">支出</th>
            <th scope="col">收入</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.key}>
              <th scope="row">{point.key}</th>
              <td>{formatMoney(point.expenseCents)}</td>
              <td>{formatMoney(point.incomeCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
