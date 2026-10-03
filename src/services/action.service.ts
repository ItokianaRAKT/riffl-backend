import { mkdir, rename } from "node:fs/promises";
import { basename, resolve, dirname, join } from "node:path";

export type FileAction = "keep" | "skip" | "delete";

interface HistoryEntry {
  sourcePath: string;
  destinationPath: string;
  action: FileAction;
}

const history: HistoryEntry[] = [];

export interface RestoredFile {
  path: string;
  action: FileAction;
  remaining: number;
}

export async function moveFile(
  filePath: string,
  action: FileAction
): Promise<void> {
  const resolvedFilePath = resolve(filePath);
  const sourceDirectory = dirname(resolvedFilePath);
  const rifflDirectory = join(sourceDirectory, "riffl");
  const actionDirectory = join(rifflDirectory, action);

    await mkdir(actionDirectory, { recursive: true });

    const destinationPath = join(
      actionDirectory,
      basename(resolvedFilePath),
    );

    await rename(resolvedFilePath, destinationPath);

    history.push({ sourcePath: resolvedFilePath, destinationPath, action });
}

export function historyLength(): number {
  return history.length;
}

export async function undoLastAction(): Promise<RestoredFile | null> {
  const entry = history[history.length - 1];

  if (!entry) {
    return null;
  }

  await mkdir(dirname(entry.sourcePath), { recursive: true });
  await rename(entry.destinationPath, entry.sourcePath);

  history.pop();

  return {
    path: entry.sourcePath,
    action: entry.action,
    remaining: history.length,
  };
}
