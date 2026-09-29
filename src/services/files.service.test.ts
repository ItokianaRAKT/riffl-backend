import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ScanError, scanDirectory } from "./files.service.js";

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
  assert.equal(nested.path, join(fixtureRoot, "album", "bonus", "track-three.wav"));
  assert.ok(Number.isFinite(Date.parse(nested.modifiedAt)));
});

test("ignores non audio files and directories", async () => {
  const result = await scanDirectory(fixtureRoot);

  const names = result.files.map((file) => file.name);
  assert.ok(!names.includes("cover.jpg"));
  assert.ok(!names.includes("notes.txt"));
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
