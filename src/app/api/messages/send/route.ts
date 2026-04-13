import { NextResponse } from 'next/server';
import { resolveProfile } from '@/lib/whatsapp-client';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const to = formData.get('to') as string;
    const body = formData.get('body') as string;
    const file = formData.get('file') as File | null;
    const profileId = formData.get('profileId') as string | null;

    if (!to) {
      return NextResponse.json(
        { error: 'Missing required field: to' },
        { status: 400 }
      );
    }

    const { client, profile } = resolveProfile(profileId);
    const phoneNumberId = profile.phoneNumberId;
    let result;

    // Send media message
    if (file) {
      const fileType = file.type.split('/')[0];
      const mediaType = fileType === 'application' ? 'document' : fileType;

      const uploadResult = await client.media.upload({
        phoneNumberId,
        type: mediaType as 'image' | 'video' | 'audio' | 'document',
        file: file,
        fileName: file.name
      });

      if (file.type === 'image/webp') {
        result = await client.messages.sendSticker({
          phoneNumberId,
          to,
          sticker: { id: uploadResult.id }
        });
      } else if (mediaType === 'image') {
        result = await client.messages.sendImage({
          phoneNumberId,
          to,
          image: { id: uploadResult.id, caption: body || undefined }
        });
      } else if (mediaType === 'video') {
        result = await client.messages.sendVideo({
          phoneNumberId,
          to,
          video: { id: uploadResult.id, caption: body || undefined }
        });
      } else if (mediaType === 'audio') {
        result = await client.messages.sendAudio({
          phoneNumberId,
          to,
          audio: { id: uploadResult.id }
        });
      } else {
        result = await client.messages.sendDocument({
          phoneNumberId,
          to,
          document: { id: uploadResult.id, caption: body || undefined, filename: file.name }
        });
      }
    } else if (body) {
      result = await client.messages.sendText({
        phoneNumberId,
        to,
        body
      });
    } else {
      return NextResponse.json(
        { error: 'Either body or file is required' },
        { status: 400 }
      );
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    // Rate limit detection — return 200 with reason so frontend can show a warning
    const isRateLimit =
      (error instanceof Error && /rate.limit/i.test(error.message)) ||
      (error != null && typeof error === 'object' && 'status' in error && (error as { status: number }).status === 429);
    if (isRateLimit) {
      return NextResponse.json({ sent: false, reason: 'rate_limited' });
    }
    console.error('Error sending message:', error);
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    );
  }
}
