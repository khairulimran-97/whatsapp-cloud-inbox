import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { password } = await request.json();
  const correct = process.env.APP_PASSWORD || 'Webimpian1111';

  if (password === correct) {
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: false, error: 'Wrong password' }, { status: 401 });
}
