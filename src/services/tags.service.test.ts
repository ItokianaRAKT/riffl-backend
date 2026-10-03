import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readTags, writeTags, TagError } from "./tags.service.js";

const FORMATS = ["mp3", "flac", "ogg", "mp4", "wav"] as const;
const fixturesDirectory = fileURLToPath(
  new URL("../fixtures/", import.meta.url),
);

let workDirectory: string;

before(async () => {
  workDirectory = await mkdtemp(join(tmpdir(), "riffl-tags-"));

  for (const format of FORMATS) {
    await copyFile(
      join(fixturesDirectory, `tone.${format}`),
      join(workDirectory, `track.${format}`),
    );
  }

  await writeFile(join(workDirectory, "fake.mp3"), "not a real audio file");
});

after(async () => {
  await rm(workDirectory, { recursive: true, force: true });
});

test("reads missing tags as null on every format", () => {
  for (const format of FORMATS) {
    const tags = readTags(join(workDirectory, `track.${format}`));

    assert.deepEqual(tags, { title: null, artist: null }, format);
  }
});

test("writes and reads back title and artist on every format", () => {
  for (const format of FORMATS) {
    const path = join(workDirectory, `track.${format}`);

    writeTags(path, { title: "Night Drive", artist: "Com Truise" });

    assert.deepEqual(
      readTags(path),
      { title: "Night Drive", artist: "Com Truise" },
      format,
    );
  }
});

test("keeps the artist when only the title changes", () => {
  const path = join(workDirectory, "track.flac");

  writeTags(path, { title: "Night Drive", artist: "Com Truise" });
  writeTags(path, { title: "Broadway" });

  assert.deepEqual(readTags(path), {
    title: "Broadway",
    artist: "Com Truise",
  });
});

test("trims surrounding whitespace from tag values", () => {
  const path = join(workDirectory, "track.ogg");

  writeTags(path, { title: "  Night Drive  ", artist: "  Com Truise " });

  assert.deepEqual(readTags(path), {
    title: "Night Drive",
    artist: "Com Truise",
  });
});

test("throws TagError when the file has no readable tags", () => {
  const path = join(workDirectory, "fake.mp3");

  assert.throws(() => readTags(path), TagError);
  assert.throws(() => writeTags(path, { title: "Night Drive" }), TagError);
});
