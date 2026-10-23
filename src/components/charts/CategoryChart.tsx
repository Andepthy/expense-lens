import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { formatMoney, formatPercent } from '../../lib/format';
import { CHART_SERIES, CHART_TOOLTIP_STYLE, categoryColor } from '../../theme/chartTheme';
import { ChartEmpty } from './ChartEmpty';

export interface CategorySlice {
  category: string;
  amountCents: number;
}

export interface CategoryChartProps {
  data: CategorySlice[];
  totalExpenseCents: number;
}

export function CategoryChart({ data, totalExpenseCents }: CategoryChartProps) {
  const visible = data.filter((slice) => slice.amountCents > 0);

  if (visible.length === 0) {
    return <ChartEmpty message="本期还没有分类支出数据" />;
  }

  return (
    <div className="category-chart">
      <div className="donut-wrap">
        <div className="donut-canvas" role="img" aria-label="分类支出占比图">
          <ResponsiveContainer width="100%" height={236}>
            <PieChart>
              <Pie
                data={visible}
                dataKey="amountCents"
                nameKey="category"
                innerRadius={64}
                outerRadius={96}
                paddingAngle={2}
                stroke="none"
                isAnimationActive={false}
              >
                {visible.map((slice, index) => (
                  <Cell key={slice.category} fill={categoryColor(index)} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                itemStyle={{ color: CHART_SERIES.text }}
                formatter={(value, name) => [formatMoney(Number(value)), String(name)]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="donut-center" aria-hidden="true">
            <span>总支出</span>
            <strong>{formatMoney(totalExpenseCents)}</strong>
          </div>
        </div>
      </div>
      <ul className="category-legend">
        {visible.map((slice, index) => (
          <li key={slice.category}>
            <span className="legend-swatch" style={{ background: categoryColor(index) }} aria-hidden="true" />
            <span className="category-name">{slice.category}</span>
            <span className="category-amount">{formatMoney(slice.amountCents)}</span>
            <span className="category-share">{formatPercent(slice.amountCents, totalExpenseCents)}</span>
          </li>
        ))}
      </ul>
      <table className="visually-hidden">
        <caption>分类支出数据</caption>
        <thead>
          <tr>
            <th scope="col">分类</th>
            <th scope="col">金额</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((slice) => (
            <tr key={slice.category}>
              <th scope="row">{slice.category}</th>
              <td>{formatMoney(slice.amountCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
