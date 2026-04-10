'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, ChevronLeft, ChevronRight, ArrowUpDown, Database, Loader2, ArrowLeft, Copy, Check } from 'lucide-react';

type TableInfo = { name: string; count: number };
type Column = { name: string; type: string; pk: number };
type Pagination = { page: number; limit: number; total: number; totalPages: number };

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
  const [copied, setCopied] = useState<string | null>(null);

  // Get token from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token');
    if (t) setToken(t);
    else setError('No access token provided');
  }, []);

  // Load table list
  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetch(`/api/admin/db?token=${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return; }
        setTables(data.tables);
      })
      .catch(() => setError('Failed to connect'))
      .finally(() => setLoading(false));
  }, [token]);

  // Load table data
  const loadTable = useCallback(async (table: string, page = 1, searchVal = search, sortCol = orderBy, sortDir = orderDir) => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ token, table, page: String(page), limit: '50' });
      if (searchVal) params.set('search', searchVal);
      if (sortCol) { params.set('orderBy', sortCol); params.set('orderDir', sortDir); }
      const res = await fetch(`/api/admin/db?${params}`);
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
  }, [token, search, orderBy, orderDir]);

  const handleSelectTable = (name: string) => {
    setSelectedTable(name);
    setSearch('');
    setSearchInput('');
    setOrderBy('');
    setOrderDir('desc');
    loadTable(name, 1, '', '', 'desc');
  };

  const handleSearch = () => {
    setSearch(searchInput);
    loadTable(selectedTable, 1, searchInput, orderBy, orderDir);
  };

  const handleSort = (col: string) => {
    const newDir = orderBy === col && orderDir === 'desc' ? 'asc' : 'desc';
    setOrderBy(col);
    setOrderDir(newDir);
    loadTable(selectedTable, 1, search, col, newDir);
  };

  const handlePage = (page: number) => {
    loadTable(selectedTable, page, search, orderBy, orderDir);
  };

  const copyCell = (value: string) => {
    navigator.clipboard.writeText(value);
    setCopied(value);
    setTimeout(() => setCopied(null), 1500);
  };

  const formatCell = (value: unknown): string => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const truncate = (str: string, max = 80) => str.length > max ? str.slice(0, max) + '…' : str;

  if (error && !selectedTable && tables.length === 0) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center space-y-3">
          <Database className="h-12 w-12 text-red-400 mx-auto" />
          <p className="text-red-400 text-lg">{error}</p>
          <p className="text-gray-500 text-sm">Token may be expired. Generate a new one from Settings.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200">
      {/* Header */}
      <div className="border-b border-gray-800 px-4 py-3 flex items-center gap-3">
        {selectedTable ? (
          <button onClick={() => setSelectedTable('')} className="text-gray-400 hover:text-white">
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : (
          <Database className="h-5 w-5 text-emerald-400" />
        )}
        <h1 className="text-lg font-semibold">
          {selectedTable ? (
            <span className="flex items-center gap-2">
              <span className="text-emerald-400">{selectedTable}</span>
              <span className="text-sm text-gray-500 font-normal">({pagination.total} rows)</span>
            </span>
          ) : 'Database Viewer'}
        </h1>
      </div>

      {/* Table list */}
      {!selectedTable && (
        <div className="p-4 max-w-2xl mx-auto space-y-2">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
            </div>
          ) : (
            tables.map(t => (
              <button
                key={t.name}
                onClick={() => handleSelectTable(t.name)}
                className="w-full flex items-center justify-between bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-lg px-4 py-3 transition-colors"
              >
                <span className="font-medium">{t.name}</span>
                <span className="text-sm text-gray-500">{t.count.toLocaleString()} rows</span>
              </button>
            ))
          )}
        </div>
      )}

      {/* Table data */}
      {selectedTable && (
        <div className="flex flex-col h-[calc(100vh-57px)]">
          {/* Search bar */}
          <div className="px-4 py-2 border-b border-gray-800 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <input
                type="text"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="Search across text columns..."
                className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
              />
            </div>
            <button
              onClick={handleSearch}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              Search
            </button>
          </div>

          {/* Data table */}
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-900 border-b border-gray-700">
                  <tr>
                    {columns.map(col => (
                      <th
                        key={col.name}
                        onClick={() => handleSort(col.name)}
                        className="px-3 py-2 text-left font-medium text-gray-400 cursor-pointer hover:text-white whitespace-nowrap select-none"
                      >
                        <span className="flex items-center gap-1">
                          {col.name}
                          {col.pk ? <span className="text-emerald-400 text-[10px]">PK</span> : null}
                          {orderBy === col.name && (
                            <ArrowUpDown className="h-3 w-3 text-emerald-400" />
                          )}
                        </span>
                        <span className="text-[10px] text-gray-600 font-normal">{col.type || 'TEXT'}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length} className="text-center py-8 text-gray-500">
                        No data found
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, i) => (
                      <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                        {columns.map(col => {
                          const raw = formatCell(row[col.name]);
                          const display = truncate(raw);
                          return (
                            <td key={col.name} className="px-3 py-2 whitespace-nowrap max-w-[300px]">
                              <span
                                className="cursor-pointer hover:text-emerald-300 transition-colors"
                                title={raw}
                                onClick={() => copyCell(raw)}
                              >
                                {display}
                                {copied === raw && <Check className="inline h-3 w-3 ml-1 text-emerald-400" />}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="border-t border-gray-800 px-4 py-2 flex items-center justify-between">
              <span className="text-sm text-gray-500">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => handlePage(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="p-1.5 rounded hover:bg-gray-800 disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handlePage(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                  className="p-1.5 rounded hover:bg-gray-800 disabled:opacity-30"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
