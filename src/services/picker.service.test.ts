import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PickerError,
  candidateCommands,
  openDirectoryDialog,
  type Runner,
} from "./picker.service.js";

interface RunnerOutcome {
  message?: string;
  code?: string | number;
  stdout?: string;
  stderr?: string;
  killed?: boolean;
}

function runnerFrom(results: RunnerOutcome[]): Runner {
  let call = 0;

  return async () => {
    const result = results[call];
    call += 1;

    if (!result) {
      throw new Error("Unexpected extra command");
    }

    if (result.message) {
      throw Object.assign(new Error(result.message), result);
    }

    return { stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  };
}

test("uses one dialog command per supported platform", () => {
  assert.deepEqual(
    candidateCommands("darwin", { DISPLAY: ":0" }).map((c) => c.command),
    ["osascript"],
  );
  assert.deepEqual(
    candidateCommands("win32", {}).map((c) => c.command),
    ["powershell"],
  );

  const linuxCommands = candidateCommands("linux", { DISPLAY: ":0" });
  assert.deepEqual(
    linuxCommands.map((c) => c.command),
    ["zenity", "yad", "kdialog"],
  );

  assert.deepEqual(candidateCommands("linux", {}), []);
  assert.deepEqual(candidateCommands("freebsd", { DISPLAY: ":0" }), []);
});

test("returns the selected path", async () => {
  const path = await openDirectoryDialog(
    [{ command: "zenity", args: [] }],
    runnerFrom([{ stdout: "/home/you/Music\n" }]),
  );

  assert.equal(path, "/home/you/Music");
});

test("returns null when the dialog is cancelled", async () => {
  const path = await openDirectoryDialog(
    [{ command: "zenity", args: [] }],
    runnerFrom([{ message: "cancelled", code: 1, stderr: "" }]),
  );

  assert.equal(path, null);
});

test("falls back to the next command when a tool is missing", async () => {
  const path = await openDirectoryDialog(
    [
      { command: "zenity", args: [] },
      { command: "kdialog", args: [] },
    ],
    runnerFrom([
      { message: "spawn zenity ENOENT", code: "ENOENT" },
      { stdout: "/home/you/Music\n" },
    ]),
  );

  assert.equal(path, "/home/you/Music");
});

test("throws PICKER_UNAVAILABLE when no tool is installed", async () => {
  await assert.rejects(
    openDirectoryDialog(
      [
        { command: "zenity", args: [] },
        { command: "kdialog", args: [] },
      ],
      runnerFrom([
        { message: "spawn zenity ENOENT", code: "ENOENT" },
        { message: "spawn kdialog ENOENT", code: "ENOENT" },
      ]),
    ),
    (error: unknown) =>
      error instanceof PickerError && error.code === "PICKER_UNAVAILABLE",
  );
});

test("throws PICKER_UNAVAILABLE without a graphical session", async () => {
  await assert.rejects(
    openDirectoryDialog(
      [{ command: "zenity", args: [] }],
      runnerFrom([{ message: "failed", code: 1, stderr: "cannot open display" }]),
    ),
    (error: unknown) =>
      error instanceof PickerError && error.code === "PICKER_UNAVAILABLE",
  );
});

test("throws PICKER_UNAVAILABLE when there is no dialog command", async () => {
  await assert.rejects(
    openDirectoryDialog([], async () => ({ stdout: "", stderr: "" })),
    (error: unknown) =>
      error instanceof PickerError && error.code === "PICKER_UNAVAILABLE",
  );
});
