import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { access, copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renameTrack, RenameError } from "./rename.service.js";
import { readTags, writeTags } from "./tags.service.js";

const fixturesDirectory = fileURLToPath(
  new URL("../fixtures/", import.meta.url),
);

let workDirectory: string;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function copyFixture(extension: string, name: string): Promise<string> {
  const target = join(workDirectory, name);
  await copyFile(join(fixturesDirectory, `tone.${extension}`), target);
  return target;
}

async function expectCode(
  input: Parameters<typeof renameTrack>[0],
  code: string,
): Promise<void> {
  await assert.rejects(
    renameTrack(input),
    (error: unknown) =>
      error instanceof RenameError && error.code === code,
  );
}

before(async () => {
  workDirectory = await mkdtemp(join(tmpdir(), "riffl-rename-"));
});

after(async () => {
  await rm(workDirectory, { recursive: true, force: true });
});

test("renames the file and keeps its extension", async () => {
  const source = await copyFixture("mp3", "old name.mp3");

  const result = await renameTrack({ path: source, title: "Night Drive" });

  assert.equal(result.path, join(workDirectory, "Night Drive.mp3"));
  assert.equal(result.previousPath, source);
  assert.equal(await exists(source), false);
  assert.equal(await exists(result.path), true);
});

test("writes the title and artist tags", async () => {
  const source = await copyFixture("flac", "tagged.flac");

  const result = await renameTrack({
    path: source,
    title: "Night Drive",
    artist: "Com Truise",
  });

  assert.equal(result.title, "Night Drive");
  assert.equal(result.artist, "Com Truise");
  assert.deepEqual(readTags(result.path), {
    title: "Night Drive",
    artist: "Com Truise",
  });
});

test("keeps the stored artist when none is provided", async () => {
  const source = await copyFixture("ogg", "untouched.ogg");
  writeTags(source, { artist: "Com Truise" });

  const result = await renameTrack({ path: source, title: "Broadway" });

  assert.equal(result.artist, "Com Truise");
  assert.deepEqual(readTags(result.path), {
    title: "Broadway",
    artist: "Com Truise",
  });
});

test("preserves every supported extension", async () => {
  for (const extension of ["mp3", "flac", "ogg", "mp4", "wav"]) {
    const source = await copyFixture(extension, `original.${extension}`);
    const title = `Night Drive ${extension}`;

    const result = await renameTrack({ path: source, title });

    assert.equal(result.path, join(workDirectory, `${title}.${extension}`));
    assert.equal(await exists(result.path), true);
  }
});

test("only refreshes the tags when the name does not change", async () => {
  const source = await copyFixture("mp3", "Night Drive.mp3");

  const result = await renameTrack({
    path: source,
    title: "Night Drive",
    artist: "Com Truise",
  });

  assert.equal(result.path, source);
  assert.equal(await exists(source), true);
  assert.deepEqual(readTags(source), {
    title: "Night Drive",
    artist: "Com Truise",
  });
});

test("rejects an extension change", async () => {
  const source = await copyFixture("mp3", "keep-extension.mp3");

  await expectCode(
    { path: source, title: "Night Drive", extension: ".wav" },
    "EXTENSION_NOT_ALLOWED",
  );

  assert.equal(await exists(source), true);
});

test("rejects a missing or invalid title", async () => {
  const source = await copyFixture("mp3", "invalid-title.mp3");

  await expectCode({ path: source }, "TITLE_MISSING");
  await expectCode({ path: source, title: "   " }, "TITLE_MISSING");
  await expectCode({ path: source, title: "sub/nested" }, "TITLE_INVALID");
  await expectCode({ path: source, title: "back\\slash" }, "TITLE_INVALID");
  await expectCode({ path: source, title: ".." }, "TITLE_INVALID");
  await expectCode({ path: source, title: "." }, "TITLE_INVALID");
  await expectCode({ path: source, title: "line\nbreak" }, "TITLE_INVALID");

  assert.equal(await exists(source), true);
});

test("rejects a title that does not fit in a file name", async () => {
  const source = await copyFixture("mp3", "long-title.mp3");

  await expectCode(
    { path: source, title: "a".repeat(260) },
    "TITLE_TOO_LONG",
  );

  assert.equal(await exists(source), true);
});

test("rejects a missing or invalid artist", async () => {
  const source = await copyFixture("mp3", "invalid-artist.mp3");

  await expectCode({ path: source, title: "Night Drive", artist: "" }, "ARTIST_INVALID");
  await expectCode({ path: source, title: "Night Drive", artist: 42 }, "ARTIST_INVALID");

  assert.equal(await exists(source), true);
});

test("rejects a missing path or file", async () => {
  await expectCode({ title: "Night Drive" }, "PATH_MISSING");
  await expectCode(
    { path: join(workDirectory, "does-not-exist.mp3"), title: "Night Drive" },
    "FILE_NOT_FOUND",
  );
});

test("refuses to rename a track that was already sorted", async () => {
  const sortedDirectory = join(workDirectory, "riffl", "keep");
  await mkdir(sortedDirectory, { recursive: true });
  const sorted = join(sortedDirectory, "sorted.mp3");
  await copyFile(join(fixturesDirectory, "tone.mp3"), sorted);

  await expectCode({ path: sorted, title: "Night Drive" }, "TRACK_ALREADY_SORTED");

  assert.equal(await exists(sorted), true);
});

test("refuses to overwrite an existing file", async () => {
  const first = await copyFixture("mp3", "first.mp3");
  await copyFixture("mp3", "Night Drive.mp3");

  await expectCode({ path: first, title: "Night Drive" }, "NAME_CONFLICT");

  assert.equal(await exists(first), true);
});

test("refuses to rename a file without readable tags", async () => {
  const source = join(workDirectory, "fake.mp3");
  await writeFile(source, "this is not an audio file");

  await expectCode({ path: source, title: "Fake Target" }, "TAG_WRITE_FAILED");

  assert.equal(await exists(source), true);
  assert.equal(await exists(join(workDirectory, "Fake Target.mp3")), false);
});
