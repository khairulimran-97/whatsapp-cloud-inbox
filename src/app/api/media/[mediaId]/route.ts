import { NextResponse } from 'next/server';
import { whatsappClient, PHONE_NUMBER_ID } from '@/lib/whatsapp-client';
import { getDb, schema } from '@/lib/db';
import { sql } from 'drizzle-orm';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  const { mediaId } = await params;
  try {
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
          // Redirect to permanent Kapso URL
          return NextResponse.redirect(md.url, 302);
        }
      }
    } catch {
      // Fall through to SDK download
    }

    // Get metadata for mime type
    const metadata = await whatsappClient.media.get({
      mediaId,
      phoneNumberId: PHONE_NUMBER_ID
    });

    const buffer = await whatsappClient.media.download({
      mediaId,
      phoneNumberId: PHONE_NUMBER_ID,
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
