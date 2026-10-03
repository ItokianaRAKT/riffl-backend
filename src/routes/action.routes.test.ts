import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { app } from "../app.js";

let fixtureRoot: string;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function createTrack(name: string): Promise<string> {
  const trackPath = join(fixtureRoot, name);
  await writeFile(trackPath, name);
  return trackPath;
}

before(async () => {
  fixtureRoot = await mkdtemp(join(tmpdir(), "riffl-action-routes-"));
});

after(async () => {
  await rm(fixtureRoot, { recursive: true, force: true });
});

beforeEach(async () => {
  await rm(fixtureRoot, { recursive: true, force: true });
  await mkdir(fixtureRoot, { recursive: true });
});

test("returns 400 when the file path is missing", async () => {
  const response = await request(app).post("/action").send({ action: "keep" });

  assert.equal(response.status, 400);
  assert.equal(response.body.error, "A valid file path is required");
});

test("returns 400 when the action is invalid", async () => {
  const response = await request(app)
    .post("/action")
    .send({ path: join(fixtureRoot, "track.mp3"), action: "burn" });

  assert.equal(response.status, 400);
  assert.equal(response.body.error, "Invalid action");
});

test("sorts a file then restores it on undo", async () => {
  const trackPath = await createTrack("track-one.mp3");

  const sorted = await request(app)
    .post("/action")
    .send({ path: trackPath, action: "keep" });

  assert.equal(sorted.status, 200);
  assert.equal(await exists(trackPath), false);
  assert.equal(
    await exists(join(fixtureRoot, "riffl", "keep", "track-one.mp3")),
    true,
  );

  const undone = await request(app).post("/action/undo");

  assert.equal(undone.status, 200);
  assert.equal(undone.body.success, true);
  assert.equal(undone.body.path, trackPath);
  assert.equal(undone.body.action, "keep");
  assert.equal(undone.body.remaining, 0);
  assert.equal(await exists(trackPath), true);
  assert.equal(
    await exists(join(fixtureRoot, "riffl", "keep", "track-one.mp3")),
    false,
  );
});

test("undoes every sorted file in reverse order", async () => {
  const first = await createTrack("first.mp3");
  const second = await createTrack("second.mp3");
  const third = await createTrack("third.mp3");

  for (const [path, action] of [
    [first, "keep"],
    [second, "skip"],
    [third, "delete"],
  ] as const) {
    const response = await request(app).post("/action").send({ path, action });
    assert.equal(response.status, 200);
  }

  const thirdUndo = await request(app).post("/action/undo");
  assert.equal(thirdUndo.status, 200);
  assert.equal(thirdUndo.body.path, third);
  assert.equal(thirdUndo.body.action, "delete");
  assert.equal(thirdUndo.body.remaining, 2);

  const secondUndo = await request(app).post("/action/undo");
  assert.equal(secondUndo.body.path, second);
  assert.equal(secondUndo.body.remaining, 1);

  const firstUndo = await request(app).post("/action/undo");
  assert.equal(firstUndo.body.path, first);
  assert.equal(firstUndo.body.remaining, 0);

  assert.equal(await exists(first), true);
  assert.equal(await exists(second), true);
  assert.equal(await exists(third), true);

  const emptyUndo = await request(app).post("/action/undo");
  assert.equal(emptyUndo.status, 400);
  assert.equal(emptyUndo.body.code, "NOTHING_TO_UNDO");
});

test("returns 400 when there is no decision to undo", async () => {
  const response = await request(app).post("/action/undo");

  assert.equal(response.status, 400);
  assert.equal(response.body.code, "NOTHING_TO_UNDO");
});
