import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  historyLength,
  moveFile,
  undoLastAction,
} from "./action.service.js";

let fixtureRoot: string;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

before(async () => {
  fixtureRoot = await mkdtemp(join(tmpdir(), "riffl-action-"));
});

after(async () => {
  await rm(fixtureRoot, { recursive: true, force: true });
});

beforeEach(async () => {
  await rm(fixtureRoot, { recursive: true, force: true });
  await mkdir(fixtureRoot, { recursive: true });
});

test("moves a file into its riffl action folder", async () => {
  const trackPath = join(fixtureRoot, "track-one.mp3");
  await writeFile(trackPath, "a".repeat(8));

  await moveFile(trackPath, "keep");

  assert.equal(await exists(trackPath), false);
  assert.equal(await exists(join(fixtureRoot, "riffl", "keep", "track-one.mp3")), true);
  assert.equal(historyLength(), 1);

  await undoLastAction();
});

test("restores the sorted file to its original folder", async () => {
  const trackPath = join(fixtureRoot, "album", "track-two.flac");
  await mkdir(join(fixtureRoot, "album"), { recursive: true });
  await writeFile(trackPath, "b".repeat(4));

  await moveFile(trackPath, "delete");
  assert.equal(await exists(trackPath), false);

  const restored = await undoLastAction();

  assert.deepEqual(restored, {
    path: trackPath,
    action: "delete",
    remaining: 0,
  });
  assert.equal(await exists(trackPath), true);
  assert.equal(
    await exists(join(fixtureRoot, "riffl", "delete", "track-two.flac")),
    false,
  );
});

test("undoes actions in reverse order", async () => {
  const first = join(fixtureRoot, "first.mp3");
  const second = join(fixtureRoot, "second.mp3");
  const third = join(fixtureRoot, "third.mp3");
  await writeFile(first, "1");
  await writeFile(second, "2");
  await writeFile(third, "3");

  await moveFile(first, "keep");
  await moveFile(second, "skip");
  await moveFile(third, "delete");
  assert.equal(historyLength(), 3);

  const thirdUndo = await undoLastAction();
  assert.equal(thirdUndo?.path, third);
  assert.equal(thirdUndo?.action, "delete");
  assert.equal(thirdUndo?.remaining, 2);

  const secondUndo = await undoLastAction();
  assert.equal(secondUndo?.path, second);
  assert.equal(secondUndo?.remaining, 1);

  const firstUndo = await undoLastAction();
  assert.equal(firstUndo?.path, first);
  assert.equal(firstUndo?.remaining, 0);

  assert.equal(await exists(first), true);
  assert.equal(await exists(second), true);
  assert.equal(await exists(third), true);
  assert.equal(historyLength(), 0);
});

test("returns null when there is no action left to undo", async () => {
  assert.equal(historyLength(), 0);
  assert.equal(await undoLastAction(), null);
});
