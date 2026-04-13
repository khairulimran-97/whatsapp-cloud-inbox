import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    webhookSecret: process.env.KAPSO_WEBHOOK_SECRET || '',
  });
}
