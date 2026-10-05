import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ScanError, listDirectories, scanDirectory } from "./files.service.js";
import { writeTags } from "./tags.service.js";

let fixtureRoot: string;
let sideRoot: string;
let deniedRoot: string;
let fileFixture: string;

before(async () => {
  fixtureRoot = await mkdtemp(join(tmpdir(), "riffl-scan-"));
  sideRoot = await mkdtemp(join(tmpdir(), "riffl-scan-side-"));
  deniedRoot = await mkdtemp(join(tmpdir(), "riffl-scan-denied-"));
  fileFixture = join(sideRoot, "not-a-dir.mp3");
  await mkdir(join(fixtureRoot, "album"));
  await mkdir(join(fixtureRoot, "album", "bonus"));
  await writeFile(join(fixtureRoot, "track-one.mp3"), "a".repeat(32));
  await writeFile(join(fixtureRoot, "album", "track-two.flac"), "b".repeat(16));
  await writeFile(join(fixtureRoot, "album", "bonus", "track-three.wav"), "c");
  await writeFile(join(fixtureRoot, "cover.jpg"), "not audio");
  await writeFile(join(fixtureRoot, "notes.txt"), "not audio either");
  await writeFile(fileFixture, "audio file used as non-directory path");
  await chmod(deniedRoot, 0o000);
});

after(async () => {
  await chmod(deniedRoot, 0o700).catch(() => {});
  await rm(fixtureRoot, { recursive: true, force: true });
  await rm(sideRoot, { recursive: true, force: true });
  await rm(deniedRoot, { recursive: true, force: true });
});

test("scans audio files recursively with metadata", async () => {
  const result = await scanDirectory(fixtureRoot);

  assert.equal(result.rootPath, fixtureRoot);
  assert.equal(result.totalFiles, 3);
  assert.equal(result.totalSize, 32 + 16 + 1);
  assert.deepEqual(
    result.files.map((file) => file.relativePath),
    ["album/bonus/track-three.wav", "album/track-two.flac", "track-one.mp3"],
  );

  const [nested] = result.files;
  assert.ok(nested);
  assert.equal(nested.name, "track-three.wav");
  assert.equal(nested.extension, "wav");
  assert.equal(nested.title, "track-three");
  assert.equal(nested.artist, null);
  assert.equal(nested.path, join(fixtureRoot, "album", "bonus", "track-three.wav"));
  assert.ok(Number.isFinite(Date.parse(nested.modifiedAt)));
});

test("ignores non audio files and directories", async () => {
  const result = await scanDirectory(fixtureRoot);

  const names = result.files.map((file) => file.name);
  assert.ok(!names.includes("cover.jpg"));
  assert.ok(!names.includes("notes.txt"));
});

test("returns tags when the audio file carries them", async () => {
  const taggedRoot = await mkdtemp(join(tmpdir(), "riffl-tags-scan-"));

  try {
    const taggedPath = join(taggedRoot, "renamed-track.mp3");
    const untaggedPath = join(taggedRoot, "untagged.flac");

    await copyFile(
      fileURLToPath(new URL("../fixtures/tone.mp3", import.meta.url)),
      taggedPath,
    );
    await copyFile(
      fileURLToPath(new URL("../fixtures/tone.flac", import.meta.url)),
      untaggedPath,
    );
    writeTags(taggedPath, { title: "Night Drive", artist: "Com Truise" });

    const result = await scanDirectory(taggedRoot);

    const tagged = result.files.find((file) => file.name === "renamed-track.mp3");
    const untagged = result.files.find((file) => file.name === "untagged.flac");

    assert.ok(tagged);
    assert.equal(tagged.title, "Night Drive");
    assert.equal(tagged.artist, "Com Truise");

    assert.ok(untagged);
    assert.equal(untagged.title, "untagged");
    assert.equal(untagged.artist, null);
  } finally {
    await rm(taggedRoot, { recursive: true, force: true });
  }
});

test("throws PATH_NOT_FOUND for an unknown path", async () => {
  await assert.rejects(
    scanDirectory(join(fixtureRoot, "does-not-exist")),
    (error: unknown) =>
      error instanceof ScanError && error.code === "PATH_NOT_FOUND",
  );
});

test("throws PATH_NOT_DIRECTORY when the path is a file", async () => {
  await assert.rejects(
    scanDirectory(fileFixture),
    (error: unknown) =>
      error instanceof ScanError && error.code === "PATH_NOT_DIRECTORY",
  );
});

test("throws PATH_MISSING for an empty path", async () => {
  await assert.rejects(
    scanDirectory("   "),
    (error: unknown) =>
      error instanceof ScanError && error.code === "PATH_MISSING",
  );
});

test(
  "throws PATH_NOT_ACCESSIBLE for an unreadable directory",
  { skip: process.getuid?.() === 0 ? "cannot restrict access as root" : false },
  async () => {
    await assert.rejects(
      scanDirectory(deniedRoot),
      (error: unknown) =>
        error instanceof ScanError && error.code === "PATH_NOT_ACCESSIBLE",
    );
  },
);

test("lists subdirectories and skips files and hidden folders", async () => {
  const root = await mkdtemp(join(tmpdir(), "riffl-list-"));

  try {
    await mkdir(join(root, "Zebra"));
    await mkdir(join(root, "alpha"));
    await mkdir(join(root, ".hidden"));
    await writeFile(join(root, "track-one.mp3"), "audio file");

    const result = await listDirectories(root);

    assert.equal(result.path, root);
    assert.equal(result.parent, dirname(root));
    assert.deepEqual(
      result.directories.map((directory) => directory.name),
      ["alpha", "Zebra"],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("defaults to the home directory", async () => {
  const result = await listDirectories();

  assert.equal(result.path, homedir());
});

test("returns no parent at the filesystem root", async () => {
  const result = await listDirectories(sep);

  assert.equal(result.parent, null);
});

test("throws PATH_MISSING for a blank path", async () => {
  await assert.rejects(
    listDirectories("   "),
    (error: unknown) =>
      error instanceof ScanError && error.code === "PATH_MISSING",
  );
});

test("throws PATH_NOT_FOUND for an unknown directory", async () => {
  await assert.rejects(
    listDirectories(join(fixtureRoot, "does-not-exist")),
    (error: unknown) =>
      error instanceof ScanError && error.code === "PATH_NOT_FOUND",
  );
});

test("throws PATH_NOT_DIRECTORY when the path is a file", async () => {
  await assert.rejects(
    listDirectories(fileFixture),
    (error: unknown) =>
      error instanceof ScanError && error.code === "PATH_NOT_DIRECTORY",
  );
});

test(
  "throws PATH_NOT_ACCESSIBLE when listing an unreadable directory",
  { skip: process.getuid?.() === 0 ? "cannot restrict access as root" : false },
  async () => {
    await assert.rejects(
      listDirectories(deniedRoot),
      (error: unknown) =>
        error instanceof ScanError && error.code === "PATH_NOT_ACCESSIBLE",
    );
  },
);
