import { NextResponse } from 'next/server';
import { resolveProfile } from '@/lib/whatsapp-client';
import { getDb, schema } from '@/lib/db';
import { sql } from 'drizzle-orm';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  const { mediaId } = await params;
  try {
    const { searchParams } = new URL(request.url);
    const profileId = searchParams.get('profileId');
    const { client, profile } = resolveProfile(profileId);

    // First check if we have a Kapso direct URL cached in SQLite
    try {
      const db = getDb();
      const row = db.select({ mediaDataJson: schema.messages.mediaDataJson })
        .from(schema.messages)
        .where(sql`json_extract(metadata_json, '$.mediaId') = ${mediaId}`)
        .get();
      if (row?.mediaDataJson) {
        const md = JSON.parse(row.mediaDataJson);
        if (md.url && !md.url.startsWith('/api/')) {
          return NextResponse.redirect(md.url, 302);
        }
      }
    } catch {
      // Fall through to SDK download
    }

    const metadata = await client.media.get({
      mediaId,
      phoneNumberId: profile.phoneNumberId
    });

    const buffer = await client.media.download({
      mediaId,
      phoneNumberId: profile.phoneNumberId,
    });

    // If buffer is a Response, clone and add cache headers
    if (buffer instanceof Response) {
      const cloned = new NextResponse(buffer.body, {
        status: buffer.status,
        headers: {
          ...Object.fromEntries(buffer.headers.entries()),
          'Cache-Control': 'public, max-age=604800, immutable',
        },
      });
      return cloned;
    }

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': metadata.mimeType || 'application/octet-stream',
        'Cache-Control': 'public, max-age=604800, immutable',
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch media',
        details: error instanceof Error ? error.message : 'Unknown error',
        mediaId
      },
      { status: 500 }
    );
  }
}
