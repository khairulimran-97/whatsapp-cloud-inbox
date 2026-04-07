import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getDb, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';

function verifyAdmin(request: NextRequest): boolean {
  const secret = process.env.APP_PASSWORD;
  if (!secret) return false;
  const provided = request.headers.get('x-app-password');
  return provided === secret;
}

// GET: list all templates (no auth — agents need to read)
export async function GET() {
  const db = getDb();
  const templates = db.select().from(schema.replyTemplates).all();
  return NextResponse.json({ templates });
}

// POST: add a new template (auth required)
export async function POST(request: NextRequest) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { title, category, body: templateBody } = body;

  if (!title?.trim() || !templateBody?.trim()) {
    return NextResponse.json({ error: 'Title and body are required' }, { status: 400 });
  }

  const db = getDb();
  const newTemplate = {
    id: crypto.randomUUID(),
    title: title.trim(),
    category: (category || 'General').trim(),
    body: templateBody.trim(),
    createdAt: new Date(),
  };

  db.insert(schema.replyTemplates).values(newTemplate).run();

  return NextResponse.json({ template: newTemplate, message: 'Template created' });
}

// PUT: update an existing template (auth required)
export async function PUT(request: NextRequest) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { id, title, category, body: templateBody } = body;

  if (!id) {
    return NextResponse.json({ error: 'Template ID is required' }, { status: 400 });
  }

  const db = getDb();
  const existing = db.select().from(schema.replyTemplates).where(eq(schema.replyTemplates.id, id)).get();
  if (!existing) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  const updates: Partial<{ title: string; category: string; body: string }> = {};
  if (title?.trim()) updates.title = title.trim();
  if (category?.trim()) updates.category = category.trim();
  if (templateBody?.trim()) updates.body = templateBody.trim();

  db.update(schema.replyTemplates).set(updates).where(eq(schema.replyTemplates.id, id)).run();

  const updated = db.select().from(schema.replyTemplates).where(eq(schema.replyTemplates.id, id)).get();
  return NextResponse.json({ template: updated, message: 'Template updated' });
}

// DELETE: remove a template (auth required)
export async function DELETE(request: NextRequest) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Template ID is required' }, { status: 400 });
  }

  const db = getDb();
  const existing = db.select().from(schema.replyTemplates).where(eq(schema.replyTemplates.id, id)).get();
  if (!existing) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  db.delete(schema.replyTemplates).where(eq(schema.replyTemplates.id, id)).run();

  return NextResponse.json({ message: 'Template deleted' });
}
