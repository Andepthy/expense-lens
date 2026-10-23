import { formatMoney, formatPercent } from '../lib/format';
import { ChartEmpty } from './charts/ChartEmpty';

export interface MerchantRankingProps {
  data: Array<{ merchant: string; amountCents: number }>;
  totalExpenseCents: number;
}

export function MerchantRanking({ data, totalExpenseCents }: MerchantRankingProps) {
  const visible = data.filter((item) => item.amountCents > 0);
  const max = visible[0]?.amountCents ?? 0;

  if (visible.length === 0) {
    return <ChartEmpty message="本期还没有商户支出排行" />;
  }

  return (
    <ol className="merchant-list">
      {visible.map((item, index) => (
        <li key={`${item.merchant}-${index}`}>
          <span className="merchant-rank">{index + 1}</span>
          <div className="merchant-main">
            <div className="merchant-row">
              <span className="merchant-name" title={item.merchant}>
                {item.merchant || '未标记对象'}
              </span>
              <span className="merchant-amount">{formatMoney(item.amountCents)}</span>
            </div>
            <div className="merchant-track" aria-hidden="true">
              <span
                className="merchant-fill"
                style={{ width: `${max > 0 ? Math.max(4, (item.amountCents / max) * 100) : 0}%` }}
              />
            </div>
            <span className="merchant-share">{formatPercent(item.amountCents, totalExpenseCents)} 的总支出</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
