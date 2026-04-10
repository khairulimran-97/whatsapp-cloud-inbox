import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getDb, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';

const DEFAULT_TEMPLATES = [
  {
    title: 'Pengesahan Tiket PPV',
    category: 'Bola Sepak',
    body: 'Assalamualaikum & salam sejahtera 👋\n\nTerima kasih kerana membeli tiket perlawanan. Tiket anda telah disahkan ✅\n\nSila tunjukkan tiket digital di pintu masuk stadium pada hari perlawanan. Jumpa di stadium! ⚽🏟️',
  },
  {
    title: 'Info Perlawanan Akan Datang',
    category: 'Bola Sepak',
    body: 'Salam! ⚽\n\nPerlawanan seterusnya akan berlangsung seperti yang dijadualkan. Pastikan anda hadir awal untuk mengelakkan kesesakan.\n\n🕐 Pintu dibuka 1 jam sebelum kick-off\n📍 Sila semak lokasi stadium\n🎟️ Bawa tiket digital anda\n\nJumpa di sana! 💪',
  },
  {
    title: 'Maklum Balas Pelanggan',
    category: 'Bola Sepak',
    body: 'Terima kasih kerana menghubungi kami! 🙏\n\nKami telah menerima mesej anda dan akan membalas secepat mungkin. Untuk pertanyaan tiket, sila sertakan nombor pesanan anda.\n\nTerima kasih atas sokongan anda! 🔴⚽',
  },
];

function seedDefaults(db: ReturnType<typeof getDb>) {
  const existing = db.select().from(schema.replyTemplates).all();
  if (existing.length > 0) return;
  for (const t of DEFAULT_TEMPLATES) {
    // Avoid duplicates by title
    const dup = existing.find(e => e.title === t.title);
    if (dup) continue;
    db.insert(schema.replyTemplates).values({
      id: crypto.randomUUID(),
      title: t.title,
      category: t.category,
      body: t.body,
      createdAt: new Date(),
    }).run();
  }
}

// GET: list all templates
export async function GET() {
  const db = getDb();
  seedDefaults(db);
  const templates = db.select().from(schema.replyTemplates).all();
  return NextResponse.json({ templates });
}

// POST: add a new template
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { title, category, body: templateBody } = body;

  if (!title?.trim() || !templateBody?.trim()) {
    return NextResponse.json({ error: 'Title and body are required' }, { status: 400 });
  }

  const db = getDb();

  // Avoid duplicate by title
  const existing = db.select().from(schema.replyTemplates).all();
  if (existing.some(t => t.title.toLowerCase() === title.trim().toLowerCase())) {
    return NextResponse.json({ error: 'Template with this title already exists' }, { status: 409 });
  }

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

// PUT: update an existing template
export async function PUT(request: NextRequest) {
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

  // Duplicate title check (exclude self)
  if (title?.trim()) {
    const all = db.select().from(schema.replyTemplates).all();
    if (all.some(t => t.id !== id && t.title.toLowerCase() === title.trim().toLowerCase())) {
      return NextResponse.json({ error: 'Template with this title already exists' }, { status: 409 });
    }
  }

  const updates: Partial<{ title: string; category: string; body: string }> = {};
  if (title?.trim()) updates.title = title.trim();
  if (category?.trim()) updates.category = category.trim();
  if (templateBody?.trim()) updates.body = templateBody.trim();

  db.update(schema.replyTemplates).set(updates).where(eq(schema.replyTemplates.id, id)).run();

  const updated = db.select().from(schema.replyTemplates).where(eq(schema.replyTemplates.id, id)).get();
  return NextResponse.json({ template: updated, message: 'Template updated' });
}

// DELETE: remove a template
export async function DELETE(request: NextRequest) {
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
