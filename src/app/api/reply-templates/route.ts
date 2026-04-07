import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

export type ReplyTemplate = {
  id: string;
  title: string;
  category: string;
  body: string;
  created_at: string;
};

const TEMPLATES_PATH = path.join(process.cwd(), 'data', 'reply-templates.json');

async function readTemplates(): Promise<ReplyTemplate[]> {
  try {
    const raw = await fs.readFile(TEMPLATES_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeTemplates(templates: ReplyTemplate[]) {
  await fs.writeFile(TEMPLATES_PATH, JSON.stringify(templates, null, 2) + '\n', 'utf-8');
}

function verifyAdmin(request: NextRequest): boolean {
  const secret = process.env.APP_PASSWORD;
  if (!secret) return false;
  const provided = request.headers.get('x-app-password');
  return provided === secret;
}

// GET: list all templates (no auth — agents need to read)
export async function GET() {
  const templates = await readTemplates();
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

  const templates = await readTemplates();
  const newTemplate: ReplyTemplate = {
    id: crypto.randomUUID(),
    title: title.trim(),
    category: (category || 'General').trim(),
    body: templateBody.trim(),
    created_at: new Date().toISOString(),
  };

  templates.push(newTemplate);
  await writeTemplates(templates);

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

  const templates = await readTemplates();
  const index = templates.findIndex((t) => t.id === id);
  if (index === -1) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  if (title?.trim()) templates[index].title = title.trim();
  if (category?.trim()) templates[index].category = category.trim();
  if (templateBody?.trim()) templates[index].body = templateBody.trim();

  await writeTemplates(templates);

  return NextResponse.json({ template: templates[index], message: 'Template updated' });
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

  const templates = await readTemplates();
  const filtered = templates.filter((t) => t.id !== id);

  if (filtered.length === templates.length) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  await writeTemplates(filtered);

  return NextResponse.json({ message: 'Template deleted' });
}
