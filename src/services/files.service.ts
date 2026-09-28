import { readdir } from "node:fs/promises";

async function getFiles(directoryPath: string) {
  const files = await readdir(directoryPath, { withFileTypes : true});
  const audioFiles = files.filter((file) => {
    if (!file.isFile()) {
      return false
    }
    return (
      file.name.endsWith(".mp3") ||
      file.name.endsWith(".wav") ||
      file.name.endsWith(".ogg") ||
      file.name.endsWith(".flac")
    );
  })
  return audioFiles;
}
