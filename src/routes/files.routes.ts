import { Router, type Response } from "express";
import {
  ScanError,
  listDirectories,
  scanDirectory,
  type ScanErrorCode,
} from "../services/files.service.js";

const router = Router();

const ERROR_STATUS: Record<ScanErrorCode, number> = {
  PATH_MISSING: 400,
  PATH_NOT_FOUND: 404,
  PATH_NOT_DIRECTORY: 422,
  PATH_NOT_ACCESSIBLE: 403,
  PATH_READ_ERROR: 500,
};

function sendFileError(res: Response, error: unknown, context: string): Response {
  if (error instanceof ScanError) {
    const status = ERROR_STATUS[error.code];

    if (status >= 500) {
      console.error(`Unexpected error while ${context}:`, error);
    }

    return res.status(status).json({ error: error.message, code: error.code });
  }

  console.error(`Unexpected error while ${context}:`, error);
  return res.status(500).json({ error: "Internal server error" });
}

router.get("/", (_req, res) => {
  res.send("File route works!")
})

router.get("/scan", async (req, res) => {
  const rawPath = req.query.path;
  const pathParam =
    typeof rawPath === "string"
      ? rawPath
      : Array.isArray(rawPath) && typeof rawPath[0] === "string"
        ? rawPath[0]
        : undefined;

  if (!pathParam) {
    return res.status(400).json({
      error: "Missing required query parameter: path",
      code: "PATH_MISSING",
    });
  }

  try {
    const result = await scanDirectory(pathParam);
    return res.json(result);
  } catch (error) {
    return sendFileError(res, error, "scanning the directory");
  }
});

router.get("/directories", async (req, res) => {
  const rawPath = req.query.path;
  let pathParam: string | undefined;

  if (rawPath === undefined) {
    pathParam = undefined;
  } else if (typeof rawPath === "string") {
    pathParam = rawPath;
  } else if (Array.isArray(rawPath) && typeof rawPath[0] === "string") {
    pathParam = rawPath[0];
  } else {
    return res.status(400).json({
      error: "Invalid query parameter: path",
      code: "PATH_MISSING",
    });
  }

  try {
    const result = await listDirectories(pathParam);
    return res.json(result);
  } catch (error) {
    return sendFileError(res, error, "listing the directories");
  }
});

export default router;
