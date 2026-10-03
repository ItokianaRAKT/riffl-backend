import { mkdir, rename } from "node:fs/promises";
import { basename, resolve, dirname, join } from "node:path";

export type FileAction = "keep" | "skip" | "delete";

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
}
