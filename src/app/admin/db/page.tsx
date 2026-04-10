'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Search, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Database, Loader2, Copy, Check, X, Table2, Key, Filter, RotateCw, MessageSquare, Users, Mail, Settings, CircleDot, FileText, Bell, ScrollText, GripHorizontal } from 'lucide-react';

type TableInfo = { name: string; count: number };
type Column = { name: string; type: string; pk: number };
type Pagination = { page: number; limit: number; total: number; totalPages: number };

const TABLE_ICONS: Record<string, typeof Table2> = {
  conversations: MessageSquare,
  contacts: Users,
  messages: Mail,
  settings: Settings,
  unread_counts: CircleDot,
  reply_templates: FileText,
  push_subscriptions: Bell,
  webhook_logs: ScrollText,
};

function formatTimestamp(val: unknown, colName: string): string | null {
  if (typeof val !== 'number' || !colName.match(/(_at|_seen)$/)) return null;
  try {
    const ms = val > 1e12 ? val : val * 1000;
    return new Date(ms).toLocaleString('en-MY', { dateStyle: 'medium', timeStyle: 'short' });
  } catch { return null; }
}

export default function DbViewerPage() {
  const [token, setToken] = useState('');
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [columns, setColumns] = useState<Column[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [orderBy, setOrderBy] = useState('');
  const [orderDir, setOrderDir] = useState<'asc' | 'desc'>('desc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [selectedRow, setSelectedRow] = useState<Record<string, unknown> | null>(null);
  const [selectedRowIdx, setSelectedRowIdx] = useState(-1);
  const [panelWidth, setPanelWidth] = useState(420);
  const dragRef = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token');
    if (t) setToken(t);
    else setError('No access token provided');
  }, []);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetch('/api/admin/db?token=' + token)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return; }
        setTables(data.tables);
        if (data.tables.length > 0) {
          const first = data.tables[0].name;
          setSelectedTable(first);
          doLoadTable(first, 1, '', '', 'desc');
        }
      })
      .catch(() => setError('Failed to connect'))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const doLoadTable = async (table: string, page = 1, searchVal = '', sortCol = '', sortDir: 'asc' | 'desc' = 'desc') => {
    if (!token) return;
    setLoading(true);
    setSelectedRow(null);
    setSelectedRowIdx(-1);
    try {
      const params = new URLSearchParams({ token, table, page: String(page), limit: '50' });
      if (searchVal) params.set('search', searchVal);
      if (sortCol) { params.set('orderBy', sortCol); params.set('orderDir', sortDir); }
      const res = await fetch('/api/admin/db?' + params.toString());
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setColumns(data.columns);
      setRows(data.rows);
      setPagination(data.pagination);
      setError('');
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const refreshCurrent = useCallback(() => {
    doLoadTable(selectedTable, pagination.page, search, orderBy, orderDir);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTable, pagination.page, search, orderBy, orderDir, token]);

  // Drag to resize the detail panel width
  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = true;
    const startX = e.clientX;
    const startW = panelWidth;
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = startX - ev.clientX;
      setPanelWidth(Math.max(300, Math.min(800, startW + delta)));
    };
    const onUp = () => {
      dragRef.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [panelWidth]);

  const handleSelectTable = (name: string) => {
    setSelectedTable(name);
    setSearch('');
    setSearchInput('');
    setOrderBy('');
    setOrderDir('desc');
    doLoadTable(name, 1, '', '', 'desc');
  };

  const handleSearch = () => {
    setSearch(searchInput);
    doLoadTable(selectedTable, 1, searchInput, orderBy, orderDir);
  };

  const handleClearSearch = () => {
    setSearch('');
    setSearchInput('');
    doLoadTable(selectedTable, 1, '', orderBy, orderDir);
  };

  const handleSort = (col: string) => {
    const newDir = orderBy === col && orderDir === 'desc' ? 'asc' : 'desc';
    setOrderBy(col);
    setOrderDir(newDir);
    doLoadTable(selectedTable, 1, search, col, newDir);
  };

  const handlePage = (page: number) => {
    doLoadTable(selectedTable, page, search, orderBy, orderDir);
  };

  const copyValue = (value: string) => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const formatCell = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const isNullVal = (value: unknown) => value === null || value === undefined;

  if (error && tables.length === 0) {
    return (
      <div className="h-screen bg-[#1c1c1e] text-white flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto">
            <Database className="h-8 w-8 text-red-400" />
          </div>
          <p className="text-red-400 text-lg font-medium">Access Denied</p>
          <p className="text-[#8e8e93] text-sm">Token may be expired. Generate a new one from Settings.</p>
        </div>
      </div>
    );
  }

  const startRow = (pagination.page - 1) * pagination.limit + 1;
  const endRow = Math.min(pagination.page * pagination.limit, pagination.total);

  return (
    <div className="h-screen flex bg-[#1c1c1e] text-[#e5e5ea] text-[13px]">
      {/* Sidebar */}
      <div className="w-52 flex-shrink-0 bg-[#2c2c2e] border-r border-[#3a3a3c] flex flex-col">
        <div className="px-3 pt-3 pb-2">
          <div className="flex items-center gap-2 px-1 mb-3">
            <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
            <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
            <div className="w-3 h-3 rounded-full bg-[#28c840]" />
          </div>
          <h2 className="text-[10px] font-semibold text-[#636366] uppercase tracking-wider px-1">Tables</h2>
        </div>
        <div className="flex-1 overflow-y-auto px-1.5 pb-2">
          {tables.map(t => (
            <button
              key={t.name}
              onClick={() => handleSelectTable(t.name)}
              className={'w-full flex items-center gap-2 px-2.5 py-[6px] rounded-md text-left transition-all mb-px ' +
                (selectedTable === t.name
                  ? 'bg-[#0a84ff] text-white'
                  : 'text-[#e5e5ea] hover:bg-[#3a3a3c]')
              }
            >
              <span className="text-sm leading-none">
                {(() => { const Icon = TABLE_ICONS[t.name] || Table2; return <Icon className={'h-3.5 w-3.5 ' + (selectedTable === t.name ? 'text-white' : 'text-[#8e8e93]')} />; })()}
              </span>
              <span className="flex-1 truncate text-[12px]">{t.name}</span>
              <span className={'text-[10px] tabular-nums ' + (selectedTable === t.name ? 'text-white/70' : 'text-[#636366]')}>
                {t.count.toLocaleString()}
              </span>
            </button>
          ))}
        </div>
        <div className="px-3 py-2 border-t border-[#3a3a3c]">
          <p className="text-[10px] text-[#48484a]">SQLite &bull; {tables.reduce((a, t) => a + t.count, 0).toLocaleString()} rows</p>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="h-10 flex items-center gap-2 px-3 border-b border-[#3a3a3c] bg-[#2c2c2e] flex-shrink-0">
          <Table2 className="h-3.5 w-3.5 text-[#0a84ff]" />
          <span className="font-semibold text-[12px]">{selectedTable}</span>
          <span className="text-[10px] text-[#636366]">{pagination.total.toLocaleString()} rows</span>
          <div className="flex-1" />
          <div className="relative w-56">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[#48484a]" />
            <input
              ref={searchRef}
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Filter..."
              className="w-full bg-[#1c1c1e] border border-[#3a3a3c] rounded pl-7 pr-7 py-1 text-[11px] text-[#e5e5ea] placeholder-[#48484a] focus:outline-none focus:border-[#0a84ff]"
            />
            {searchInput && (
              <button onClick={handleClearSearch} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X className="h-3 w-3 text-[#48484a] hover:text-white" />
              </button>
            )}
          </div>
          {search && (
            <span className="flex items-center gap-1 bg-[#0a84ff]/15 text-[#0a84ff] px-2 py-0.5 rounded text-[10px]">
              <Filter className="h-2.5 w-2.5" />
              {search.length > 15 ? search.slice(0, 15) + '\u2026' : search}
              <button onClick={handleClearSearch}><X className="h-2.5 w-2.5" /></button>
            </span>
          )}
          <button onClick={refreshCurrent} className="p-1 rounded hover:bg-[#3a3a3c] text-[#636366] hover:text-white" title="Refresh">
            <RotateCw className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Data grid */}
        <div className="flex-1 overflow-auto relative">
          {loading && (
            <div className="absolute inset-0 bg-[#1c1c1e]/70 z-10 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-[#0a84ff]" />
            </div>
          )}
          <table className="w-full min-w-max border-collapse text-[12px]">
            <thead className="sticky top-0 z-[5]">
              <tr className="bg-[#28282a]">
                <th className="w-12 px-2 py-[5px] text-[10px] text-[#48484a] font-normal text-center border-b border-r border-[#3a3a3c]">#</th>
                {columns.map(col => {
                  const isSorted = orderBy === col.name;
                  return (
                    <th
                      key={col.name}
                      onClick={() => handleSort(col.name)}
                      className="px-3 py-[5px] text-left font-normal cursor-pointer select-none border-b border-r border-[#3a3a3c] last:border-r-0 hover:bg-[#3a3a3c]/50"
                    >
                      <span className="flex items-center gap-1">
                        {col.pk ? <Key className="h-2.5 w-2.5 text-[#ff9f0a]" /> : null}
                        <span className={'text-[11px] ' + (isSorted ? 'text-[#0a84ff] font-medium' : 'text-[#8e8e93]')}>{col.name}</span>
                        <span className="text-[9px] text-[#48484a]">{col.type || 'TEXT'}</span>
                        {isSorted && (orderDir === 'asc' ? <ChevronUp className="h-2.5 w-2.5 text-[#0a84ff]" /> : <ChevronDown className="h-2.5 w-2.5 text-[#0a84ff]" />)}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="font-mono">
              {rows.length === 0 && !loading ? (
                <tr><td colSpan={columns.length + 1} className="text-center py-16 text-[#48484a]">No rows found</td></tr>
              ) : rows.map((row, i) => {
                const isSelected = selectedRowIdx === i;
                return (
                  <tr
                    key={i}
                    onClick={() => {
                      if (isSelected) { setSelectedRow(null); setSelectedRowIdx(-1); }
                      else { setSelectedRow(row); setSelectedRowIdx(i); }
                    }}
                    className={'cursor-pointer transition-colors ' +
                      (isSelected
                        ? 'bg-[#0a84ff]/20 outline outline-1 outline-[#0a84ff]/50'
                        : i % 2 === 0
                          ? 'bg-[#1c1c1e] hover:bg-[#252527]'
                          : 'bg-[#222224] hover:bg-[#252527]')
                    }
                  >
                    <td className="px-2 py-[4px] text-[10px] text-[#48484a] text-center border-r border-[#2a2a2c] tabular-nums">{startRow + i}</td>
                    {columns.map(col => {
                      const raw = formatCell(row[col.name]);
                      const ts = formatTimestamp(row[col.name], col.name);
                      const isNull = isNullVal(row[col.name]);
                      const maxLen = col.name.match(/content|payload|text|json|body/) ? 50 : 35;
                      const display = ts || (raw.length > maxLen ? raw.slice(0, maxLen) + '\u2026' : raw);
                      return (
                        <td key={col.name} className="px-3 py-[4px] border-r border-[#2a2a2c] last:border-r-0 whitespace-nowrap">
                          {isNull ? (
                            <span className="text-[#3a3a3c] italic text-[10px]">NULL</span>
                          ) : col.pk ? (
                            <span className="text-[#64d2ff]">{display}</span>
                          ) : ts ? (
                            <span className="text-[#8e8e93]">{display}</span>
                          ) : (
                            <span className="text-[#d1d1d6]">{display}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Status bar */}
        <div className="h-6 flex items-center justify-between px-3 border-t border-[#3a3a3c] bg-[#28282a] flex-shrink-0 text-[10px] text-[#636366]">
          <span>
            {pagination.total > 0
              ? 'Rows ' + startRow + '\u2013' + endRow + ' of ' + pagination.total.toLocaleString()
              : 'Empty table'}
            {search ? ' (filtered)' : ''}
          </span>
          <div className="flex items-center gap-0.5">
            <button onClick={() => handlePage(1)} disabled={pagination.page <= 1} className="px-1.5 py-px rounded hover:bg-[#3a3a3c] disabled:opacity-25">First</button>
            <button onClick={() => handlePage(pagination.page - 1)} disabled={pagination.page <= 1} className="p-px rounded hover:bg-[#3a3a3c] disabled:opacity-25">
              <ChevronLeft className="h-3 w-3" />
            </button>
            <span className="px-2 tabular-nums text-[#8e8e93]">{pagination.page}/{pagination.totalPages || 1}</span>
            <button onClick={() => handlePage(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages} className="p-px rounded hover:bg-[#3a3a3c] disabled:opacity-25">
              <ChevronRight className="h-3 w-3" />
            </button>
            <button onClick={() => handlePage(pagination.totalPages)} disabled={pagination.page >= pagination.totalPages} className="px-1.5 py-px rounded hover:bg-[#3a3a3c] disabled:opacity-25">Last</button>
          </div>
        </div>
      </div>

      {/* Right slideover detail panel */}
      {selectedRow && (
        <div className="flex-shrink-0 flex h-full" style={{ width: panelWidth }}>
          {/* Drag handle */}
          <div
            onMouseDown={startDrag}
            className="w-1.5 flex-shrink-0 bg-[#2a2a2c] hover:bg-[#0a84ff] cursor-col-resize transition-colors relative group"
          >
            <div className="absolute top-1/2 -translate-y-1/2 -left-1 w-4 h-10 flex items-center justify-center opacity-0 group-hover:opacity-100">
              <GripHorizontal className="h-3.5 w-3.5 text-[#0a84ff] rotate-90" />
            </div>
          </div>
          {/* Panel content */}
          <div className="flex-1 flex flex-col bg-[#1c1c1e] min-w-0">
            {/* Header with row identifier */}
            <div className="px-4 py-3 border-b border-[#3a3a3c] flex-shrink-0 bg-[#2c2c2e]">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-[#0a84ff]/20 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-[#0a84ff] tabular-nums">{startRow + selectedRowIdx}</span>
                  </div>
                  <span className="text-[12px] font-semibold text-[#e5e5ea]">Row Detail</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => { copyValue(columns.map(c => c.name + ': ' + formatCell(selectedRow[c.name])).join('\n')); }} className="p-1.5 rounded hover:bg-[#3a3a3c] text-[#636366] hover:text-white transition-colors" title="Copy all fields">
                    {copied ? <Check className="h-3.5 w-3.5 text-[#30d158]" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                  <button onClick={() => { setSelectedRow(null); setSelectedRowIdx(-1); }} className="p-1.5 rounded hover:bg-[#3a3a3c] text-[#636366] hover:text-white transition-colors" title="Close">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {/* Show PK value as subtitle */}
              {columns.filter(c => c.pk).map(c => (
                <p key={c.name} className="text-[10px] text-[#8e8e93] ml-8 font-mono truncate">
                  {c.name}: <span className="text-[#64d2ff]">{formatCell(selectedRow[c.name])}</span>
                </p>
              ))}
            </div>
            {/* Fields */}
            <div className="flex-1 overflow-auto px-3 py-3 space-y-1">
              {columns.map(col => {
                const raw = formatCell(selectedRow[col.name]);
                const ts = formatTimestamp(selectedRow[col.name], col.name);
                const isNull = isNullVal(selectedRow[col.name]);
                const isPk = col.pk === 1;
                return (
                  <div key={col.name} className="rounded-lg bg-[#2c2c2e] border border-[#3a3a3c]/50 hover:border-[#3a3a3c] transition-colors group">
                    <div className="px-3 py-1.5 flex items-center gap-1.5 border-b border-[#3a3a3c]/30">
                      {isPk ? <Key className="h-2.5 w-2.5 text-[#ff9f0a]" /> : null}
                      <span className="text-[10px] font-semibold text-[#8e8e93] uppercase tracking-wide flex-1">{col.name}</span>
                      <span className="text-[9px] text-[#48484a] bg-[#1c1c1e] px-1.5 py-0.5 rounded">{col.type || 'TEXT'}</span>
                      <button
                        onClick={e => { e.stopPropagation(); copyValue(raw); }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 text-[#636366] hover:text-white transition-opacity"
                        title="Copy value"
                      >
                        <Copy className="h-2.5 w-2.5" />
                      </button>
                    </div>
                    <div className="px-3 py-2">
                      {isNull ? (
                        <span className="text-[#48484a] italic text-[12px]">NULL</span>
                      ) : isPk ? (
                        <span className="text-[12px] font-mono text-[#64d2ff]">{raw}</span>
                      ) : ts ? (
                        <div>
                          <p className="text-[12px] text-[#e5e5ea]">{ts}</p>
                          <p className="text-[10px] text-[#636366] font-mono mt-0.5">{raw}</p>
                        </div>
                      ) : (
                        <pre className="text-[12px] font-mono whitespace-pre-wrap break-all text-[#e5e5ea] leading-relaxed max-h-40 overflow-auto">
                          {raw}
                        </pre>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
