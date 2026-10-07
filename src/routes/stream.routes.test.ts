import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { app } from "../app.js";

const fixturesDirectory = fileURLToPath(
  new URL("../fixtures/", import.meta.url),
);

let fixtureRoot: string;
let trackPath: string;
let emptyPath: string;
let trackSize: number;

before(async () => {
  fixtureRoot = await mkdtemp(join(tmpdir(), "riffl-stream-routes-"));
  trackPath = join(fixtureRoot, "track.mp3");
  emptyPath = join(fixtureRoot, "empty.mp3");

  await copyFile(join(fixturesDirectory, "tone.mp3"), trackPath);
  await writeFile(emptyPath, "");
  await mkdir(join(fixtureRoot, "album"));

  trackSize = (await stat(trackPath)).size;
});

after(async () => {
  await rm(fixtureRoot, { recursive: true, force: true });
});

test("returns 400 when the path parameter is missing", async () => {
  const response = await request(app).get("/stream");

  assert.equal(response.status, 400);
  assert.equal(response.body.code, "PATH_MISSING");
});

test("returns 400 when the path is blank", async () => {
  const response = await request(app).get("/stream").query({ path: " " });

  assert.equal(response.status, 400);
  assert.equal(response.body.code, "PATH_MISSING");
});

test("returns 404 when the file does not exist", async () => {
  const response = await request(app)
    .get("/stream")
    .query({ path: join(fixtureRoot, "missing.mp3") });

  assert.equal(response.status, 404);
  assert.equal(response.body.code, "FILE_NOT_FOUND");
});

test("returns 404 when the path is not a file", async () => {
  const response = await request(app)
    .get("/stream")
    .query({ path: join(fixtureRoot, "album") });

  assert.equal(response.status, 404);
  assert.equal(response.body.code, "NOT_A_FILE");
});

test("streams the whole file when no range is requested", async () => {
  const response = await request(app).get("/stream").query({ path: trackPath });

  assert.equal(response.status, 200);
  assert.equal(response.headers["content-type"], "audio/mpeg");
  assert.equal(response.headers["accept-ranges"], "bytes");
  assert.equal(response.headers["content-length"], String(trackSize));
  assert.deepEqual(response.body, await readFile(trackPath));
});

test("streams the requested byte range", async () => {
  const response = await request(app)
    .get("/stream")
    .query({ path: trackPath })
    .set("Range", "bytes=100-199");

  assert.equal(response.status, 206);
  assert.equal(response.headers["content-range"], `bytes 100-199/${trackSize}`);
  assert.equal(response.headers["content-length"], "100");
  assert.deepEqual(
    response.body,
    (await readFile(trackPath)).subarray(100, 200),
  );
});

test("streams the last bytes when the range uses a suffix", async () => {
  const response = await request(app)
    .get("/stream")
    .query({ path: trackPath })
    .set("Range", "bytes=-50");

  assert.equal(response.status, 206);
  assert.equal(
    response.headers["content-range"],
    `bytes ${trackSize - 50}-${trackSize - 1}/${trackSize}`,
  );
  assert.deepEqual(
    response.body,
    (await readFile(trackPath)).subarray(trackSize - 50),
  );
});

test("returns 416 when the range starts past the end of the file", async () => {
  const response = await request(app)
    .get("/stream")
    .query({ path: trackPath })
    .set("Range", `bytes=${trackSize + 100}-`);

  assert.equal(response.status, 416);
  assert.equal(response.headers["content-range"], `bytes */${trackSize}`);
  assert.equal(response.body.code, "RANGE_NOT_SATISFIABLE");
});

test("ignores a range header it cannot parse", async () => {
  const response = await request(app)
    .get("/stream")
    .query({ path: trackPath })
    .set("Range", "bytes=abc-def");

  assert.equal(response.status, 200);
  assert.equal(response.headers["content-length"], String(trackSize));
});

test("streams an empty file", async () => {
  const response = await request(app).get("/stream").query({ path: emptyPath });

  assert.equal(response.status, 200);
  assert.equal(response.headers["content-length"], "0");
  assert.equal(response.body.length, 0);
});
