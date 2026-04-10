import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { validateDbToken } from '@/lib/db-token';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const token = searchParams.get('token');

  if (!token || !validateDbToken(token)) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  const table = searchParams.get('table');
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 50));
  const search = searchParams.get('search') || '';
  const orderBy = searchParams.get('orderBy') || '';
  const orderDir = searchParams.get('orderDir') === 'asc' ? 'ASC' : 'DESC';

  const db = getDb();
  const rawDb = (db as unknown as { session: { client: import('better-sqlite3').Database } }).session.client;

  // Discover all user tables dynamically
  const allTables = (rawDb.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__%' ORDER BY name`
  ).all() as { name: string }[]).map(r => r.name);

  // List tables with row counts
  if (!table) {
    const tables = allTables.map(name => {
      try {
        const row = rawDb.prepare(`SELECT COUNT(*) as count FROM "${name}"`).get() as { count: number };
        return { name, count: row.count };
      } catch {
        return { name, count: 0 };
      }
    });
    return NextResponse.json({ tables });
  }

  if (!allTables.includes(table)) {
    return NextResponse.json({ error: 'Table not found' }, { status: 400 });
  }

  // Get column info
  const columns = rawDb.prepare(`PRAGMA table_info(${table})`).all() as { name: string; type: string; pk: number }[];
  const colNames = columns.map(c => c.name);

  // Build query with optional search
  let whereClause = '';
  const params: Record<string, string> = {};
  if (search) {
    const textCols = columns.filter(c => c.type.includes('TEXT') || c.type === '');
    if (textCols.length > 0) {
      whereClause = 'WHERE ' + textCols.map(c => `${c.name} LIKE @search`).join(' OR ');
      params.search = `%${search}%`;
    }
  }

  // Count
  const countRow = rawDb.prepare(`SELECT COUNT(*) as total FROM ${table} ${whereClause}`).get(params) as { total: number };
  const total = countRow.total;
  const totalPages = Math.ceil(total / limit);
  const offset = (page - 1) * limit;

  // Order
  const orderCol = orderBy && colNames.includes(orderBy) ? orderBy : colNames[0];
  const orderClause = `ORDER BY ${orderCol} ${orderDir}`;

  // Fetch rows
  const rows = rawDb.prepare(`SELECT * FROM ${table} ${whereClause} ${orderClause} LIMIT @limit OFFSET @offset`).all({ ...params, limit, offset });

  return NextResponse.json({
    table,
    columns: columns.map(c => ({ name: c.name, type: c.type, pk: c.pk })),
    rows,
    pagination: { page, limit, total, totalPages },
  });
}
