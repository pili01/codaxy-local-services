import { NextRequest, NextResponse } from 'next/server';
import { createTicket, findByCrqSubstring, findByRequestIdSubstring } from '@/lib/store';

const STAGING_ENTRY = 'VZ:API:ChangeInterface_Staging';
const CHANGE_ENTRY = 'CHG:Infrastructure Change';

function decodeEntry(entry: string[]): string {
  try {
    return decodeURIComponent(entry.join('/'));
  } catch {
    return entry.join('/');
  }
}

// Create: POST .../entry/VZ:API:ChangeInterface_Staging with { values: { EXT_TicketNumber } }
export async function POST(req: NextRequest, { params }: { params: { entry: string[] } }) {
  const entryPath = decodeEntry(params.entry);
  if (entryPath !== STAGING_ENTRY) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const extTicketNumber = body?.values?.EXT_TicketNumber;
  if (!extTicketNumber || typeof extTicketNumber !== 'string') {
    return NextResponse.json({ error: 'values.EXT_TicketNumber is required' }, { status: 400 });
  }
  const requestedStart = body?.values?.EXT_RequestedStartDate;
  const requestedEnd = body?.values?.EXT_RequestedEndDate;

  const ticket = await createTicket(
    extTicketNumber,
    typeof requestedStart === 'string' ? requestedStart : undefined,
    typeof requestedEnd === 'string' ? requestedEnd : undefined,
  );
  return NextResponse.json({
    values: {
      'Request ID': ticket.requestId,
      'VZ_Return Code': 'Success',
      'VZ_Return Status': null,
      'VZ_Return Message': 'Mock: change request created.',
    },
  });
}

// Lookup CRQ: GET .../entry/VZ:API:ChangeInterface_Staging?q=<contains Request ID>
// Status sync: GET .../entry/CHG:Infrastructure%20Change?q=<contains CRQ number>
export async function GET(req: NextRequest, { params }: { params: { entry: string[] } }) {
  const entryPath = decodeEntry(params.entry);
  const q = req.nextUrl.searchParams.get('q') ?? '';

  if (entryPath === STAGING_ENTRY) {
    const ticket = await findByRequestIdSubstring(q);
    if (!ticket || !ticket.crqNumber) {
      return NextResponse.json({ entries: [], numMatches: null });
    }
    return NextResponse.json({
      entries: [
        {
          values: {
            VZ_TicketNumber: ticket.crqNumber,
            'VZ_Return Code': 'Success',
            'VZ_Return Status': null,
            'VZ_Return Message': 'Mock: request processed.',
          },
        },
      ],
      numMatches: null,
    });
  }

  if (entryPath === CHANGE_ENTRY) {
    const ticket = await findByCrqSubstring(q);
    if (!ticket) {
      return NextResponse.json({ entries: [], numMatches: null });
    }
    return NextResponse.json({
      entries: [
        {
          values: {
            'Infrastructure Change ID': ticket.crqNumber,
            Description: `Mock change request for ${ticket.extTicketNumber}`,
            'Scheduled Start Date': ticket.scheduledStart,
            'Scheduled End Date': ticket.scheduledEnd,
            'Actual SAF Start Time': ticket.actualStart || null,
            'Actual SAF Stop Time': ticket.actualStop || null,
            'Change Request Status': ticket.status,
            'Status Reason': ticket.statusReason,
            'Last Modified Date': ticket.updatedAt,
          },
        },
      ],
      numMatches: null,
    });
  }

  return NextResponse.json({ error: 'not found' }, { status: 404 });
}
