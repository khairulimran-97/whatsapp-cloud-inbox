import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { ppvSchedules } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

// GET - list all schedules
export async function GET() {
  try {
    const db = getDb();
    const rows = db.select().from(ppvSchedules).orderBy(desc(ppvSchedules.matchDatetime)).all();
    return NextResponse.json({ schedules: rows });
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
