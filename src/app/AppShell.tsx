import { useEffect, useRef, useState } from 'react';
import {
  NavigationRail,
  NavigationRailItem,
  Progress,
  TopAppBar,
} from 'material/react';
import { Moon, RefreshCw, Sun } from 'lucide-react';
import { useLens } from './ExpenseLensProvider';
import { PAGES, isPageId, pageById, type PageId } from './navigation';
import { useThemeMode } from '../theme/themeMode';
import { iconMarkup } from '../components/iconMarkup';
import { IconButtonAction } from '../components/inputs';
import { NoticeSnackbar } from '../components/states';
import { DashboardPage } from '../pages/DashboardPage';
import { TransactionsPage } from '../pages/TransactionsPage';
import { ImportsPage } from '../pages/ImportsPage';
import { RulesPage } from '../pages/RulesPage';
import { DataPage } from '../pages/DataPage';
import type { TransactionKind } from '../types';
import { formatCount } from '../lib/format';

export function AppShell() {
  const { info, dashboard, drafts, notice, refreshing, refresh, loading, error } = useLens();
  const theme = useThemeMode();
  const [page, setPage] = useState<PageId>('dashboard');
  const [transactionKind, setTransactionKind] = useState<TransactionKind | 'all'>('all');
  const [railExpanded, setRailExpanded] = useState(() => window.innerWidth >= 900);
  const mainRef = useRef<HTMLElement>(null);
  const meta = pageById(page);

  useEffect(() => {
    document.title = `${meta.title} · Expense Lens`;
  }, [meta.title]);

  useEffect(() => {
    mainRef.current?.scrollTo?.({ top: 0, behavior: 'auto' });
  }, [page]);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth < 900) setRailExpanded(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const openTransactions = (kind: TransactionKind | 'all') => {
    setTransactionKind(kind);
    setPage('transactions');
  };

  const status = error && !info ? '本地数据未连接' : info ? `${formatCount(info.transactionCount)} 笔交易` : loading ? '正在连接本地数据' : '本地数据';
  const statusState = error && !info ? 'error' : loading && !info ? 'busy' : 'ready';

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>

      <NavigationRail
        ariaLabel="主导航"
        value={page}
        expanded={railExpanded}
        expandedWidth={224}
        expandLabel="展开导航"
        collapseLabel="收起导航"
        onChange={(event) => {
          if (isPageId(event.detail.value)) setPage(event.detail.value);
        }}
        onExpand={() => setRailExpanded(true)}
        onCollapse={() => setRailExpanded(false)}
      >
        {PAGES.map((item) => {
          const badge =
            item.id === 'transactions'
              ? dashboard && dashboard.pendingCount > 0
                ? String(dashboard.pendingCount)
                : undefined
              : item.id === 'imports' && drafts.length > 0
                ? String(drafts.length)
                : undefined;
          return (
            <NavigationRailItem
              key={item.id}
              value={item.id}
              label={item.label}
              icon={iconMarkup(item.icon, 24)}
              selectedIcon={iconMarkup(item.icon, 24)}
              badge={badge}
              badgeLabel={
                item.id === 'transactions'
                  ? `${badge ?? 0} 笔待处理交易`
                  : item.id === 'imports'
                    ? `${badge ?? 0} 个待确认账单`
                    : undefined
              }
            />
          );
        })}
      </NavigationRail>

      <div className="app-frame">
        <TopAppBar
          className="app-bar"
          type="small"
          headline={meta.title}
          noScroll
          trailing={
            <div className="app-bar-actions">
              <span className="app-status" data-state={statusState} title={info?.path}>
                {status}
              </span>
              <IconButtonAction
                label="刷新数据"
                icon={RefreshCw}
                onClick={() => void refresh()}
                disabled={refreshing}
              />
              <IconButtonAction
                label={theme.mode === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
                icon={theme.mode === 'dark' ? Sun : Moon}
                onClick={theme.toggle}
              />
            </div>
          }
        />

        {refreshing ? (
          <Progress className="app-progress" indeterminate ariaLabel="正在刷新数据" />
        ) : null}

        <main id="main-content" ref={mainRef} className="app-main" tabIndex={-1}>
          {page === 'dashboard' ? (
            <DashboardPage onOpenTransactions={openTransactions} onOpenImports={() => setPage('imports')} />
          ) : page === 'transactions' ? (
            <TransactionsPage
              initialKind={transactionKind}
              onOpenImports={() => setPage('imports')}
            />
          ) : page === 'imports' ? (
            <ImportsPage />
          ) : page === 'rules' ? (
            <RulesPage />
          ) : (
            <DataPage onOpenImports={() => setPage('imports')} />
          )}
        </main>
      </div>

      <NoticeSnackbar notice={notice} />
    </div>
  );
}
