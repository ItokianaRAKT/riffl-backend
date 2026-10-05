import { execFile } from "node:child_process";
import { homedir } from "node:os";

export type PickerErrorCode = "PICKER_UNAVAILABLE";

export class PickerError extends Error {
  readonly code: PickerErrorCode;

  constructor(code: PickerErrorCode, message: string) {
    super(message);
    this.name = "PickerError";
    this.code = code;
  }
}

export interface CommandSpec {
  command: string;
  args: string[];
}

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export type Runner = (
  command: string,
  args: string[],
) => Promise<CommandResult>;

const DIALOG_TIMEOUT_MS = 120_000;
const DIALOG_PROMPT = "Select a music folder";

function hasGraphicalSession(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.DISPLAY || env.WAYLAND_DISPLAY);
}

export function candidateCommands(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): CommandSpec[] {
  switch (platform) {
    case "darwin":
      return [
        {
          command: "osascript",
          args: [
            "-e",
            `POSIX path of (choose folder with prompt "${DIALOG_PROMPT}")`,
          ],
        },
      ];
    case "win32":
      return [
        {
          command: "powershell",
          args: [
            "-NoProfile",
            "-STA",
            "-Command",
            `$b=(New-Object -ComObject Shell.Application).BrowseForFolder(0,'${DIALOG_PROMPT}',0); if($b){$b.Path}`,
          ],
        },
      ];
    case "linux": {
      if (!hasGraphicalSession(env)) {
        return [];
      }

      return [
        { command: "zenity", args: ["--file-selection", "--directory", "--title", DIALOG_PROMPT] },
        { command: "yad", args: ["--file", "--directory", "--title", DIALOG_PROMPT] },
        { command: "kdialog", args: ["--getexistingdirectory", homedir()] },
      ];
    }
    default:
      return [];
  }
}

function runCommand(command: string, args: string[]): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { encoding: "utf8", timeout: DIALOG_TIMEOUT_MS },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            Object.assign(error, {
              stderr: typeof stderr === "string" ? stderr : String(stderr),
            }),
          );
          return;
        }

        resolve({ stdout, stderr });
      },
    );
  });
}

function isMissingTool(error: NodeJS.ErrnoException): boolean {
  return error.code === "ENOENT";
}

function isDisplayFailure(stderr: string): boolean {
  return /display|wayland/i.test(stderr);
}

export async function openDirectoryDialog(
  commands: CommandSpec[],
  runner: Runner,
): Promise<string | null> {
  if (commands.length === 0) {
    throw new PickerError(
      "PICKER_UNAVAILABLE",
      "No native folder dialog is available on this system",
    );
  }

  for (const { command, args } of commands) {
    try {
      const { stdout } = await runner(command, args);
      const selectedPath = stdout.trim();

      return selectedPath ? selectedPath : null;
    } catch (error) {
      const failure = error as NodeJS.ErrnoException & {
        stderr?: string;
        killed?: boolean;
      };

      if (isMissingTool(failure)) {
        continue;
      }

      if (failure.killed) {
        return null;
      }

      if (isDisplayFailure(failure.stderr ?? "")) {
        throw new PickerError(
          "PICKER_UNAVAILABLE",
          "No graphical session is available to open the folder dialog",
        );
      }

      // A non zero exit without a display failure means the user cancelled.
      return null;
    }
  }

  throw new PickerError(
    "PICKER_UNAVAILABLE",
    "No native folder dialog is available on this system",
  );
}

export function pickDirectory(): Promise<string | null> {
  return openDirectoryDialog(
    candidateCommands(process.platform, process.env),
    runCommand,
  );
}
