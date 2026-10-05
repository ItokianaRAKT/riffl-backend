import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ByteVector, File, Picture } from "node-taglib-sharp";
import request from "supertest";
import { app } from "../app.js";

const fixturesDirectory = fileURLToPath(
  new URL("../fixtures/", import.meta.url),
);

const COVER_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const COVER_BYTES = new Uint8Array(Buffer.from(COVER_BASE64, "base64"));

let fixtureRoot: string;

async function copyFixture(name: string): Promise<string> {
  const target = join(fixtureRoot, name);
  await copyFile(join(fixturesDirectory, "tone.mp3"), target);
  return target;
}

function embedCover(path: string): void {
  const file = File.createFromPath(path);
  file.tag.pictures = [
    Picture.fromData(ByteVector.fromByteArray(COVER_BYTES)),
  ];
  file.save();
  file.dispose();
}

before(async () => {
  fixtureRoot = await mkdtemp(join(tmpdir(), "riffl-cover-routes-"));
});

after(async () => {
  await rm(fixtureRoot, { recursive: true, force: true });
});

beforeEach(async () => {
  await rm(fixtureRoot, { recursive: true, force: true });
  await mkdir(fixtureRoot, { recursive: true });
});

test("returns 400 when the path is missing", async () => {
  const response = await request(app).get("/cover");

  assert.equal(response.status, 400);
  assert.equal(response.body.code, "PATH_MISSING");
});

test("returns 404 when the file does not exist", async () => {
  const response = await request(app)
    .get("/cover")
    .query({ path: join(fixtureRoot, "does-not-exist.mp3") });

  assert.equal(response.status, 404);
  assert.equal(response.body.code, "FILE_NOT_FOUND");
});

test("returns 404 when the file has no cover art", async () => {
  const source = await copyFixture("track.mp3");

  const response = await request(app).get("/cover").query({ path: source });

  assert.equal(response.status, 404);
  assert.equal(response.body.code, "NO_COVER");
});

test("returns 422 when the tags cannot be read", async () => {
  const source = join(fixtureRoot, "fake.mp3");
  await writeFile(source, "this is not an audio file");

  const response = await request(app).get("/cover").query({ path: source });

  assert.equal(response.status, 422);
  assert.equal(response.body.code, "TAG_READ_FAILED");
});

test("returns the embedded cover art", async () => {
  const source = await copyFixture("track.mp3");
  embedCover(source);

  const response = await request(app).get("/cover").query({ path: source });

  assert.equal(response.status, 200);
  assert.equal(response.headers["content-type"], "image/png");
  assert.deepEqual(response.body, Buffer.from(COVER_BYTES));
});
