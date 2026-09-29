import { readdir, stat } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const AUDIO_EXTENSIONS = [".mp3", ".wav", ".ogg", ".flac"] as const;

export type ScanErrorCode =
  | "PATH_MISSING"
  | "PATH_NOT_FOUND"
  | "PATH_NOT_DIRECTORY"
  | "PATH_NOT_ACCESSIBLE"
  | "PATH_READ_ERROR";

export class ScanError extends Error {
  readonly code: ScanErrorCode;

  constructor(code: ScanErrorCode, message: string) {
    super(message);
    this.name = "ScanError";
    this.code = code;
  }
}

export interface AudioFile {
  path: string;
  relativePath: string;
  name: string;
  extension: string;
  size: number;
  modifiedAt: string;
}

export interface ScanResult {
  rootPath: string;
  scannedAt: string;
  totalFiles: number;
  totalSize: number;
  files: AudioFile[];
}

function isAudioFile(name: string): boolean {
  const extension = extname(name).toLowerCase();
  return AUDIO_EXTENSIONS.some((audioExtension) => audioExtension === extension);
}

function toScanError(error: unknown, message: string): ScanError {
  const systemCode = (error as NodeJS.ErrnoException | null)?.code;

  if (systemCode === "EACCES" || systemCode === "EPERM") {
    return new ScanError("PATH_NOT_ACCESSIBLE", message);
  }

  if (systemCode === "ENOENT") {
    return new ScanError("PATH_NOT_FOUND", message);
  }

  return new ScanError("PATH_READ_ERROR", message);
}

async function walk(
  directoryPath: string,
  rootPath: string,
  files: AudioFile[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    throw toScanError(error, `Unable to read directory: ${directoryPath}`);
  }

  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      continue;
    }

    const fullPath = join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      await walk(fullPath, rootPath, files);
      continue;
    }

    if (!entry.isFile() || !isAudioFile(entry.name)) {
      continue;
    }

    let info;
    try {
      info = await stat(fullPath);
    } catch {
      continue;
    }

    files.push({
      path: fullPath,
      relativePath: relative(rootPath, fullPath),
      name: entry.name,
      extension: extname(entry.name).toLowerCase().slice(1),
      size: info.size,
      modifiedAt: info.mtime.toISOString(),
    });
  }
}

export async function scanDirectory(rootPath: string): Promise<ScanResult> {
  if (!rootPath || !rootPath.trim()) {
    throw new ScanError("PATH_MISSING", "Path parameter is required");
  }

  const resolvedPath = resolve(rootPath);

  let info;
  try {
    info = await stat(resolvedPath);
  } catch (error) {
    const systemCode = (error as NodeJS.ErrnoException | null)?.code;

    if (systemCode === "EACCES" || systemCode === "EPERM") {
      throw new ScanError(
        "PATH_NOT_ACCESSIBLE",
        `Path is not accessible: ${resolvedPath}`,
      );
    }

    if (systemCode === "ENOENT") {
      throw new ScanError("PATH_NOT_FOUND", `Path not found: ${resolvedPath}`);
    }

    throw new ScanError(
      "PATH_READ_ERROR",
      `Unable to inspect path: ${resolvedPath}`,
    );
  }

  if (!info.isDirectory()) {
    throw new ScanError(
      "PATH_NOT_DIRECTORY",
      `Path is not a directory: ${resolvedPath}`,
    );
  }

  const files: AudioFile[] = [];
  await walk(resolvedPath, resolvedPath, files);
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  return {
    rootPath: resolvedPath,
    scannedAt: new Date().toISOString(),
    totalFiles: files.length,
    totalSize: files.reduce((sum, file) => sum + file.size, 0),
    files,
  };
}
