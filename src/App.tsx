import { useExpenseLens } from './services/useExpenseLens';

export default function App() {
  const { info, loading, notice } = useExpenseLens();

  return (
    <main className="app-shell">
      <h1>Expense Lens</h1>
      <p aria-live="polite">
        {loading ? '正在连接本地数据…' : info ? `本地数据已连接 · ${info.transactionCount} 笔交易` : notice?.message ?? '本地数据暂不可用'}
      </p>
    </main>
  );
}
