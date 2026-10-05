import { File, PictureType } from "node-taglib-sharp";

export interface AudioTags {
  title: string | null;
  artist: string | null;
}

export interface CoverArt {
  mimeType: string;
  data: Uint8Array;
}

export interface TagUpdate {
  title?: string;
  artist?: string;
}

export class TagError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TagError";
  }
}

function normalize(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function openFile(filePath: string): File {
  try {
    return File.createFromPath(filePath);
  } catch (error) {
    throw new TagError(
      `Unable to read audio tags: ${(error as Error).message}`,
    );
  }
}

export function readTags(filePath: string): AudioTags {
  const file = openFile(filePath);

  try {
    return {
      title: normalize(file.tag.title),
      artist: normalize(file.tag.performers?.join(", ")),
    };
  } finally {
    file.dispose();
  }
}

export function readCover(filePath: string): CoverArt | null {
  const file = openFile(filePath);

  try {
    const pictures = file.tag.pictures;
    const picture =
      pictures.find((entry) => entry.type === PictureType.FrontCover) ??
      pictures[0];

    if (!picture) {
      return null;
    }

    return {
      mimeType: picture.mimeType || "application/octet-stream",
      data: picture.data.toByteArray(),
    };
  } finally {
    file.dispose();
  }
}

export function writeTags(filePath: string, update: TagUpdate): void {
  const file = openFile(filePath);

  try {
    if (update.title !== undefined) {
      file.tag.title = update.title;
    }

    if (update.artist !== undefined) {
      file.tag.performers = [update.artist];
    }

    file.save();
  } catch (error) {
    throw new TagError(
      `Unable to write audio tags: ${(error as Error).message}`,
    );
  } finally {
    file.dispose();
  }
}
