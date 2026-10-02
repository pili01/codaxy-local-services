import { NextRequest, NextResponse } from 'next/server';
import { deleteTicket, updateStatus } from '@/lib/store';

export async function PATCH(req: NextRequest, { params }: { params: { requestId: string } }) {
  const body = await req.json().catch(() => ({}));

  if (body.action === 'setStatus' && typeof body.status === 'string') {
    const reason = typeof body.reason === 'string' ? body.reason : undefined;
    try {
      const ticket = await updateStatus(params.requestId, body.status, reason);
      return NextResponse.json(ticket);
    } catch {
      return NextResponse.json({ error: 'ticket not found' }, { status: 404 });
    }
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}

export async function DELETE(_req: NextRequest, { params }: { params: { requestId: string } }) {
  await deleteTicket(params.requestId);
  return NextResponse.json({ ok: true });
}
