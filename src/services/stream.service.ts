import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { Readable } from "node:stream";

export type StreamErrorCode =
  | "PATH_MISSING"
  | "FILE_NOT_FOUND"
  | "NOT_A_FILE";

export class StreamError extends Error {
  readonly code: StreamErrorCode;

  constructor(code: StreamErrorCode, message: string) {
    super(message);
    this.name = "StreamError";
    this.code = code;
  }
}

export interface ByteRange {
  start: number;
  end: number;
}

export type RangeResult = ByteRange | null | "unsatisfiable";

export interface StreamTarget {
  path: string;
  size: number;
}

export async function resolveTarget(
  rawPath: string | undefined,
): Promise<StreamTarget> {
  if (!rawPath || !rawPath.trim()) {
    throw new StreamError("PATH_MISSING", "A file path is required");
  }

  let info;
  try {
    info = await stat(rawPath);
  } catch {
    throw new StreamError("FILE_NOT_FOUND", "File not found");
  }

  if (!info.isFile()) {
    throw new StreamError("NOT_A_FILE", "Path is not a file");
  }

  return { path: rawPath, size: info.size };
}

export function parseRangeHeader(
  header: string | undefined,
  size: number,
): RangeResult {
  if (!header) {
    return null;
  }

  const [rawStart, rawEnd] = header.replace("bytes=", "").split("-");
  const start = Number(rawStart) || 0;
  const end = rawEnd ? Math.min(Number(rawEnd), size - 1) : size - 1;

  if (start > end || start >= size) {
    return "unsatisfiable";
  }

  return { start, end };
}

export function openStream(path: string, range: ByteRange): Readable {
  return createReadStream(path, range);
}
