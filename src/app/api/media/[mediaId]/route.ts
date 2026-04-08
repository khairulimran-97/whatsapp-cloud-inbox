import { NextResponse } from 'next/server';
import { whatsappClient, PHONE_NUMBER_ID } from '@/lib/whatsapp-client';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  const { mediaId } = await params;
  try {
    // Get metadata for mime type
    const metadata = await whatsappClient.media.get({
      mediaId,
      phoneNumberId: PHONE_NUMBER_ID
    });

    const buffer = await whatsappClient.media.download({
      mediaId,
      phoneNumberId: PHONE_NUMBER_ID,
      auth: 'never' // Force no auth headers for CDN
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
