import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import request from "supertest";
import { app } from "../app.js";

let fixtureRoot: string;
let sideRoot: string;
let deniedRoot: string;
let fileFixture: string;

before(async () => {
  fixtureRoot = await mkdtemp(join(tmpdir(), "riffl-routes-"));
  sideRoot = await mkdtemp(join(tmpdir(), "riffl-routes-side-"));
  deniedRoot = await mkdtemp(join(tmpdir(), "riffl-routes-denied-"));
  fileFixture = join(sideRoot, "not-a-dir.mp3");
  await mkdir(join(fixtureRoot, "album"));
  await writeFile(join(fixtureRoot, "track-one.mp3"), "a".repeat(8));
  await writeFile(join(fixtureRoot, "album", "track-two.flac"), "b".repeat(4));
  await writeFile(join(fixtureRoot, "cover.jpg"), "not audio");
  await writeFile(fileFixture, "audio file used as non-directory path");
  await chmod(deniedRoot, 0o000);
});

after(async () => {
  await chmod(deniedRoot, 0o700).catch(() => {});
  await rm(fixtureRoot, { recursive: true, force: true });
  await rm(sideRoot, { recursive: true, force: true });
  await rm(deniedRoot, { recursive: true, force: true });
});

test("returns 400 when the path parameter is missing", async () => {
  const response = await request(app).get("/files/scan");

  assert.equal(response.status, 400);
  assert.equal(response.body.code, "PATH_MISSING");
});

test("returns 404 when the path does not exist", async () => {
  const response = await request(app)
    .get("/files/scan")
    .query({ path: join(fixtureRoot, "missing") });

  assert.equal(response.status, 404);
  assert.equal(response.body.code, "PATH_NOT_FOUND");
});

test("returns 422 when the path is not a directory", async () => {
  const response = await request(app)
    .get("/files/scan")
    .query({ path: fileFixture });

  assert.equal(response.status, 422);
  assert.equal(response.body.code, "PATH_NOT_DIRECTORY");
});

test(
  "returns 403 when the directory cannot be read",
  { skip: process.getuid?.() === 0 ? "cannot restrict access as root" : false },
  async () => {
    const response = await request(app)
      .get("/files/scan")
      .query({ path: deniedRoot });

    assert.equal(response.status, 403);
    assert.equal(response.body.code, "PATH_NOT_ACCESSIBLE");
  },
);

test("returns the scanned audio files", async () => {
  const response = await request(app)
    .get("/files/scan")
    .query({ path: fixtureRoot });

  assert.equal(response.status, 200);
  assert.equal(response.body.rootPath, fixtureRoot);
  assert.equal(response.body.totalFiles, 2);
  assert.equal(response.body.totalSize, 8 + 4);
  assert.deepEqual(
    response.body.files.map((file: { relativePath: string }) => file.relativePath),
    ["album/track-two.flac", "track-one.mp3"],
  );
  assert.deepEqual(
    response.body.files.map(
      (file: { title: string; artist: string | null }) =>
        [file.title, file.artist] as const,
    ),
    [
      ["track-two", null],
      ["track-one", null],
    ],
  );
  assert.ok(!response.body.files.some((file: { name: string }) => file.name === "cover.jpg"));
});

test("lists the subdirectories of a folder", async () => {
  const response = await request(app)
    .get("/files/directories")
    .query({ path: fixtureRoot });

  assert.equal(response.status, 200);
  assert.equal(response.body.path, fixtureRoot);
  assert.equal(response.body.parent, dirname(fixtureRoot));
  assert.deepEqual(
    response.body.directories.map((directory: { name: string }) => directory.name),
    ["album"],
  );
});

test("defaults to the home directory when no path is given", async () => {
  const response = await request(app).get("/files/directories");

  assert.equal(response.status, 200);
  assert.equal(response.body.path, homedir());
});

test("returns 400 when the path is blank", async () => {
  const response = await request(app)
    .get("/files/directories")
    .query({ path: " " });

  assert.equal(response.status, 400);
  assert.equal(response.body.code, "PATH_MISSING");
});

test("returns 404 when the listed path does not exist", async () => {
  const response = await request(app)
    .get("/files/directories")
    .query({ path: join(fixtureRoot, "missing") });

  assert.equal(response.status, 404);
  assert.equal(response.body.code, "PATH_NOT_FOUND");
});

test("returns 422 when the listed path is not a directory", async () => {
  const response = await request(app)
    .get("/files/directories")
    .query({ path: fileFixture });

  assert.equal(response.status, 422);
  assert.equal(response.body.code, "PATH_NOT_DIRECTORY");
});

test(
  "returns 403 when the directory cannot be listed",
  { skip: process.getuid?.() === 0 ? "cannot restrict access as root" : false },
  async () => {
    const response = await request(app)
      .get("/files/directories")
      .query({ path: deniedRoot });

    assert.equal(response.status, 403);
    assert.equal(response.body.code, "PATH_NOT_ACCESSIBLE");
  },
);

test(
  "returns 501 when no native folder dialog can be opened",
  {
    skip:
      process.platform !== "linux"
        ? "expects the display based linux dialog"
        : false,
  },
  async () => {
    const display = process.env.DISPLAY;
    const waylandDisplay = process.env.WAYLAND_DISPLAY;
    delete process.env.DISPLAY;
    delete process.env.WAYLAND_DISPLAY;

    try {
      const response = await request(app).post("/files/pick-directory");

      assert.equal(response.status, 501);
      assert.equal(response.body.code, "PICKER_UNAVAILABLE");
    } finally {
      if (display !== undefined) process.env.DISPLAY = display;
      if (waylandDisplay !== undefined) {
        process.env.WAYLAND_DISPLAY = waylandDisplay;
      }
    }
  },
);
