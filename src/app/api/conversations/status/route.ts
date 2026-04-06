import { NextResponse } from 'next/server';

export async function PATCH(request: Request) {
  try {
    const { conversationId, status } = await request.json();

    if (!conversationId || !status) {
      return NextResponse.json(
        { error: 'Missing required fields: conversationId, status' },
        { status: 400 }
      );
    }

    if (status !== 'active' && status !== 'ended') {
      return NextResponse.json(
        { error: 'Status must be "active" or "ended"' },
        { status: 400 }
      );
    }

    // Kapso API does not yet support conversation status updates.
    // Return success so the UI can update optimistically.
    return NextResponse.json({ conversationId, status, note: 'local-only' });
  } catch (error: unknown) {
    console.error('Error updating conversation status:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to update conversation status', details: message },
      { status: 500 }
    );
  }
}
