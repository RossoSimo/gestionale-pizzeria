# Sync Contract

## Envelope

- clientId: identificativo del client locale (UUID/CUID).
- entity: nome tabella logica (`orders`, `products`, ...).
- operation: `CREATE` | `UPDATE` | `DELETE`.
- payload: contenuto dell'entita o patch parziale.
- version: versione locale dell'entita.
- timestamp: data evento locale ISO 8601.

## Push (`POST /<entity>/sync/up`)

Request:

```json
{
  "clientId": "device-pos-01",
  "mutations": [
    {
      "entity": "orders",
      "operation": "UPDATE",
      "payload": { "id": "...", "status": "PRONTO" },
      "version": 7,
      "timestamp": "2026-03-27T11:20:00.000Z"
    }
  ]
}
```

Response:

```json
{
  "ok": true,
  "entity": "orders",
  "accepted": 1,
  "clientId": "device-pos-01",
  "receivedAt": "2026-03-27T11:20:01.000Z"
}
```

## Pull (`GET /<entity>/sync/down?since=...`)

Response:

```json
{
  "ok": true,
  "entity": "orders",
  "since": "2026-03-27T10:00:00.000Z",
  "mutations": [],
  "serverTime": "2026-03-27T11:20:01.000Z"
}
```

## Conflict strategy

- Default: optimistic concurrency con `version`.
- Se `incoming.version` <= `stored.version`: mutation rifiutata con codice `CONFLICT`.
- Per conflitti complessi: mantenere record server e restituire payload completo per merge client-side.
