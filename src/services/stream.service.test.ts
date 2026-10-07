import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { copyFile, mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buffer } from "node:stream/consumers";
import { fileURLToPath } from "node:url";
import {
  StreamError,
  contentTypeFor,
  openStream,
  parseRangeHeader,
  resolveTarget,
} from "./stream.service.js";

const fixturesDirectory = fileURLToPath(
  new URL("../fixtures/", import.meta.url),
);

let workDirectory: string;
let trackPath: string;
let fileSize: number;

async function expectCode(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  await assert.rejects(
    promise,
    (error: unknown) =>
      error instanceof StreamError && error.code === code,
  );
}

before(async () => {
  workDirectory = await mkdtemp(join(tmpdir(), "riffl-stream-"));
  trackPath = join(workDirectory, "track.mp3");
  await copyFile(join(fixturesDirectory, "tone.mp3"), trackPath);
  fileSize = (await stat(trackPath)).size;
  await mkdir(join(workDirectory, "album"));
});

after(async () => {
  await rm(workDirectory, { recursive: true, force: true });
});

test("rejects a missing or blank path", async () => {
  await expectCode(resolveTarget(undefined), "PATH_MISSING");
  await expectCode(resolveTarget(""), "PATH_MISSING");
  await expectCode(resolveTarget("   "), "PATH_MISSING");
});

test("rejects a path that does not exist", async () => {
  await expectCode(
    resolveTarget(join(workDirectory, "missing.mp3")),
    "FILE_NOT_FOUND",
  );
});

test("rejects a path that is not a file", async () => {
  await expectCode(resolveTarget(join(workDirectory, "album")), "NOT_A_FILE");
});

test("returns the size and the content type of a file", async () => {
  const target = await resolveTarget(trackPath);

  assert.deepEqual(target, {
    path: trackPath,
    size: fileSize,
    contentType: "audio/mpeg",
  });
});

test("maps every supported extension to its content type", () => {
  const expected: Record<string, string> = {
    mp3: "audio/mpeg",
    mp4: "audio/mp4",
    wav: "audio/wav",
    ogg: "audio/ogg",
    flac: "audio/flac",
  };

  for (const [extension, contentType] of Object.entries(expected)) {
    assert.equal(contentTypeFor(`track.${extension}`), contentType, extension);
  }

  assert.equal(contentTypeFor("TRACK.MP3"), "audio/mpeg");
});

test("falls back to a binary content type for unknown extensions", () => {
  assert.equal(contentTypeFor("track.xyz"), "application/octet-stream");
  assert.equal(contentTypeFor("track"), "application/octet-stream");
});

test("returns no range without a range header", () => {
  assert.equal(parseRangeHeader(undefined, fileSize), null);
});

test("parses a bounded range", () => {
  assert.deepEqual(parseRangeHeader("bytes=100-199", fileSize), {
    start: 100,
    end: 199,
  });
});

test("parses an open ended range", () => {
  assert.deepEqual(parseRangeHeader("bytes=400-", fileSize), {
    start: 400,
    end: fileSize - 1,
  });
});

test("parses a suffix range as the last bytes of the file", () => {
  assert.deepEqual(parseRangeHeader("bytes=-50", fileSize), {
    start: fileSize - 50,
    end: fileSize - 1,
  });
});

test("returns the whole file when the suffix is longer than the file", () => {
  assert.deepEqual(parseRangeHeader("bytes=-99999", fileSize), {
    start: 0,
    end: fileSize - 1,
  });
});

test("clips the end of the range to the file size", () => {
  assert.deepEqual(parseRangeHeader("bytes=0-99999", fileSize), {
    start: 0,
    end: fileSize - 1,
  });
});

test("rejects a start past the end of the file", () => {
  assert.equal(
    parseRangeHeader(`bytes=${fileSize}-`, fileSize),
    "unsatisfiable",
  );
  assert.equal(parseRangeHeader("bytes=999-1000", fileSize), "unsatisfiable");
});

test("rejects an empty suffix range", () => {
  assert.equal(parseRangeHeader("bytes=-0", fileSize), "unsatisfiable");
  assert.equal(parseRangeHeader("bytes=0-", 0), "unsatisfiable");
});

test("ignores a range header it cannot parse", () => {
  assert.equal(parseRangeHeader("bytes=abc-def", fileSize), null);
  assert.equal(parseRangeHeader("items=0-10", fileSize), null);
  assert.equal(parseRangeHeader("bytes=10-5", fileSize), null);
  assert.equal(parseRangeHeader("bytes=-", fileSize), null);
});

test("reads the requested byte range", async () => {
  const data = await buffer(openStream(trackPath, { start: 10, end: 19 }));

  assert.equal(data.length, 10);
  assert.deepEqual(
    data,
    (await readFile(trackPath)).subarray(10, 20),
  );
});

test("reads the whole file when there is no range", async () => {
  const data = await buffer(openStream(trackPath, null));

  assert.deepEqual(data, await readFile(trackPath));
});
