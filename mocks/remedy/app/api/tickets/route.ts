import { NextResponse } from 'next/server';
import { readAll } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const tickets = await readAll();
  return NextResponse.json(tickets);
}
