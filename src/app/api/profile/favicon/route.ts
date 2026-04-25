import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { resolveProfile } from '@/lib/whatsapp-client';

const CACHE_DIR = path.join(process.cwd(), 'data', 'favicon-cache');
const TTL_MS = 24 * 60 * 60 * 1000;

type Meta = { mime: string; fetchedAt: number; sourceUrl?: string };

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

async function readMeta(id: string): Promise<Meta | null> {
  try {
    const raw = await fs.readFile(path.join(CACHE_DIR, `${id}.json`), 'utf8');
    return JSON.parse(raw) as Meta;
  } catch {
    return null;
  }
}

async function readBytes(id: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(path.join(CACHE_DIR, `${id}.bin`));
  } catch {
    return null;
  }
}

async function writeCache(id: string, bytes: Buffer, mime: string, sourceUrl?: string) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(path.join(CACHE_DIR, `${id}.bin`), bytes);
  const meta: Meta = { mime, fetchedAt: Date.now(), sourceUrl };
  await fs.writeFile(path.join(CACHE_DIR, `${id}.json`), JSON.stringify(meta));
}

async function fetchUpstream(profileIdParam: string | null): Promise<{ bytes: Buffer; mime: string; url: string } | null> {
  const { client, profile } = resolveProfile(profileIdParam);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawClient = client as any;
  const bpRes = await rawClient.request(
    'GET',
    `${profile.phoneNumberId}/whatsapp_business_profile`,
    { query: { fields: 'profile_picture_url' }, responseType: 'json' }
  );
  const url = bpRes?.data?.[0]?.profilePictureUrl as string | undefined;
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  const mime = res.headers.get('content-type') || 'image/jpeg';
  const buf = Buffer.from(await res.arrayBuffer());
  return { bytes: buf, mime, url };
}

function serveBytes(bytes: Buffer, mime: string) {
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    },
  });
}

async function staticFallback(): Promise<NextResponse> {
  try {
    const bytes = await fs.readFile(path.join(process.cwd(), 'public', 'favicon-32.png'));
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const profileIdParam = searchParams.get('profileId');

  let canonicalId: string;
  try {
    const { profile } = resolveProfile(profileIdParam);
    canonicalId = safeId(profile.id);
  } catch {
    return staticFallback();
  }

  const meta = await readMeta(canonicalId);
  const cached = meta ? await readBytes(canonicalId) : null;
  const isFresh = !!(meta && Date.now() - meta.fetchedAt < TTL_MS);

  if (isFresh && cached && meta) {
    return serveBytes(cached, meta.mime);
  }

  try {
    const upstream = await fetchUpstream(profileIdParam);
    if (upstream) {
      await writeCache(canonicalId, upstream.bytes, upstream.mime, upstream.url);
      return serveBytes(upstream.bytes, upstream.mime);
    }
  } catch (e) {
    console.error('[profile/favicon] upstream error:', e);
  }

  if (cached && meta) {
    return serveBytes(cached, meta.mime);
  }

  return staticFallback();
}
