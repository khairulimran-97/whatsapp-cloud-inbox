import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { ppvSchedules } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// GET - list schedules with server-side tab filtering + pagination
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tab = searchParams.get('tab'); // active, schedule, completed
    const limit = parseInt(searchParams.get('limit') || '0') || 0;
    const offset = parseInt(searchParams.get('offset') || '0') || 0;

    const db = getDb();
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

    // Always compute counts + categories for all tabs (lightweight)
    const allRows = db.select().from(ppvSchedules).all();
    const scheduleAll = allRows.filter(r => !['completed', 'cancelled'].includes(r.status));
    const completedAll = allRows.filter(r => ['completed', 'cancelled'].includes(r.status));

    // Active = today's matches or next upcoming day (same logic as client)
    const todayEnd = new Date(todayStart.getTime() + 86400000);
    const todayMatches = scheduleAll.filter(r => {
      const dt = new Date(r.matchDatetime);
      return dt >= todayStart && dt < todayEnd;
    });
    const hasTodayMatches = todayMatches.length > 0;
    let activeAll: typeof allRows;
    if (hasTodayMatches) {
      activeAll = todayMatches;
    } else {
      const nextDate = scheduleAll
        .filter(r => new Date(r.matchDatetime) >= todayEnd)
        .map(r => { const d = new Date(r.matchDatetime); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); })
        .sort((a, b) => a - b)[0];
      activeAll = nextDate
        ? scheduleAll.filter(r => { const t = new Date(r.matchDatetime).getTime(); return t >= nextDate && t < nextDate + 86400000; })
        : [];
    }

    const counts = {
      active: activeAll.length,
      schedule: scheduleAll.length,
      completed: completedAll.length,
    };
    const activeLabel = hasTodayMatches ? 'Today' : 'Upcoming';
    const allCategories = [...new Set(allRows.map(r => r.category))].filter(Boolean);

    // Get filtered rows for the requested tab
    let rows: typeof allRows;
    if (tab === 'active') {
      rows = activeAll.sort((a, b) => new Date(a.matchDatetime).getTime() - new Date(b.matchDatetime).getTime());
    } else if (tab === 'completed') {
      rows = completedAll.sort((a, b) => new Date(b.matchDatetime).getTime() - new Date(a.matchDatetime).getTime());
    } else if (tab === 'schedule') {
      rows = scheduleAll.sort((a, b) => new Date(a.matchDatetime).getTime() - new Date(b.matchDatetime).getTime());
    } else {
      rows = allRows;
    }

    const total = rows.length;
    const sliced = limit > 0 ? rows.slice(offset, offset + limit) : rows;

    return NextResponse.json({ schedules: sliced, total, counts, activeLabel, allCategories });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// POST - create schedule
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { matchDatetime, matchDetails, category, status, bclAccount, pic, remark } = body;
    if (!matchDatetime || !matchDetails) {
      return NextResponse.json({ error: 'matchDatetime and matchDetails are required' }, { status: 400 });
    }
    const id = `ppv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const db = getDb();
    db.insert(ppvSchedules).values({
      id,
      matchDatetime: new Date(matchDatetime),
      matchDetails,
      category: category || 'Liga Super',
      status: status || 'upcoming',
      bclAccount: bclAccount || '',
      pic: pic || '',
      remark: remark || '',
    }).run();
    return NextResponse.json({ success: true, id });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// PUT - update schedule
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, matchDatetime, matchDetails, category, status, bclAccount, pic, remark } = body;
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }
    const db = getDb();
    db.update(ppvSchedules).set({
      ...(matchDatetime && { matchDatetime: new Date(matchDatetime) }),
      ...(matchDetails && { matchDetails }),
      ...(category && { category }),
      ...(status && { status }),
      ...(bclAccount !== undefined && { bclAccount }),
      ...(pic !== undefined && { pic }),
      ...(remark !== undefined && { remark }),
      updatedAt: new Date(),
    }).where(eq(ppvSchedules.id, id)).run();
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// DELETE - delete schedule
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }
    const db = getDb();
    db.delete(ppvSchedules).where(eq(ppvSchedules.id, id)).run();
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
