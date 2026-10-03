import { rename, stat } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";
import { readTags, writeTags, TagError } from "./tags.service.js";

export type RenameErrorCode =
  | "PATH_MISSING"
  | "TITLE_MISSING"
  | "TITLE_INVALID"
  | "TITLE_TOO_LONG"
  | "ARTIST_INVALID"
  | "EXTENSION_NOT_ALLOWED"
  | "FILE_NOT_FOUND"
  | "TRACK_ALREADY_SORTED"
  | "NAME_CONFLICT"
  | "TAG_WRITE_FAILED"
  | "RENAME_FAILED";

export class RenameError extends Error {
  readonly code: RenameErrorCode;

  constructor(code: RenameErrorCode, message: string) {
    super(message);
    this.name = "RenameError";
    this.code = code;
  }
}

export interface RenameTrackInput {
  path?: unknown;
  title?: unknown;
  artist?: unknown;
  extension?: unknown;
}

export interface RenameResult {
  path: string;
  previousPath: string;
  title: string;
  artist: string | null;
}

const SORTED_DIRECTORY = "riffl";
const SORTED_ACTIONS = ["keep", "skip", "delete"];
const MAX_FILENAME_BYTES = 255;

function hasForbiddenCharacters(value: string): boolean {
  if (value.includes("/") || value.includes("\\") || value.includes("..")) {
    return true;
  }

  if (/^\.{1,}$/.test(value)) {
    return true;
  }

  for (const character of value) {
    if (character.charCodeAt(0) < 32) {
      return true;
    }
  }

  return false;
}

function requirePath(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new RenameError("PATH_MISSING", "A valid file path is required");
  }

  return value.trim();
}

function requireTitle(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new RenameError("TITLE_MISSING", "A valid title is required");
  }

  const title = value.trim();

  if (hasForbiddenCharacters(title)) {
    throw new RenameError(
      "TITLE_INVALID",
      "The title cannot contain path separators or control characters",
    );
  }

  return title;
}

function requireArtist(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || !value.trim()) {
    throw new RenameError("ARTIST_INVALID", "A valid artist is required");
  }

  return value.trim();
}

function isSortedPath(filePath: string): boolean {
  const segments = filePath.split(sep);
  const sortedIndex = segments.lastIndexOf(SORTED_DIRECTORY);
  const action = segments[sortedIndex + 1];

  return (
    sortedIndex !== -1 &&
    action !== undefined &&
    SORTED_ACTIONS.includes(action)
  );
}

async function assertRenameable(filePath: string): Promise<void> {
  let info;
  try {
    info = await stat(filePath);
  } catch {
    throw new RenameError("FILE_NOT_FOUND", `File not found: ${filePath}`);
  }

  if (!info.isFile()) {
    throw new RenameError("FILE_NOT_FOUND", `Not a file: ${filePath}`);
  }

  if (isSortedPath(filePath)) {
    throw new RenameError(
      "TRACK_ALREADY_SORTED",
      `The track has already been sorted: ${filePath}`,
    );
  }
}

async function destinationExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function currentArtist(filePath: string): string | null {
  try {
    return readTags(filePath).artist;
  } catch {
    return null;
  }
}

export async function renameTrack(
  input: RenameTrackInput,
): Promise<RenameResult> {
  const path = requirePath(input.path);
  const title = requireTitle(input.title);
  const artist = requireArtist(input.artist);

  if (input.extension !== undefined) {
    throw new RenameError(
      "EXTENSION_NOT_ALLOWED",
      "The file extension cannot be changed",
    );
  }

  const previousPath = resolve(path);
  await assertRenameable(previousPath);

  const extension = extname(previousPath);
  const titleBytes = Buffer.byteLength(title, "utf8");
  const extensionBytes = Buffer.byteLength(extension, "utf8");

  if (titleBytes + extensionBytes > MAX_FILENAME_BYTES) {
    throw new RenameError(
      "TITLE_TOO_LONG",
      `The title must fit in ${MAX_FILENAME_BYTES} bytes including the extension`,
    );
  }

  const destinationPath = join(dirname(previousPath), `${title}${extension}`);

  if (
    destinationPath !== previousPath &&
    (await destinationExists(destinationPath))
  ) {
    throw new RenameError(
      "NAME_CONFLICT",
      `A file already exists at: ${destinationPath}`,
    );
  }

  try {
    writeTags(previousPath, { title, ...(artist !== undefined && { artist }) });
  } catch (error) {
    if (error instanceof TagError) {
      throw new RenameError("TAG_WRITE_FAILED", error.message);
    }

    throw error;
  }

  if (destinationPath !== previousPath) {
    try {
      await rename(previousPath, destinationPath);
    } catch (error) {
      throw new RenameError(
        "RENAME_FAILED",
        `Unable to rename the file: ${(error as Error).message}`,
      );
    }
  }

  return {
    path: destinationPath,
    previousPath,
    title,
    artist: artist ?? currentArtist(destinationPath),
  };
}
