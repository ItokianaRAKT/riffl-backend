import { Router } from "express";
import {
  moveFile,
  undoLastAction,
  type FileAction,
} from "../services/action.service.js";

const action = Router();

action.post("/", async (req, res) => {
  const { path, action: fileAction } = req.body;

  if (typeof path !== "string" || !path) {
    return res.status(400).json({
      error: "A valid file path is required",
    });
  }

  if (
    fileAction !== "keep" &&
    fileAction !== "skip" &&
    fileAction !== "delete"
  ) {
    return res.status(400).json({
      error: "Invalid action",
    });
  }

  try {
    await moveFile(path, fileAction as FileAction);

    return res.status(200).json({
      success: true,
      action: fileAction,
      path,
    });
  } catch {
    return res.status(500).json({
      error: "Unable to move file",
    });
  }
});

action.post("/undo", async (_req, res) => {
  try {
    const restored = await undoLastAction();

    if (!restored) {
      return res.status(400).json({
        error: "No sorted file to undo",
        code: "NOTHING_TO_UNDO",
      });
    }

    return res.status(200).json({
      success: true,
      ...restored,
    });
  } catch {
    return res.status(500).json({
      error: "Unable to restore file",
    });
  }
});

export default action;
