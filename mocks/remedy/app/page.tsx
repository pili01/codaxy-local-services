'use client';

import { useCallback, useEffect, useState } from 'react';

type Ticket = {
  requestId: string;
  extTicketNumber: string;
  crqNumber: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: string;
  statusReason: string;
  actualStart: string;
  actualStop: string;
  createdAt: string;
  updatedAt: string;
};

const STATUS_OPTIONS = [
  'Request For Authorzation',
  'Request For Change',
  'Planning in Progress',
  'Scheduled For Review',
  'Scheduled For Approval',
  'Scheduled',
  'Implementation in Progress',
  'Completed',
  'Closed',
  'Cancelled',
];

export default function Home() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch('/api/tickets', { cache: 'no-store' });
    const data = await res.json();
    setTickets(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  async function setStatus(requestId: string, status: string) {
    await fetch(`/api/tickets/${requestId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setStatus', status }),
    });
    load();
  }

  async function setCompletionOutcome(requestId: string, status: string, reason: string) {
    await fetch(`/api/tickets/${requestId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setStatus', status, reason }),
    });
    load();
  }

  async function removeTicket(requestId: string) {
    await fetch(`/api/tickets/${requestId}`, { method: 'DELETE' });
    load();
  }

  return (
    <main style={{ fontFamily: 'sans-serif', padding: 24, color: '#111' }}>
      <h1>Remedy mock — change tickets</h1>
      <p>
        A ticket shows up here as soon as the portal sends a Create request (any ticket
        GUID works — nothing hardcoded), with a CRQ number already assigned so the
        portal&apos;s CRQ-lookup call succeeds right away. Use the status dropdown to
        drive the nightly status-sync job through different outcomes.
      </p>
      <button onClick={load} disabled={loading}>
        Refresh
      </button>
      <table
        border={1}
        cellPadding={6}
        style={{ borderCollapse: 'collapse', marginTop: 16, width: '100%' }}
      >
        <thead>
          <tr>
            <th>Ticket GUID (EXT_TicketNumber)</th>
            <th>Request ID</th>
            <th>CRQ number</th>
            <th>Scheduled start</th>
            <th>Scheduled end</th>
            <th>Status</th>
            <th>Status reason</th>
            <th>Actual start</th>
            <th>Actual stop</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => (
            <tr key={t.requestId}>
              <td>{t.extTicketNumber}</td>
              <td>{t.requestId}</td>
              <td>{t.crqNumber || '—'}</td>
              <td>{t.scheduledStart}</td>
              <td>{t.scheduledEnd}</td>
              <td>{t.status}</td>
              <td>{t.statusReason}</td>
              <td>{t.actualStart || '—'}</td>
              <td>{t.actualStop || '—'}</td>
              <td>{t.createdAt}</td>
              <td>
                <select
                  value={STATUS_OPTIONS.includes(t.status) ? t.status : ''}
                  onChange={(e) => setStatus(t.requestId, e.target.value)}
                >
                  <option value="" disabled>
                    Set status…
                  </option>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>{' '}
                {(t.status === 'Completed' || t.status === 'Closed') && (
                  <select
                    value={t.statusReason === 'Unsuccessful' ? 'Unsuccessful' : 'Successful'}
                    onChange={(e) => setCompletionOutcome(t.requestId, t.status, e.target.value)}
                  >
                    <option value="Successful">Successful</option>
                    <option value="Unsuccessful">Unsuccessful</option>
                  </select>
                )}{' '}
                <button onClick={() => removeTicket(t.requestId)}>Delete</button>
              </td>
            </tr>
          ))}
          {tickets.length === 0 && (
            <tr>
              <td colSpan={11}>No tickets yet. Create one from the portal.</td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
