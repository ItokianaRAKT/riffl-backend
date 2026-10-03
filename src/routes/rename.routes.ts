import { Router } from "express";
import {
  renameTrack,
  RenameError,
  type RenameErrorCode,
} from "../services/rename.service.js";

const rename = Router();

const ERROR_STATUS: Record<RenameErrorCode, number> = {
  PATH_MISSING: 400,
  TITLE_MISSING: 400,
  TITLE_INVALID: 400,
  TITLE_TOO_LONG: 400,
  ARTIST_INVALID: 400,
  EXTENSION_NOT_ALLOWED: 400,
  FILE_NOT_FOUND: 404,
  TRACK_ALREADY_SORTED: 409,
  NAME_CONFLICT: 409,
  TAG_WRITE_FAILED: 422,
  RENAME_FAILED: 500,
};

rename.post("/", async (req, res) => {
  try {
    const result = await renameTrack(req.body ?? {});

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    if (error instanceof RenameError) {
      const status = ERROR_STATUS[error.code];

      if (status >= 500) {
        console.error("Unexpected error while renaming track:", error);
      }

      return res.status(status).json({
        error: error.message,
        code: error.code,
      });
    }

    console.error("Unexpected error while renaming track:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default rename;
