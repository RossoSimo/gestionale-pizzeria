# Folder Structure

## gestionale-electron

- electron/
  - main.cjs
  - preload.cjs
  - ipc/
    - channels.cjs
    - handlers/
  - db/
    - client.cjs
    - repositories/
  - services/
- src/
  - app/
  - pages/
  - components/
  - features/
  - services/ipc/
  - lib/
  - types/
- shared/
  - constants/
  - contracts/
- prisma/
- docs/architecture/

## Responsibilities

- src/: solo UI React e chiamate IPC.
- electron/: logica applicativa locale, DB SQLite e orchestrazione sync.
- shared/: costanti e contratti usati da renderer e main.
