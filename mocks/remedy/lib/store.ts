import { promises as fs } from 'fs';
import path from 'path';

export type ChangeStatus =
  | 'Scheduled'
  | 'Implementation In Progress'
  | 'Completed'
  | 'Cancelled'
  | 'Rejected for Authorization';

export interface Ticket {
  requestId: string;
  extTicketNumber: string;
  crqNumber: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: ChangeStatus;
  statusReason: string;
  actualStart: string;
  actualStop: string;
  createdAt: string;
  updatedAt: string;
}

const COLUMNS: (keyof Ticket)[] = [
  'requestId',
  'extTicketNumber',
  'crqNumber',
  'scheduledStart',
  'scheduledEnd',
  'status',
  'statusReason',
  'actualStart',
  'actualStop',
  'createdAt',
  'updatedAt',
];

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'tickets.csv');

export const STATUS_OPTIONS: ChangeStatus[] = [
  'Scheduled',
  'Implementation In Progress',
  'Completed',
  'Cancelled',
  'Rejected for Authorization',
];

const STATUS_REASON_DEFAULTS: Record<string, string> = {
  Scheduled: 'Awaiting implementation window',
  'Implementation In Progress': 'Work in progress',
  Completed: 'Successful',
  Cancelled: 'Cancelled by requester',
  'Rejected for Authorization': 'CAB rejected the change',
};

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function csvSplitLine(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

async function ensureFile(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, COLUMNS.join(',') + '\n', 'utf8');
  }
}

async function readAllRaw(): Promise<Ticket[]> {
  await ensureFile();
  const content = await fs.readFile(DATA_FILE, 'utf8');
  const lines = content.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length <= 1) return [];
  return lines.slice(1).map((line) => {
    const fields = csvSplitLine(line);
    const record = {} as Ticket;
    COLUMNS.forEach((col, i) => {
      (record as unknown as Record<string, string>)[col] = fields[i] ?? '';
    });
    return record;
  });
}

async function writeAllRaw(tickets: Ticket[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const lines = [COLUMNS.join(',')];
  for (const t of tickets) {
    lines.push(COLUMNS.map((col) => csvEscape(String(t[col] ?? ''))).join(','));
  }
  await fs.writeFile(DATA_FILE, lines.join('\n') + '\n', 'utf8');
}

// Serializes all reads/writes so concurrent requests from the portal don't race on the CSV file.
let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function makeRequestId(tickets: Ticket[]): string {
  return `MOCK-REQ-${String(tickets.length + 1).padStart(6, '0')}`;
}

function makeCrqNumber(tickets: Ticket[]): string {
  const assignedCount = tickets.filter((t) => t.crqNumber).length;
  return `VZCR${String(600000 + assignedCount + 1).padStart(11, '0')}`;
}

export function readAll(): Promise<Ticket[]> {
  return serialize(readAllRaw);
}

export function createTicket(extTicketNumber: string): Promise<Ticket> {
  return serialize(async () => {
    const tickets = await readAllRaw();
    const existing = tickets.find((t) => t.extTicketNumber === extTicketNumber);
    if (existing) return existing;

    const now = new Date();
    const scheduledStart = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const scheduledEnd = new Date(scheduledStart.getTime() + 15 * 60 * 1000);
    const ticket: Ticket = {
      requestId: makeRequestId(tickets),
      extTicketNumber,
      crqNumber: makeCrqNumber(tickets),
      scheduledStart: scheduledStart.toISOString(),
      scheduledEnd: scheduledEnd.toISOString(),
      status: 'Scheduled',
      statusReason: STATUS_REASON_DEFAULTS.Scheduled,
      actualStart: '',
      actualStop: '',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    tickets.push(ticket);
    await writeAllRaw(tickets);
    return ticket;
  });
}

export function findByRequestIdSubstring(q: string): Promise<Ticket | undefined> {
  return serialize(async () => {
    const tickets = await readAllRaw();
    return tickets.find((t) => q.includes(t.requestId));
  });
}

export function findByCrqSubstring(q: string): Promise<Ticket | undefined> {
  return serialize(async () => {
    const tickets = await readAllRaw();
    return tickets.find((t) => t.crqNumber && q.includes(t.crqNumber));
  });
}

export function updateStatus(requestId: string, status: string): Promise<Ticket> {
  return serialize(async () => {
    const tickets = await readAllRaw();
    const ticket = tickets.find((t) => t.requestId === requestId);
    if (!ticket) throw new Error('ticket not found');

    ticket.status = status as ChangeStatus;
    ticket.statusReason = STATUS_REASON_DEFAULTS[status] ?? ticket.statusReason;
    const now = new Date().toISOString();
    if (status === 'Implementation In Progress' && !ticket.actualStart) {
      ticket.actualStart = now;
    }
    if (status === 'Completed') {
      if (!ticket.actualStart) ticket.actualStart = now;
      if (!ticket.actualStop) ticket.actualStop = now;
    }
    ticket.updatedAt = now;
    await writeAllRaw(tickets);
    return ticket;
  });
}

export function deleteTicket(requestId: string): Promise<void> {
  return serialize(async () => {
    const tickets = await readAllRaw();
    const remaining = tickets.filter((t) => t.requestId !== requestId);
    await writeAllRaw(remaining);
  });
}
