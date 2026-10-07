# Riffl Backend

HTTP API for **Riffl**, an app for reviewing a music folder track by track and sorting it into three decisions: **keep**, **skip**, or **delete**.

## Features

- Recursive folder scanning with audio tag extraction
- Audio streaming with HTTP `Range` support (seeking)
- File sorting into `riffl/<action>/` subfolders
- Undo for the last move
- Tag update and file rename for the current track
- Structured error responses with stable error codes

## Tech Stack

- Express 5 on Node.js, written in TypeScript (tsx)
- node-taglib-sharp for audio tags
- Tests: node:test + Supertest
- Linting: ESLint + typescript-eslint

## Prerequisites

- Node.js 20+
- npm (included with Node.js)

## Getting Started

```bash
git clone https://github.com/ItokianaRAKT/riffl-backend.git
cd riffl-backend
npm install
npm run dev
```

Server runs at `http://localhost:3000`.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start with hot reload |
| `npm test` | Run tests |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Type-check |

## API

All requests and responses use JSON.

### `GET /health`

Health check endpoint.

### `GET /files/scan?path=<absolute path>`

Recursively scans a directory and returns audio files with metadata (title, artist, size, etc.). Symlinks and `riffl/` directories are ignored.

### `GET /files/directories?path=<absolute path>`

Lists subdirectories for filesystem browsing.

### `GET /stream?path=<absolute path>`

Streams an audio file with `Range` request support.

### `POST /action`

Moves a file to `<directory>/riffl/<action>/<filename>`.

Request: `{ "path": "...", "action": "keep|skip|delete" }`

### `POST /action/undo`

Restores the last moved file. Undo history is in-memory only.

### `POST /action/rename`

Updates audio tags and renames file to `<title>.<ext>`.

Request: `{ "path": "...", "title": "...", "artist": "..." }`

## Supported Formats

`.mp3`, `.mp4`, `.wav`, `.ogg`, `.flac`

## Testing

```bash
npm test
npm run lint
npm run typecheck
```
