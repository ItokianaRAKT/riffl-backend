# Riffl Backend

HTTP API for **Riffl**, an app for reviewing a music folder track by track and sorting it into three decisions: **keep**, **skip**, or **delete**.

The backend scans folders, streams audio files, moves files according to decisions, and reads/writes audio metadata (title and artist). It is consumed by the `riffl-frontend` app, which lives in a separate repository.

## Features

- Recursive folder scanning with audio tag extraction.
- Subdirectory listing used by the frontend folder browser.
- Audio streaming with HTTP `Range` support (seeking).
- File sorting: each decision moves the file into a `riffl/<action>/` subfolder of its own directory.
- Undo for the last move.
- Tag update and file rename for the current track.
- Structured error responses with stable error codes.

## Tech stack

- [Express 5](https://expressjs.com) on Node.js, written in TypeScript (run directly with [tsx](https://tsx.is))
- [node-taglib-sharp](https://github.com/evan-wagner/node-taglib-sharp) for audio tags
- Tests: built-in `node:test` + [Supertest](https://github.com/ladjs/supertest)
- Linting: ESLint + `typescript-eslint`

## Prerequisites

- [Git](https://git-scm.com) — to clone the repository
- [Node.js](https://nodejs.org) 20+ — installing it also gives you `npm` (CI runs on Node 24)

## Getting started

```bash
# 1. Clone the repository (skip if you already have it)
git clone https://github.com/ItokianaRAKT/riffl-backend.git

# 2. Enter the project folder
cd riffl-backend

# 3. Download the dependencies (only the first time)
npm install

# 4. Start the server
npm run dev
```

The server is now running at `http://localhost:3000` — keep that terminal open. From there, follow the [frontend README](https://github.com/ItokianaRAKT/riffl-frontend) to start the UI.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the server with hot reload |
| `npm test` | Run the test suite |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Type-check with `tsc --noEmit` |

## API

All bodies are JSON.

### `GET /health`

```json
{ "status": "ok", "service": "riffl" }
```

### `GET /files/scan?path=<absolute path>`

Recursively scans a directory and returns the audio files it contains. Symlinks and any `riffl/` directory are ignored.

```json
{
  "rootPath": "/music",
  "scannedAt": "2026-10-04T12:00:00.000Z",
  "totalFiles": 2,
  "totalSize": 10485760,
  "files": [
    {
      "path": "/music/artist/song.mp3",
      "relativePath": "artist/song.mp3",
      "name": "song.mp3",
      "title": "Song",
      "artist": "Artist",
      "extension": "mp3",
      "size": 5242880,
      "modifiedAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

`title` falls back to the file name when the tag is missing. Errors: `PATH_MISSING` (400), `PATH_NOT_FOUND` (404), `PATH_NOT_DIRECTORY` (422), `PATH_NOT_ACCESSIBLE` (403), `PATH_READ_ERROR` (500).

### `GET /files/directories?path=<absolute path>`

Lists the subdirectories of a folder, so the UI can browse the filesystem instead of asking for a typed path. Hidden folders (starting with a dot), files, and symlinks are omitted, and the result is sorted case-insensitively. When `path` is omitted, the server's home directory is used.

```json
{
  "path": "/home/you",
  "parent": "/home",
  "directories": [
    { "name": "Music", "path": "/home/you/Music" },
    { "name": "Videos", "path": "/home/you/Videos" }
  ]
}
```

`parent` is `null` at the filesystem root. Errors are the same as `/files/scan`.

### `GET /stream?path=<absolute path>`

Streams the file with a `Content-Type` derived from its extension: `audio/mpeg` (`.mp3`), `audio/mp4` (`.mp4`), `audio/wav` (`.wav`), `audio/ogg` (`.ogg`), `audio/flac` (`.flac`), `application/octet-stream` otherwise.

`Range` requests are supported: `206 Partial Content` for a satisfiable range (bounded, open ended, or suffix like `bytes=-50`), `416` when the range starts past the end of the file. A `Range` header the server cannot parse is ignored and the whole file is sent.

Errors: `PATH_MISSING` (400), `FILE_NOT_FOUND` (404), `NOT_A_FILE` (404), `RANGE_NOT_SATISFIABLE` (416).

### `POST /action`

Moves the file according to the decision.

```json
{ "path": "/music/artist/song.mp3", "action": "keep" }
```

`action` is one of `keep`, `skip`, `delete`. The file is moved to `<file directory>/riffl/<action>/<file name>` (the folder is created if needed).

```json
{ "success": true, "action": "keep", "path": "/music/artist/song.mp3" }
```

Errors: 400 for a missing path or an invalid action, 500 if the move fails.

### `POST /action/undo`

Restores the file moved by the previous `/action` call.

```json
{ "success": true, "path": "/music/artist/song.mp3", "action": "keep", "remaining": 0 }
```

Errors: 400 `NOTHING_TO_UNDO` when there is no history, 500 if the restore fails.

> Undo history is kept in memory and is lost when the server restarts.

### `POST /action/rename`

Writes the title (and optionally the artist) to the audio tags, then renames the file to `<title><original extension>`.

```json
{ "path": "/music/artist/song.mp3", "title": "Night Drive", "artist": "Daft Punk" }
```

```json
{
  "success": true,
  "path": "/music/artist/Night Drive.mp3",
  "previousPath": "/music/artist/song.mp3",
  "title": "Night Drive",
  "artist": "Daft Punk"
}
```

`artist` is optional; when omitted, the existing artist tag is preserved. The extension cannot be changed.

| Code | Status | Meaning |
| --- | --- | --- |
| `PATH_MISSING` | 400 | Missing or empty `path` |
| `TITLE_MISSING` / `TITLE_INVALID` / `TITLE_TOO_LONG` | 400 | Invalid title (empty, forbidden characters, or too long for a file name) |
| `ARTIST_INVALID` | 400 | `artist` provided but not a non-empty string |
| `EXTENSION_NOT_ALLOWED` | 400 | Attempt to change the extension |
| `FILE_NOT_FOUND` | 404 | Path does not exist or is not a file |
| `TRACK_ALREADY_SORTED` | 409 | File already lives under `riffl/<action>/` |
| `NAME_CONFLICT` | 409 | A file already exists at the destination |
| `TAG_WRITE_FAILED` | 422 | Tags could not be written |
| `RENAME_FAILED` | 500 | File could not be renamed |

## Supported formats

`.mp3`, `.mp4`, `.wav`, `.ogg`, `.flac` — used for scanning, streaming, tag reading, and renaming.

## Project structure

```
src/
├── app.ts                 # Express app and route mounting
├── server.ts              # Entry point (port)
├── routes/                # HTTP layer: validation, status codes, responses
├── services/              # Business logic: scan, stream, move/undo, rename, tags
└── fixtures/              # Audio files used by the tests
```

## Testing

```bash
npm test        # unit + route tests (49 tests)
npm run lint
npm run typecheck
```

The same checks run in CI (GitHub Actions) on every push and pull request to `main`.
