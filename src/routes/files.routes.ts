import { Router } from "express";
import {
  ScanError,
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
    if (error instanceof ScanError) {
      const status = ERROR_STATUS[error.code];

      if (status >= 500) {
        console.error("Unexpected error while scanning directory:", error);
      }

      return res.status(status).json({ error: error.message, code: error.code });
    }

    console.error("Unexpected error while scanning directory:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
