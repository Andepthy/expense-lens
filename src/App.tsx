import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Activity, AlertCircle, ArrowDownLeft, ArrowLeftRight, ArrowUpRight, BarChart3, BookOpen,
  Check, ChevronDown, Database, FileSpreadsheet, FileUp, Home, ListFilter,
  LoaderCircle, Moon, Search, Settings2, Sparkles, Sun,
  Tags, Upload, Wallet, X,
} from 'lucide-react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from './lib/api';
import { detectDuplicate } from './domain/deduplicate';
import { formatMoney } from './domain/money';
import type { CategoryRule, DashboardData, DatabaseInfo, ImportBatch, ParseResult, Transaction } from './types';

type Page = 'overview' | 'transactions' | 'import' | 'rules' | 'settings';
type Draft = { file: File; result: ParseResult; choices: Record<string, 'new' | 'skip'> };
type Toast = { message: string; tone: 'success' | 'error' | 'info' };
const nav = [
  { id: 'overview' as const, label: '总览', icon: Home },
  { id: 'transactions' as const, label: '交易明细', icon: ListFilter },
  { id: 'import' as const, label: '导入账单', icon: FileUp },
  { id: 'rules' as const, label: '分类与规则', icon: Tags },
  { id: 'settings' as const, label: '数据管理', icon: Settings2 },
];
const chartColors = ['#7397ec','#70b5a2','#e4a477','#ba8fd3','#e0bd6c','#91a1b8','#6bacc2','#dc8392'];
const categories = ['餐饮','交通','购物','住房','生活缴费','医疗','娱乐','教育','旅行','其他','退款','内部转账','待确认','收入'];

function localDate(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function period() { const now=new Date(); return {start:localDate(new Date(now.getFullYear(),now.getMonth(),1)),end:localDate(new Date(now.getFullYear(),now.getMonth()+1,0))}; }
function App() {
  const [theme,setTheme]=useState<'light'|'dark'>(()=>{
    try {
      const saved=window.localStorage.getItem('expense-lens-theme');
      if(saved==='light'||saved==='dark')return saved;
    } catch { /* Theme preference is optional; transactions never use browser storage. */ }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches?'dark':'light';
  });
  const [page,setPage]=useState<Page>('overview');
  const [info,setInfo]=useState<DatabaseInfo|null>(null);
  const [dashboard,setDashboard]=useState<DashboardData|null>(null);
  const [dashboardPrevious,setDashboardPrevious]=useState<DashboardData|null>(null);
  const [transactions,setTransactions]=useState<Transaction[]>([]);
  const [batches,setBatches]=useState<ImportBatch[]>([]);
  const [rules,setRules]=useState<CategoryRule[]>([]);
  const [range,setRange]=useState(period());
  const [activePreset,setActivePreset]=useState<'month'|'last'|'quarter'|'year'|'custom'>('month');
  const [dashboardSource,setDashboardSource]=useState('all');
  const [dashboardCategory,setDashboardCategory]=useState('all');
  const [loading,setLoading]=useState(true);
  const [toast,setToast]=useState<Toast|null>(null);
  const [drafts,setDrafts]=useState<Draft[]>([]);
  const [busy,setBusy]=useState(false);
  const [selected,setSelected]=useState<Transaction|null>(null);
  const [search,setSearch]=useState('');
  const [sourceFilter,setSourceFilter]=useState('all');
  const [kindFilter,setKindFilter]=useState('all');
  const [categoryFilter,setCategoryFilter]=useState('all');
  const [sort,setSort]=useState<'date'|'amount'|'merchant'>('date');
  const [restoreMode,setRestoreMode]=useState<'merge'|'replace'>('merge');
  const fileInput=useRef<HTMLInputElement>(null);
  const notify=(message:string,tone:Toast['tone']='success')=>{setToast({message,tone});window.setTimeout(()=>setToast(null),4800);};

  useEffect(()=>{
    document.documentElement.dataset.theme=theme;
    try { window.localStorage.setItem('expense-lens-theme',theme); } catch { /* The current session still keeps the selected theme. */ }
  },[theme]);

  const refresh=useCallback(async()=>{
    const p=range;
    try {
      const startDate=new Date(`${p.start}T00:00:00`),endDate=new Date(`${p.end}T00:00:00`);
      const periodDays=Math.max(1,Math.floor((endDate.getTime()-startDate.getTime())/86400000)+1);
      const prevEnd=new Date(startDate.getTime()-86400000),prevStart=new Date(startDate.getTime()-periodDays*86400000);
      const [db,tx,stats,previous,history,categoryRules]=await Promise.all([api.databaseInfo(),api.transactions(500,0),api.dashboard(p.start,p.end,dashboardSource,dashboardCategory),api.dashboard(localDate(prevStart),localDate(prevEnd),dashboardSource,dashboardCategory),api.batches(),api.categoryRules()]);
      setInfo(db);setTransactions(tx);setDashboard(stats);setDashboardPrevious(previous);setBatches(history);setRules(categoryRules);
    } catch (e) { notify(String(e),'error'); }
    finally {setLoading(false);}
  },[range,dashboardSource,dashboardCategory]);
  useEffect(()=>{void refresh();},[refresh]);

  const filtered=useMemo(()=>transactions.filter((tx)=>{
    const needle=search.trim().toLocaleLowerCase();
    const matchText=!needle||`${tx.merchant} ${tx.description} ${tx.category} ${tx.source}`.toLocaleLowerCase().includes(needle);
    const day=tx.occurredAt.slice(0,10);
    return day>=range.start&&day<=range.end&&matchText&&(sourceFilter==='all'||tx.source===sourceFilter)&&(kindFilter==='all'||tx.kind===kindFilter)&&(categoryFilter==='all'||tx.category===categoryFilter);
  }).sort((a,b)=>sort==='amount'?b.amountCents-a.amountCents:sort==='merchant'?a.merchant.localeCompare(b.merchant,'zh'):b.occurredAt.localeCompare(a.occurredAt)),[transactions,range,search,sourceFilter,kindFilter,categoryFilter,sort]);
  const loadMore=async()=>{if(!info||transactions.length>=info.transactionCount)return;try{const next=await api.transactions(500,transactions.length);setTransactions(current=>[...current,...next]);}catch(e){notify(String(e),'error');}};

  const handleFiles=async(files:FileList|null)=>{
    if(!files?.length||busy)return;
    // FileList is live: the input onChange clears its value immediately after this call.
    const selectedFiles=Array.from(files);
    setPage('import');
    setBusy(true);
    try {
      const {parseBill}=await import('./importers/parse');
      const next:Draft[]=[];
      const failures:string[]=[];
      for(const file of selectedFiles){
        try {const result=await parseBill(file);next.push({file,result,choices:{}});}
        catch(e){failures.push(`${file.name}：${String(e)}`);}
      }
      setDrafts(next);
      if(failures.length)notify(failures.length===1?(failures[0]??'账单解析失败。'):`${failures.length} 个文件解析失败：${failures.slice(0,3).join('；')}`,'error');
      else if(!next.length)notify('没有文件解析成功。请确认选择的是微信 XLSX 或支付宝 CSV 账单。','error');
    } catch(e) {
      setDrafts([]);
      notify(`无法加载账单解析器：${String(e)}`,'error');
    } finally {
      setBusy(false);
    }
  };
  const changeMapping=async(index:number,field:string,column:number)=>{
    const old=drafts[index];if(!old)return;
    const mapping={...old.result.mapping};if(column<0)delete mapping[field];else mapping[field]=column;
    try {const {parseBill}=await import('./importers/parse');const result=await parseBill(old.file,mapping);setDrafts((items)=>items.map((item,i)=>i===index?{...item,result}:item));}
    catch(e){notify(String(e),'error');}
  };
  const duplicateStats=(result:ParseResult)=>result.parsed.reduce((acc,row)=>{
    const match=detectDuplicate(row.transaction,transactions);
    if(match.status==='certain')acc.certain++;else if(match.status==='suspected')acc.suspected.push({id:row.transaction.id,candidate:match.candidate?.merchant??'已有交易',reason:match.reason??'疑似重复'});
    return acc;
  },{certain:0,suspected:[] as {id:string;candidate:string;reason:string}[]});
  const confirmImport=async()=>{
    const ready=drafts.filter(d=>!d.result.mappingNeeded);
    if(!ready.length){notify('请先完成必需字段映射。','error');return;}
    if(ready.some(d=>duplicateStats(d.result).suspected.some(s=>!d.choices[s.id]))){notify('请先逐条处理疑似重复记录。','error');return;}
    setBusy(true);let added=0,duplicates=0;
    try {
      const files=[] as {filename:string;source:string;transactions:Transaction[];duplicateDecisions:{candidateId:string|null;incomingJson:string;certainty:string;reason:string;decision:string}[]}[];
      for(const draft of ready){
        const duplicateDecisions=draft.result.parsed.flatMap(({transaction})=>{
          const match=detectDuplicate(transaction,transactions);
          if(match.status!=='suspected'||!draft.choices[transaction.id])return [];
          return [{candidateId:match.candidate?.id??null,incomingJson:transaction.rawJson,certainty:'suspected',reason:match.reason??'时间、金额与商户相似',decision:draft.choices[transaction.id]==='skip'?'skipped':'kept_separate'}];
        });
        const txs=draft.result.parsed.filter(({transaction})=>{
          const match=detectDuplicate(transaction,transactions);
          if(match.status==='certain')return true;
          if(match.status==='suspected')return draft.choices[transaction.id]==='new';
          return true;
        }).map(x=>x.transaction);
        files.push({filename:draft.result.filename,source:draft.result.source,transactions:txs,duplicateDecisions});
        duplicates+=draft.result.parsed.filter(({transaction})=>draft.choices[transaction.id]==='skip').length;
      }
      const results=await api.importFiles(files);
      added=results.reduce((sum,r)=>sum+r.added,0);
      duplicates+=results.reduce((sum,r)=>sum+r.duplicates,0);
      setDrafts([]);await refresh();notify(`导入完成：新增 ${added} 笔，跳过重复 ${duplicates} 笔。`);
    } catch(e){notify(`导入未完成，数据库事务已回滚：${String(e)}`,'error');await refresh();}
    finally{setBusy(false);}
  };
  const updateRecord=async(id:string,update:Partial<Pick<Transaction,'category'|'kind'|'included'>>)=>{
    const current=transactions.find(tx=>tx.id===id);if(!current)return;
    const merged={category:update.category??current.category,kind:update.kind??current.kind,included:update.included??current.included};
    try{await api.updateTransaction(id,merged);await refresh();setSelected((s)=>s?.id===id?{...s,...merged,manuallyModified:true}:s);notify('交易已更新。');}catch(e){notify(String(e),'error');}
  };
  const updateSelected=(update:Partial<Pick<Transaction,'category'|'kind'|'included'>>)=>{if(selected)void updateRecord(selected.id,update);};

  const savePath=async(title:string,defaultName:string,filters:{name:string;extensions:string[]}[])=>save({title,defaultPath:defaultName,filters});
  const backup=async()=>{const path=await savePath('备份 SQLite 数据库','expenses-backup.db',[{name:'SQLite 数据库',extensions:['db']}]);if(!path)return;try{await api.backup(path);notify('数据库备份已保存。');}catch(e){notify(String(e),'error');}};
  const exportJson=async()=>{const path=await savePath('导出 JSON 数据备份','expenses-backup.json',[{name:'JSON 备份',extensions:['json']}]);if(!path)return;try{await api.exportJson(path);notify('JSON 数据备份已导出。');}catch(e){notify(String(e),'error');}};
  const exportCsv=async()=>{const path=await savePath('导出交易 CSV','expenses.csv',[{name:'CSV 文件',extensions:['csv']}]);if(!path)return;try{await api.exportCsv(path,range.start,range.end,sourceFilter,categoryFilter,kindFilter);notify('筛选范围内的 CSV 已导出。');}catch(e){notify(String(e),'error');}};
  const restore=async()=>{
    const selectedPath=await open({title:'选择数据库或 JSON 备份',multiple:false,filters:[{name:'备份文件',extensions:['db','sqlite','sqlite3','json']} ]});
    if(!selectedPath||Array.isArray(selectedPath))return;
    const isJson=selectedPath.toLowerCase().endsWith('.json');
    const accepted=window.confirm(restoreMode==='replace'?'将完整替换当前数据库中的所有数据。请确认已有备份后继续。':'将合并备份数据；冲突时保留当前记录。是否继续？');if(!accepted)return;
    try{const result=isJson?await api.restoreJson(selectedPath,restoreMode):await api.restore(selectedPath,restoreMode);await refresh();notify(`恢复完成：新增 ${result.inserted} 笔${result.conflicts?`，冲突 ${result.conflicts} 笔保留现有数据`:''}。`);}catch(e){notify(String(e),'error');}
  };
  const moveDatabase=async()=>{
    const path=await savePath('选择新数据库文件位置','expenses.db',[{name:'SQLite 数据库',extensions:['db']}]);if(!path)return;
    if(!window.confirm('应用将使用备份 API 将当前数据库迁移到新位置。迁移成功后原数据库文件仍保留。继续吗？'))return;
    try{setInfo(await api.migrate(path));await refresh();notify('数据库已迁移，原文件保留。');}catch(e){notify(String(e),'error');}
  };
  const clearAll=async()=>{if(!window.confirm('清空交易、导入历史和自定义规则？此操作无法撤销。'))return;if(!window.confirm('再次确认清空数据？'))return;try{await api.clear();await refresh();notify('数据已清空。');}catch(e){notify(String(e),'error');}};

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><Wallet size={20}/></span><span><b>Expense Lens</b><small>个人收支分析</small></span></div>
      <div className="nav-label">工作台</div>
      <nav>{nav.map(item=>{const Icon=item.icon;return <button key={item.id} className={`nav-item ${page===item.id?'active':''}`} onClick={()=>setPage(item.id)}><Icon size={18}/><span>{item.label}</span>{item.id==='import'&&<span className="nav-count">+</span>}</button>;})}</nav>
      <div className="sidebar-spacer"/>
      <button className="db-status" aria-label="打开数据管理" onClick={()=>setPage('settings')}><span className="status-dot"/><span><b>交易数据</b><small>{info?.transactionCount??0} 笔交易</small></span><ChevronDown size={15}/></button>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs"><span>Expense Lens</span><span className="crumb-sep">/</span><b>{nav.find(n=>n.id===page)?.label}</b></div><div className="top-actions"><button className="icon-button theme-toggle" title={theme==='dark'?'切换到浅色模式':'切换到深色模式'} aria-label={theme==='dark'?'切换到浅色模式':'切换到深色模式'} aria-pressed={theme==='dark'} onClick={()=>setTheme(t=>t==='dark'?'light':'dark')}>{theme==='dark'?<Sun size={18}/>:<Moon size={18}/>}</button><button className="primary-button" onClick={()=>fileInput.current?.click()}><Upload size={16}/> 导入账单</button><input ref={fileInput} hidden type="file" multiple accept=".xlsx,.csv" onChange={e=>{void handleFiles(e.target.files);e.target.value='';}}/></div></header>
      <section className="content">
        {loading?<div className="loading-state"><LoaderCircle className="spin"/>正在加载…</div>:<>
          {page==='overview'&&<Overview dashboard={dashboard} previous={dashboardPrevious} range={range} setRange={setRange} activePreset={activePreset} setActivePreset={setActivePreset} source={dashboardSource} setSource={setDashboardSource} category={dashboardCategory} setCategory={setDashboardCategory} onOpenTransactions={()=>setPage('transactions')} onImport={()=>fileInput.current?.click()} />}
          {page==='transactions'&&<TransactionsPage rows={filtered} range={range} setRange={setRange} search={search} setSearch={setSearch} source={sourceFilter} setSource={setSourceFilter} kind={kindFilter} setKind={setKindFilter} category={categoryFilter} setCategory={setCategoryFilter} sort={sort} setSort={setSort} selected={selected} setSelected={setSelected} onUpdate={updateSelected} onExport={exportCsv} onLoadMore={loadMore} hasMore={Boolean(info&&transactions.length<info.transactionCount)} />}
          {page==='import'&&<ImportPage drafts={drafts} busy={busy} batches={batches} onFiles={()=>fileInput.current?.click()} onDropFiles={files=>void handleFiles(files)} onConfirm={()=>void confirmImport()} onClear={()=>setDrafts([])} onMapping={changeMapping} onChoice={(draftIndex,id,value)=>setDrafts(items=>items.map((d,i)=>i===draftIndex?{...d,choices:{...d.choices,[id]:value}}:d))} duplicateStats={duplicateStats} onUndo={async id=>{if(!window.confirm('撤销该批次新增的记录？已有记录不会被删除。'))return;try{await api.undoBatch(id);await refresh();notify('该批次新增记录已撤销。');}catch(e){notify(String(e),'error');}}} />}
          {page==='rules'&&<RulesPage rows={transactions} rules={rules} onUpdate={(id,update)=>void updateRecord(id,update)} onAddRule={async input=>{try{await api.saveCategoryRule(input);await refresh();notify('自定义规则已保存，后续导入将应用此规则。');}catch(e){notify(String(e),'error');}}} onDeleteRule={async id=>{try{await api.deleteCategoryRule(id);await refresh();notify('分类规则已删除。');}catch(e){notify(String(e),'error');}}} />}
          {page==='settings'&&<SettingsPage info={info} batches={batches} mode={restoreMode} setMode={setRestoreMode} onBackup={backup} onJson={exportJson} onCsv={exportCsv} onRestore={restore} onMove={moveDatabase} onClear={clearAll} onUndo={async id=>{if(!window.confirm('撤销该批次新增的记录？'))return;try{await api.undoBatch(id);await refresh();notify('已撤销。');}catch(e){notify(String(e),'error');}}} />}
        </>}
      </section>
    </main>
    {toast&&<div className={`toast ${toast.tone}`}><span>{toast.tone==='error'?<AlertCircle size={18}/>:<Check size={18}/>}</span>{toast.message}<button onClick={()=>setToast(null)}><X size={15}/></button></div>}
  </div>;
}
export default App;

function Overview({dashboard,previous,range,setRange,activePreset,setActivePreset,source,setSource,category,setCategory,onOpenTransactions,onImport}:{dashboard:DashboardData|null;previous:DashboardData|null;range:{start:string;end:string};setRange:(r:{start:string;end:string})=>void;activePreset:'month'|'last'|'quarter'|'year'|'custom';setActivePreset:(v:'month'|'last'|'quarter'|'year'|'custom')=>void;source:string;setSource:(v:string)=>void;category:string;setCategory:(v:string)=>void;onOpenTransactions:()=>void;onImport:()=>void}){
  const stats=dashboard;
  const setPreset=(key:'month'|'last'|'quarter'|'year')=>{setActivePreset(key);const now=new Date();if(key==='month')setRange(period());else if(key==='last')setRange({start:localDate(new Date(now.getFullYear(),now.getMonth()-1,1)),end:localDate(new Date(now.getFullYear(),now.getMonth(),0))});else if(key==='quarter'){const q=Math.floor(now.getMonth()/3);setRange({start:localDate(new Date(now.getFullYear(),q*3,1)),end:localDate(new Date(now.getFullYear(),q*3+3,0))});}else setRange({start:`${now.getFullYear()}-01-01`,end:`${now.getFullYear()}-12-31`});};
  const pie=stats?.categoryTotals.slice(0,7).map(x=>({name:x.category,value:x.amountCents/100}))??[];
  const trend=stats?.dailyTotals.map(x=>({date:x.day.slice(5),expense:x.expenseCents/100,income:x.incomeCents/100}))??[];
  const hasData=(stats?.transactionCount??0)>0;
  return <div className="page-stack">
    <div className="page-heading"><div><h1>开销总览</h1><p>按时间、来源和分类查看消费情况。</p></div><div className="heading-actions"><button className="secondary-button" onClick={onOpenTransactions}><ListFilter size={16}/> 交易明细</button><button className="primary-button" onClick={onImport}><Upload size={16}/> 导入账单</button></div></div>
    <div className="filter-bar"><div className="segmented">{([['month','本月'],['last','上月'],['quarter','本季度'],['year','今年']] as const).map(([key,label])=><button key={key} className={activePreset===key?'active':''} aria-pressed={activePreset===key} onClick={()=>setPreset(key)}>{label}</button>)}</div><label className="date-field">统计范围<input type="date" value={range.start} onChange={e=>{setActivePreset('custom');setRange({...range,start:e.target.value});}}/><span>至</span><input type="date" value={range.end} onChange={e=>{setActivePreset('custom');setRange({...range,end:e.target.value});}}/></label><select className="filter-select" value={source} onChange={e=>setSource(e.target.value)}><option value="all">全部平台</option><option value="wechat">微信支付</option><option value="alipay">支付宝</option></select><select className="filter-select" value={category} onChange={e=>setCategory(e.target.value)}><option value="all">全部分类</option>{categories.map(c=><option key={c}>{c}</option>)}</select></div>
    <div className="metric-grid">
      <MetricCard title="总支出" value={hasData?formatMoney(stats?.totalExpenseCents??0):'—'} tone="expense" icon={<ArrowUpRight size={17}/>} hint="已确认且计入统计的消费" compare={hasData?changePercent(stats?.totalExpenseCents??0,previous?.totalExpenseCents??0):null} />
      <MetricCard title="总收入" value={hasData?formatMoney(stats?.totalIncomeCents??0):'—'} tone="income" icon={<ArrowDownLeft size={17}/>} hint="退款与内部转账不计入" compare={hasData?changePercent(stats?.totalIncomeCents??0,previous?.totalIncomeCents??0):null} />
      <MetricCard title="净收支" value={hasData?formatMoney((stats?.totalIncomeCents??0)-(stats?.totalExpenseCents??0)+(stats?.refundCents??0)):'—'} tone="neutral" icon={<ArrowLeftRight size={17}/>} hint="收入 − 消费 + 退款" compare={hasData?changePercent((stats?.totalIncomeCents??0)-(stats?.totalExpenseCents??0)+(stats?.refundCents??0),(previous?.totalIncomeCents??0)-(previous?.totalExpenseCents??0)+(previous?.refundCents??0)):null} />
      <MetricCard title="净消费" value={hasData?formatMoney(stats?.netExpenseCents??0):'—'} tone="blue" icon={<Wallet size={17}/>} hint="总消费扣除已匹配退款" compare={hasData?changePercent(stats?.netExpenseCents??0,previous?.netExpenseCents??0):null} />
    </div>
    <div className="chart-grid">
      <section className="card trend-card"><div className="card-head"><div><h2>消费趋势</h2><p>{range.start} — {range.end} · 金额（元）</p></div><div className="chart-legend"><span><i className="legend-dot blue"/>支出</span><span><i className="legend-dot green"/>收入</span></div></div>
        {trend.length?<div className="chart-area"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trend} margin={{top:12,right:12,bottom:0,left:0}}><defs><linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7397ec" stopOpacity={.23}/><stop offset="95%" stopColor="#7397ec" stopOpacity={.015}/></linearGradient></defs><CartesianGrid stroke="#edf0f4" vertical={false}/><XAxis dataKey="date" tickLine={false} axisLine={false} tick={{fill:'#97a0ae',fontSize:13}} minTickGap={24}/><YAxis tickLine={false} axisLine={false} tick={{fill:'#97a0ae',fontSize:13}} width={50}/><Tooltip formatter={(v)=>`¥${Number(v).toFixed(2)}`} labelFormatter={v=>`日期 ${v}`}/><Area type="monotone" dataKey="expense" name="支出" stroke="#7397ec" strokeWidth={2.5} fill="url(#expenseFill)"/><Area type="monotone" dataKey="income" name="收入" stroke="#70b5a2" strokeWidth={2} fill="transparent"/></AreaChart></ResponsiveContainer></div>:<EmptyChart title={hasData?'此范围暂无收支数据':'导入账单后查看消费趋势'} />}
      </section>
      <section className="card category-card"><div className="card-head"><div><h2>分类结构</h2><p>按消费分类汇总 · 金额（元）</p></div><button className="text-button" onClick={onOpenTransactions}>查看明细 <span>→</span></button></div>
        {pie.length?<><div className="pie-wrap"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={pie} dataKey="value" nameKey="name" innerRadius={65} outerRadius={92} paddingAngle={3} stroke="none">{pie.map((_,i)=><Cell key={i} fill={chartColors[i%chartColors.length]}/>)}</Pie><Tooltip formatter={(v)=>`¥${Number(v).toFixed(2)}`}/></PieChart></ResponsiveContainer><div className="pie-center"><b>{formatMoney(stats?.netExpenseCents??0)}</b><small>净消费</small></div></div><div className="category-legend">{pie.slice(0,5).map((x,i)=><div key={x.name}><span><i style={{background:chartColors[i]}}/>{x.name}</span><b>{formatMoney(Math.round(x.value*100))}</b></div>)}</div></>:<EmptyChart title="还没有可汇总的消费分类"/>}
      </section>
    </div>
    <div className="bottom-grid">
      <section className="card merchant-card"><div className="card-head"><div><h2>常去商户</h2><p>按消费金额排序 · 本期</p></div><button className="text-button" onClick={onOpenTransactions}>全部交易 →</button></div>{stats?.merchantTotals.length?<div className="merchant-list">{stats.merchantTotals.slice(0,5).map((x,i)=><div className="merchant-row" key={x.merchant}><span className="rank">{String(i+1).padStart(2,'0')}</span><span className="merchant-name">{x.merchant}</span><div className="merchant-bar"><i style={{width:`${Math.max(12,x.amountCents/(stats.merchantTotals[0]?.amountCents||1)*100)}%`}}/></div><b>{formatMoney(x.amountCents)}</b></div>)}</div>:<EmptyChart title="导入账单后查看商户排行"/>}</section>
      <section className="card summary-card"><div className="card-head"><div><h2>收支结构</h2><p>本期各类资金流向</p></div><Activity size={18} className="muted-icon"/></div><div className="structure-list"><StructureRow label="消费支出" value={stats?.totalExpenseCents??0} color="blue"/><StructureRow label="普通收入" value={stats?.totalIncomeCents??0} color="green"/><StructureRow label="退款" value={stats?.refundCents??0} color="orange"/><div className="structure-note"><ArrowLeftRight size={15}/> 内部转账不会计入收支</div></div></section>
    </div>
    {!hasData&&<div className="welcome-banner"><div className="welcome-icon"><Sparkles size={21}/></div><div><b>开始整理你的账单</b><p>选择微信支付 XLSX 或支付宝 CSV 开始分析。</p></div><button className="primary-button" onClick={onImport}>选择文件 <ArrowUpRight size={16}/></button></div>}
  </div>;
}
function MetricCard({title,value,tone,icon,hint,compare}:{title:string;value:string;tone:string;icon:ReactNode;hint:string;compare:string|null}){return <div className={`metric-card ${tone}`}><div className="metric-top"><span>{title}</span><i>{icon}</i></div><strong>{value}</strong><small>{hint}{compare&&<em className={`compare ${compare.startsWith('+')?'up':'down'}`}>{compare} 较上一等长时段</em>}</small></div>}
function changePercent(current:number,previous:number):string|null{if(previous===0)return current===0?'0.0%':null;const pct=(current-previous)/Math.abs(previous)*100;return `${pct>=0?'+':''}${pct.toFixed(1)}%`;}
function EmptyChart({title}:{title:string}){return <div className="empty-chart"><span><BarChart3 size={23}/></span><p>{title}</p></div>}
function StructureRow({label,value,color}:{label:string;value:number;color:string}){return <div className="structure-row"><span><i className={`legend-dot ${color}`}/>{label}</span><b>{formatMoney(value)}</b></div>}

function TransactionsPage({rows,range,setRange,search,setSearch,source,setSource,kind,setKind,category,setCategory,sort,setSort,selected,setSelected,onUpdate,onExport,onLoadMore,hasMore}:{rows:Transaction[];range:{start:string;end:string};setRange:(v:{start:string;end:string})=>void;search:string;setSearch:(v:string)=>void;source:string;setSource:(v:string)=>void;kind:string;setKind:(v:string)=>void;category:string;setCategory:(v:string)=>void;sort:'date'|'amount'|'merchant';setSort:(v:'date'|'amount'|'merchant')=>void;selected:Transaction|null;setSelected:(tx:Transaction|null)=>void;onUpdate:(u:Partial<Pick<Transaction,'category'|'kind'|'included'>>)=>void;onExport:()=>void;onLoadMore:()=>void;hasMore:boolean}){
  return <div className="page-stack"><div className="page-heading"><div><h1>交易明细</h1><p>搜索和筛选交易记录。</p></div><button className="secondary-button" onClick={onExport}><FileSpreadsheet size={16}/> 导出筛选范围 CSV</button></div>
    <div className="card ledger-card"><div className="ledger-controls"><label className="search-box"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索商户、描述或分类"/></label><input className="ledger-date" type="date" value={range.start} onChange={e=>setRange({...range,start:e.target.value})}/><input className="ledger-date" type="date" value={range.end} onChange={e=>setRange({...range,end:e.target.value})}/><select value={source} onChange={e=>setSource(e.target.value)}><option value="all">全部来源</option><option value="wechat">微信支付</option><option value="alipay">支付宝</option></select><select value={kind} onChange={e=>setKind(e.target.value)}><option value="all">全部类型</option>{['expense','income','refund','transfer','pending','cancelled'].map(k=><option key={k} value={k}>{kindName(k)}</option>)}</select><select value={category} onChange={e=>setCategory(e.target.value)}><option value="all">全部分类</option>{categories.map(c=><option key={c}>{c}</option>)}</select><select value={sort} onChange={e=>setSort(e.target.value as typeof sort)}><option value="date">按时间排序</option><option value="amount">按金额排序</option><option value="merchant">按商户排序</option></select></div>
      {rows.length?<div className="table-scroll"><table className="ledger-table"><thead><tr><th>交易时间</th><th>交易对象</th><th>类型 / 分类</th><th>来源</th><th className="align-right">金额</th><th>统计状态</th></tr></thead><tbody>{rows.map(tx=><tr key={tx.id} className={selected?.id===tx.id?'selected':''} onClick={()=>setSelected(tx)}><td><b>{tx.occurredAt.slice(0,10)}</b><small>{tx.occurredAt.slice(11,16)}</small></td><td><b className="merchant-cell">{tx.merchant}</b><small>{tx.description||'—'}</small></td><td><span className={`kind-tag ${tx.kind}`}>{kindName(tx.kind)}</span><small>{tx.category}</small></td><td><span className={`source-tag ${tx.source}`}>{sourceName(tx.source)}</span></td><td className={`align-right amount-cell ${tx.kind==='income'||tx.kind==='refund'?'positive':''}`}>{tx.kind==='income'||tx.kind==='refund'?'+ ':tx.kind==='expense'?'− ':''}{formatMoney(tx.amountCents)}</td><td><span className={`state-pill ${tx.included?'included':'excluded'}`}><i/>{tx.included?'计入统计':tx.exclusionReason||'未计入'}</span></td></tr>)}</tbody></table><div className="table-footer">当前展示 {rows.length} 笔</div>{hasMore&&<div className="load-more"><button className="secondary-button" onClick={onLoadMore}>加载更多交易</button></div>}</div>:<div className="empty-ledger"><span><Search size={22}/></span><b>{search?'没有找到匹配交易':'还没有交易记录'}</b><p>{search?'调整关键词或筛选条件后重试。':'导入微信或支付宝账单后，交易会显示在这里。'}</p></div>}
    </div>
    {selected&&<div className="detail-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}><aside className="detail-panel"><div className="detail-head"><div><h2>交易详情</h2></div><button className="icon-button" onClick={()=>setSelected(null)}><X size={19}/></button></div><div className="detail-amount">{formatMoney(selected.amountCents)}<small>{kindName(selected.kind)}</small></div><Detail label="交易对象" value={selected.merchant}/><Detail label="交易时间" value={selected.occurredAt.replace('T',' ')}/><Detail label="来源平台" value={sourceName(selected.source)}/><Detail label="交易单号" value={selected.platformId||'账单未提供'}/><Detail label="支付渠道" value={selected.paymentMethod||'未提供'}/><Detail label="交易状态" value={selected.status||'未提供'}/><Detail label="自动判断依据" value={selected.ruleReason||'无'}/><Detail label="排除原因" value={selected.exclusionReason||'—'}/><Detail label="手动修改" value={selected.manuallyModified?'是':'否'}/><div className="edit-fields"><label>类型<select value={selected.kind} onChange={e=>onUpdate({kind:e.target.value as Transaction['kind']})}>{['expense','income','refund','transfer','pending','cancelled'].map(k=><option key={k} value={k}>{kindName(k)}</option>)}</select></label><label>分类<select value={selected.category} onChange={e=>onUpdate({category:e.target.value})}>{categories.map(c=><option key={c}>{c}</option>)}</select></label><label className="check-row"><input type="checkbox" checked={selected.included} onChange={e=>onUpdate({included:e.target.checked})}/> 计入统计</label></div><details className="raw-details"><summary>查看原始账单字段</summary><pre>{JSON.stringify(safeJson(selected.rawJson||'{}'),null,2)}</pre></details></aside></div>}
  </div>;
}
function Detail({label,value}:{label:string;value:string}){return <div className="detail-row"><span>{label}</span><b>{value}</b></div>}
function kindName(kind:string){return ({expense:'消费支出',income:'普通收入',refund:'退款',transfer:'内部转账',pending:'待确认',cancelled:'已取消'} as Record<string,string>)[kind]??kind}
function sourceName(source:string){return ({wechat:'微信支付',alipay:'支付宝',other:'其他'} as Record<string,string>)[source]??source}
function safeJson(value:string):unknown{try{return JSON.parse(value);}catch{return {error:'原始字段内容无法解析'};}}

function ImportPage({drafts,busy,batches,onFiles,onDropFiles,onConfirm,onClear,onMapping,onChoice,duplicateStats,onUndo}:{drafts:Draft[];busy:boolean;batches:ImportBatch[];onFiles:()=>void;onDropFiles:(files:FileList)=>void;onConfirm:()=>void;onClear:()=>void;onMapping:(draftIndex:number,field:string,column:number)=>void;onChoice:(draftIndex:number,id:string,value:'new'|'skip')=>void;duplicateStats:(result:ParseResult)=>{certain:number;suspected:{id:string;candidate:string;reason:string}[]};onUndo:(id:string)=>void}){
  const totalRows=drafts.reduce((n,d)=>n+d.result.rowCount,0);const valid=drafts.reduce((n,d)=>n+d.result.parsed.length,0);const issues=drafts.reduce((n,d)=>n+d.result.issues.length,0);const certain=drafts.reduce((n,d)=>n+duplicateStats(d.result).certain,0);const suspected=drafts.reduce((n,d)=>n+duplicateStats(d.result).suspected.length,0);const exclusions=drafts.reduce((n,d)=>n+d.result.parsed.filter(x=>!x.transaction.included).length,0);
  const needsMapping=drafts.some(d=>d.result.mappingNeeded);
  return <div className="page-stack"><div className="page-heading"><div><h1>导入账单</h1><p>检查解析结果后确认导入。</p></div></div>
    <div className="import-steps"><div className="step active"><i>1</i><span>选择文件</span></div><span className="step-line"/><div className={`step ${drafts.length?'active':''}`}><i>2</i><span>检查与预览</span></div><span className="step-line"/><div className={`step ${drafts.length?'active':''}`}><i>3</i><span>确认导入</span></div></div>
    <div className="dropzone" onClick={onFiles} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(e.dataTransfer.files.length)onDropFiles(e.dataTransfer.files);}} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')onFiles()}}><div className="drop-icon"><Upload size={22}/></div><b>{busy?'正在读取账单…':'拖放文件到此处，或浏览选择'}</b><span>支持微信支付 .xlsx 与支付宝 .csv，可一次选择多个文件</span><button className="secondary-button" onClick={e=>{e.stopPropagation();onFiles()}} disabled={busy}><FileUp size={15}/> 选择账单文件</button></div>
    {drafts.length>0&&<><div className="section-title-row"><div><h2>导入预览</h2><p>写入前检查解析结果、异常行和重复项</p></div><button className="text-button danger-text" onClick={onClear}>清除预览</button></div><div className="import-stat-grid"><PreviewStat title="文件行数" value={totalRows}/><PreviewStat title="成功解析" value={valid} tone="green"/><PreviewStat title="异常行" value={issues} tone={issues?'orange':'green'}/><PreviewStat title="确定重复" value={certain} tone="blue"/><PreviewStat title="疑似重复" value={suspected} tone={suspected?'orange':'green'}/><PreviewStat title="待确认/排除" value={exclusions} tone="muted"/></div>
      {drafts.map((d,di)=><section className="card import-file-card" key={d.result.filename}><div className="import-file-head"><div className="file-icon"><FileSpreadsheet size={19}/></div><div><b>{d.result.filename}</b><small>{sourceName(d.result.source)} · {d.result.parsed.length} 条可解析 · {d.result.issues.length} 条异常</small></div><span className="file-ok"><Check size={14}/> 已解析</span></div>
        {d.result.mappingNeeded&&<div className="mapping-panel"><div><b><AlertCircle size={16}/> 需要确认字段映射</b><p>自动识别未找到必需字段，请为时间、金额和收支方向指定列。</p></div><div className="mapping-fields">{([['time','交易时间'],['amount','金额'],['direction','收支方向']] as const).map(([key,label])=><label key={key}>{label}<select value={d.result.mapping[key]??''} onChange={e=>onMapping(di,key,e.target.value===''?-1:Number(e.target.value))}><option value="">选择列</option>{d.result.headers.map((h,i)=><option key={i} value={i}>{h||`列${i+1}`}</option>)}</select></label>)}</div></div>}
        {d.result.parsed.length>0&&<div className="table-scroll preview-scroll"><table className="ledger-table"><thead><tr><th>行号</th><th>时间</th><th>交易对象</th><th>方向与分类</th><th className="align-right">金额</th><th>识别结果</th></tr></thead><tbody>{d.result.parsed.slice(0,20).map(({transaction:tx,rowNumber})=>{const suspect=duplicateStats(d.result).suspected.find(s=>s.id===tx.id);return <tr key={tx.id}><td>{rowNumber}</td><td>{tx.occurredAt.replace('T',' ')}</td><td><b>{tx.merchant}</b><small>{tx.description}</small></td><td><span className={`kind-tag ${tx.kind}`}>{kindName(tx.kind)}</span><small>{tx.category}</small></td><td className="align-right amount-cell">{formatMoney(tx.amountCents)}</td><td>{suspect?<><span className="state-pill excluded"><i/>疑似重复：匹配到 {suspect.candidate}</span><button className="micro-choice" onClick={()=>onChoice(di,tx.id,d.choices[tx.id]==='new'?'skip':'new')}>{d.choices[tx.id]==='new'?'按新交易保留 ✓':d.choices[tx.id]==='skip'?'已跳过，点击更改':'作为新交易保留'}</button></>:tx.exclusionReason?<span className="state-pill excluded"><i/>{tx.exclusionReason}</span>:<span className="state-pill included"><i/>拟计入</span>}</td></tr>})}</tbody></table></div>}
        {d.result.issues.length>0&&<details className="issue-details"><summary><AlertCircle size={15}/> 查看 {d.result.issues.length} 条异常行</summary>{d.result.issues.slice(0,20).map(issue=><div className="issue-row" key={issue.rowNumber}><b>第 {issue.rowNumber} 行</b><span>{issue.reason}</span><code>{Object.entries(issue.raw).slice(0,6).map(([k,v])=>`${k}=${v}`).join(' · ')}</code></div>)}</details>}
      </section>)}
      <div className="confirm-import"><div><b>预计新增有效交易</b><span>{Math.max(0,valid-certain-suspected)} 笔 · 异常行不会写入统计</span></div><button className="primary-button" disabled={busy||needsMapping||valid===0||drafts.some(d=>duplicateStats(d.result).suspected.some(s=>!d.choices[s.id]))} onClick={onConfirm}>{busy?<LoaderCircle size={16} className="spin"/>:<Check size={16}/>} 确认并写入数据库</button></div></>}
    <div className="section-title-row history-title"><div><h2>最近导入批次</h2><p>可撤销批次新增的数据，不会删除导入前已存在的交易</p></div></div>
    <div className="card batch-list">{batches.length?batches.slice(0,6).map(batch=><div className="batch-row" key={batch.id}><div className="batch-symbol"><FileSpreadsheet size={17}/></div><div className="batch-info"><b>{batch.filename}</b><small>{sourceName(batch.source)} · {batch.importedAt.replace('T',' ').slice(0,16)}</small></div><div className="batch-count"><b>{batch.addedCount}</b><small>新增</small></div><div className="batch-count"><b>{batch.duplicateCount}</b><small>重复</small></div><button className="text-button danger-text" onClick={()=>onUndo(batch.id)}>撤销</button></div>):<div className="empty-batches">导入完成后，批次历史会显示在这里。</div>}</div>
  </div>;
}
function PreviewStat({title,value,tone=''}:{title:string;value:number;tone?:string}){return <div className={`preview-stat ${tone}`}><small>{title}</small><b>{value.toLocaleString('zh-CN')}</b></div>}

function RulesPage({rows,rules,onUpdate,onAddRule,onDeleteRule}:{rows:Transaction[];rules:CategoryRule[];onUpdate:(id:string,update:Partial<Pick<Transaction,'category'|'kind'|'included'>>)=>void;onAddRule:(input:{name:string;pattern:string;category:string;enabled:boolean})=>void;onDeleteRule:(id:string)=>void}){
  const pending=rows.filter(tx=>tx.kind==='pending'||tx.category==='待确认');
  const [selectedId,setSelectedId]=useState('');
  const [keyword,setKeyword]=useState('');const [ruleCategory,setRuleCategory]=useState('餐饮');
  const current=pending.find(tx=>tx.id===selectedId)??pending[0];
  const catCounts=categories.slice(0,10).map(name=>({name,count:rows.filter(tx=>tx.category===name).length,total:rows.filter(tx=>tx.category===name&&tx.kind==='expense').reduce((s,tx)=>s+tx.amountCents,0)}));
  return <div className="page-stack"><div className="page-heading"><div><h1>分类与规则</h1></div></div>
    <div className="rules-layout"><div className="card category-manager"><div className="card-head"><div><h2>标准分类</h2><p>按分类查看已识别交易</p></div><Tags size={17} className="muted-icon"/></div><div className="category-manage-list">{catCounts.map((c,i)=><div className="category-manage-row" key={c.name}><span className="category-dot" style={{background:chartColors[i%chartColors.length]}}/><b>{c.name}</b><small>{c.count} 笔</small><strong>{formatMoney(c.total)}</strong></div>)}</div><div className="rules-note"><BookOpen size={16}/><span>首期内置规则以账单字段、状态和上下文共同判断。自动分类可在交易详情中修改。</span></div></div>
      <div className="card pending-card"><div className="card-head"><div><h2>待人工确认</h2><p>方向或交易性质不明确的记录不会默认进入统计</p></div><span className="pending-count">{pending.length}</span></div>{pending.length?<><div className="pending-picker">{pending.slice(0,20).map(tx=><button key={tx.id} className={current?.id===tx.id?'selected':''} onClick={()=>setSelectedId(tx.id)}><span>{tx.merchant}</span><small>{tx.occurredAt.slice(0,10)} · {formatMoney(tx.amountCents)}</small></button>)}</div>{current&&<div className="pending-edit"><div><b>{current.merchant}</b><p>{current.ruleReason}</p></div><label>确认为<select onChange={e=>{const kind=e.target.value as Transaction['kind'];onUpdate(current.id,{kind,category:kind==='expense'?'其他':kind==='income'?'收入':kind==='transfer'?'内部转账':current.category,included:kind==='expense'||kind==='income'||kind==='refund'});setSelectedId('');}} defaultValue=""><option value="" disabled>选择处理方式</option><option value="expense">消费支出</option><option value="income">普通收入</option><option value="transfer">内部转账</option><option value="refund">退款</option></select></label></div>}</>:<div className="empty-ledger compact"><span><Check size={20}/></span><b>当前没有待确认交易</b><p>未识别或模糊判断会出现在此处。</p></div>}</div>
    </div><section className="card custom-rules"><div className="card-head"><div><h2>自定义关键词规则</h2><p>新规则应用于之后导入的交易。</p></div><Tags size={17} className="muted-icon"/></div><div className="rule-create"><input value={keyword} onChange={e=>setKeyword(e.target.value)} placeholder="输入商户或描述关键词"/><select value={ruleCategory} onChange={e=>setRuleCategory(e.target.value)}>{categories.slice(0,10).map(c=><option key={c}>{c}</option>)}</select><button className="secondary-button" disabled={!keyword.trim()} onClick={()=>{onAddRule({name:`关键词：${keyword.trim()}`,pattern:keyword.trim(),category:ruleCategory,enabled:true});setKeyword('');}}>添加规则</button></div>{rules.length?<div className="user-rule-list">{rules.map(rule=><div className="user-rule-row" key={rule.id}><span className="rule-match">包含</span><b>{rule.pattern}</b><span className="rule-arrow">→</span><span className="rule-category-chip">{rule.category}</span><small>{rule.enabled?'已启用':'已暂停'}</small><button className="text-button danger-text" onClick={()=>onDeleteRule(rule.id)}>删除</button></div>)}</div>:<div className="empty-batches">暂未添加自定义规则。</div>}</section><div className="card rule-explainer"><div className="explainer-icon"><Sparkles size={18}/></div><div><b>分类说明</b><p>自动判断参考交易类型、状态、收支方向和账户信息；退款单独统计。</p></div></div>
  </div>;
}

function SettingsPage({info,batches,mode,setMode,onBackup,onJson,onCsv,onRestore,onMove,onClear,onUndo}:{info:DatabaseInfo|null;batches:ImportBatch[];mode:'merge'|'replace';setMode:(v:'merge'|'replace')=>void;onBackup:()=>void;onJson:()=>void;onCsv:()=>void;onRestore:()=>void;onMove:()=>void;onClear:()=>void;onUndo:(id:string)=>void}){
  const bytes=(info?.sizeBytes??0);const readable=bytes<1024*1024?`${(bytes/1024).toFixed(1)} KB`:`${(bytes/1024/1024).toFixed(2)} MB`;
  return <div className="page-stack"><div className="page-heading"><div><h1>数据管理</h1></div></div>
    <section className="card database-card"><div className="db-card-title"><span className="db-large-icon"><Database size={22}/></span><div><h2>数据库</h2><p>{info?.transactionCount??0} 笔交易 · {readable}</p></div></div><div className="db-location"><small>文件位置</small><code>{info?.path??'正在读取…'}</code></div><div className="db-actions"><button className="secondary-button" onClick={onMove}><ArrowLeftRight size={15}/> 更改位置</button><button className="secondary-button" onClick={onBackup}>立即备份</button></div></section>
    <div className="data-tools-grid"><section className="card data-tool"><div className="tool-icon blue-icon"><Database size={18}/></div><div><h3>数据库备份</h3><p>完整备份与恢复。</p></div><button className="secondary-button" onClick={onBackup}>导出 .db</button><button className="text-button" onClick={onRestore}>从备份恢复</button></section><section className="card data-tool"><div className="tool-icon green-icon"><FileSpreadsheet size={18}/></div><div><h3>JSON 备份</h3><p>包含交易和管理信息。</p></div><button className="secondary-button" onClick={onJson}>导出 JSON</button></section><section className="card data-tool"><div className="tool-icon orange-icon"><FileSpreadsheet size={18}/></div><div><h3>交易 CSV</h3><p>导出当前筛选范围。</p></div><button className="secondary-button" onClick={onCsv}>导出 CSV</button></section></div>
    <section className="card restore-options"><div><h3>恢复方式</h3><p>合并保留现有记录；替换会覆盖当前数据。</p></div><div className="radio-options"><label className={mode==='merge'?'selected':''}><input type="radio" checked={mode==='merge'} onChange={()=>setMode('merge')}/>合并数据</label><label className={mode==='replace'?'selected':''}><input type="radio" checked={mode==='replace'} onChange={()=>setMode('replace')}/>完整替换</label><button className="secondary-button" onClick={onRestore}>选择备份</button></div></section>
    <section className="card history-card"><div className="card-head"><div><h2>导入历史</h2><p>撤销只删除对应批次新增的交易。</p></div><span className="history-count">{batches.length} 个批次</span></div>{batches.length?batches.map(batch=><div className="batch-row" key={batch.id}><div className="batch-symbol"><FileSpreadsheet size={16}/></div><div className="batch-info"><b>{batch.filename}</b><small>{sourceName(batch.source)} · {batch.importedAt.slice(0,16).replace('T',' ')}</small></div><div className="batch-count"><b>{batch.addedCount}</b><small>新增</small></div><div className="batch-count"><b>{batch.duplicateCount}</b><small>重复</small></div><button className="text-button danger-text" onClick={()=>onUndo(batch.id)}>撤销批次</button></div>):<div className="empty-batches">暂无导入历史。</div>}</section>
    <section className="danger-zone"><div><b>清空数据</b><p>删除交易、导入历史和自定义规则。</p></div><button className="danger-button" onClick={onClear}>清空数据库</button></section>
  </div>;
}
