import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { app } from "../app.js";
import { readTags } from "../services/tags.service.js";

const fixturesDirectory = fileURLToPath(
  new URL("../fixtures/", import.meta.url),
);

let fixtureRoot: string;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function copyFixture(extension: string, name: string): Promise<string> {
  const target = join(fixtureRoot, name);
  await copyFile(join(fixturesDirectory, `tone.${extension}`), target);
  return target;
}

before(async () => {
  fixtureRoot = await mkdtemp(join(tmpdir(), "riffl-rename-routes-"));
});

after(async () => {
  await rm(fixtureRoot, { recursive: true, force: true });
});

beforeEach(async () => {
  await rm(fixtureRoot, { recursive: true, force: true });
  await mkdir(fixtureRoot, { recursive: true });
});

test("renames the track and returns the new path", async () => {
  const source = await copyFixture("mp3", "track.mp3");

  const response = await request(app).post("/action/rename").send({
    path: source,
    title: "Night Drive",
    artist: "Com Truise",
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.path, join(fixtureRoot, "Night Drive.mp3"));
  assert.equal(response.body.previousPath, source);
  assert.equal(response.body.title, "Night Drive");
  assert.equal(response.body.artist, "Com Truise");
  assert.equal(await exists(source), false);
  assert.deepEqual(readTags(response.body.path), {
    title: "Night Drive",
    artist: "Com Truise",
  });
});

test("returns 400 when the path or the title is missing", async () => {
  const source = await copyFixture("mp3", "track.mp3");

  const withoutPath = await request(app)
    .post("/action/rename")
    .send({ title: "Night Drive" });
  assert.equal(withoutPath.status, 400);
  assert.equal(withoutPath.body.code, "PATH_MISSING");

  const withoutTitle = await request(app)
    .post("/action/rename")
    .send({ path: source });
  assert.equal(withoutTitle.status, 400);
  assert.equal(withoutTitle.body.code, "TITLE_MISSING");
});

test("returns 400 when the extension is part of the request", async () => {
  const source = await copyFixture("mp3", "track.mp3");

  const response = await request(app).post("/action/rename").send({
    path: source,
    title: "Night Drive",
    extension: ".wav",
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.code, "EXTENSION_NOT_ALLOWED");
  assert.equal(await exists(source), true);
});

test("returns 400 when the artist is invalid", async () => {
  const source = await copyFixture("mp3", "track.mp3");

  const response = await request(app).post("/action/rename").send({
    path: source,
    title: "Night Drive",
    artist: "   ",
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.code, "ARTIST_INVALID");
});

test("returns 404 when the file does not exist", async () => {
  const response = await request(app).post("/action/rename").send({
    path: join(fixtureRoot, "does-not-exist.mp3"),
    title: "Night Drive",
  });

  assert.equal(response.status, 404);
  assert.equal(response.body.code, "FILE_NOT_FOUND");
});

test("returns 409 when the track was already sorted", async () => {
  const sortedDirectory = join(fixtureRoot, "riffl", "keep");
  await mkdir(sortedDirectory, { recursive: true });
  const sorted = join(sortedDirectory, "sorted.mp3");
  await copyFile(join(fixturesDirectory, "tone.mp3"), sorted);

  const response = await request(app)
    .post("/action/rename")
    .send({ path: sorted, title: "Night Drive" });

  assert.equal(response.status, 409);
  assert.equal(response.body.code, "TRACK_ALREADY_SORTED");
});

test("returns 409 when the file name is already taken", async () => {
  const source = await copyFixture("mp3", "track.mp3");
  await copyFixture("mp3", "Night Drive.mp3");

  const response = await request(app)
    .post("/action/rename")
    .send({ path: source, title: "Night Drive" });

  assert.equal(response.status, 409);
  assert.equal(response.body.code, "NAME_CONFLICT");
  assert.equal(await exists(source), true);
});

test("returns 422 when the tags cannot be written", async () => {
  const source = join(fixtureRoot, "fake.mp3");
  await writeFile(source, "this is not an audio file");

  const response = await request(app)
    .post("/action/rename")
    .send({ path: source, title: "Broken" });

  assert.equal(response.status, 422);
  assert.equal(response.body.code, "TAG_WRITE_FAILED");
  assert.equal(await exists(source), true);
  assert.equal(await exists(join(fixtureRoot, "Broken.mp3")), false);
});
