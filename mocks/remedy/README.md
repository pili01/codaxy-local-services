# Remedy mock

A small stateful mock that stands in for BMC Remedy so the change-ticket flow in
`fndd-idna-portal` can be exercised locally. Unlike the old WireMock setup, this one
doesn't need to know the ticket ID in advance — it accepts whatever ID the portal
actually sends (a GUID in production code) and remembers it, so the full
create → lookup CRQ → sync status pipeline works against the real app without any
code changes.

## Start it

```sh
docker compose up -d --build remedy-mock
```

- API (consumed by the portal): **http://localhost:40230/v1/Remedy/api/...**
- Dashboard (for you, the tester): **http://localhost:40230/**

`RemedyApi:BaseUrl` in `fndd-idna-portal`'s `appsettings.Development.json` should point
at `http://localhost:40230/v1/Remedy/api/` — same port as before, no config changes
needed.

## How it works

Three routes, matching exactly what `RemedyApiClient.cs` calls:

1. **Create** — `POST /v1/Remedy/api/arsys/v1/entry/VZ:API:ChangeInterface_Staging`
   with `{ "values": { "EXT_TicketNumber": "<whatever the portal sends>" } }`.
   Stores a new ticket and returns a generated `Request ID`. Calling this again with
   the same `EXT_TicketNumber` returns the same ticket instead of creating a duplicate
   (so the auto-submit retry logic doesn't spam the list).
2. **Lookup CRQ** — `GET` on the same path with `?q=<contains Request ID>`. The CRQ
   number is assigned immediately on create, so this succeeds on the very next call —
   no waiting, no manual step.
3. **Status sync** — `GET /v1/Remedy/api/arsys/v1/entry/CHG:Infrastructure%20Change?q=<contains CRQ number>`.
   Returns whatever status you've set on the ticket in the dashboard.

There's no scheduler and no fixed scenarios — you drive every outcome by hand from the
dashboard:

- New ticket shows up automatically after the portal's create call, already scheduled
  with a CRQ number — the lookup and status-sync calls both work right away.
- Use the status dropdown to move it through `Scheduled` → `Implementation In Progress`
  → `Completed` (or `Cancelled` / `Rejected for Authorization`) — this is what the
  status-sync job will read back.
- **Delete** removes a row if you want to start a scenario over.

## Storage

Tickets are kept in `data/tickets.csv` (mounted as a Docker volume, so state survives
container restarts). Delete that file — or just the rows in it — to reset everything.

## Local dev (without Docker)

```sh
npm install
npm run dev
```

Runs on http://localhost:8080 instead of 40230.
