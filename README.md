# codaxy-local-services

Local dev support services for `fndd-idna-portal` / `fndd-idna-engine` — things the
portal talks to that aren't practical to run for real on a dev machine.

## Services

```sh
docker compose up -d --build
```

- **remedy-mock** (`mocks/remedy/`) — stands in for BMC Remedy so the change-ticket
  flow can be exercised without a real Remedy connection. See
  [`mocks/remedy/README.md`](mocks/remedy/README.md) for how it works and how to drive
  tickets through different statuses from its dashboard at http://localhost:40230/.
- **smtp4dev** — catches outgoing emails from the portal in dev instead of sending them
  for real. UI at http://localhost:5005.

## smtp4dev and TLS

`smtp4dev` runs without TLS (`TlsMode: None`), so no certificate is needed. The portal's
`appsettings.Development.json` sets `Smtp:UseTls` to `false` to match. Never set that in
a deployed environment — `UseTls` defaults to `true` (STARTTLS).
