import { statSync } from "node:fs";
import { Router } from "express";
import { readCover, TagError } from "../services/tags.service.js";

const cover = Router();

function queryPath(rawPath: unknown): string | undefined {
  if (typeof rawPath === "string") {
    return rawPath;
  }

  if (Array.isArray(rawPath) && typeof rawPath[0] === "string") {
    return rawPath[0];
  }

  return undefined;
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

cover.get("/", (req, res) => {
  const pathParam = queryPath(req.query.path);

  if (!pathParam) {
    return res.status(400).json({
      error: "Missing required query parameter: path",
      code: "PATH_MISSING",
    });
  }

  if (!isFile(pathParam)) {
    return res.status(404).json({
      error: "File not found",
      code: "FILE_NOT_FOUND",
    });
  }

  try {
    const artwork = readCover(pathParam);

    if (!artwork) {
      return res.status(404).json({
        error: "No cover art found",
        code: "NO_COVER",
      });
    }

    res.set("Content-Type", artwork.mimeType);
    res.set("Cache-Control", "private, max-age=3600");
    return res.send(Buffer.from(artwork.data));
  } catch (error) {
    if (error instanceof TagError) {
      return res.status(422).json({
        error: error.message,
        code: "TAG_READ_FAILED",
      });
    }

    console.error("Unexpected error while reading cover art:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default cover;
