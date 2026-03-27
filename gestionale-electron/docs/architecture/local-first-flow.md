# Local-First Flow

1. Renderer invia comando via IPC al main process.
2. Main process salva su SQLite locale.
3. Main process restituisce risultato al renderer.
4. Sync service mette in coda evento per API cloud.
5. Worker di sync tenta invio in background con retry.
