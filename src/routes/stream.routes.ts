import { Router } from "express";
import {
  StreamError,
  openStream,
  parseRangeHeader,
  resolveTarget,
  type StreamErrorCode,
} from "../services/stream.service.js";

const stream = Router();

const ERROR_STATUS: Record<StreamErrorCode, number> = {
  PATH_MISSING: 400,
  FILE_NOT_FOUND: 404,
};

stream.get("/", async (req, res) => {
  const rawPath = req.query.path;
  const pathParam = typeof rawPath === "string" ? rawPath : undefined;

  let target;
  try {
    target = await resolveTarget(pathParam);
  } catch (error) {
    if (error instanceof StreamError) {
      return res.status(ERROR_STATUS[error.code]).json({ error: error.message });
    }

    console.error("Unexpected error while resolving the stream path:", error);
    return res.status(500).json({ error: "Internal server error" });
  }

  const range = parseRangeHeader(req.headers.range, target.size);

  if (range === "unsatisfiable") {
    return res.status(416).set("Content-Range", `bytes */${target.size}`).json({
      error: "Range not satisfiable",
    });
  }

  if (range) {
    res.status(206).set({
      "Content-Range": `bytes ${range.start}-${range.end}/${target.size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": String(range.end - range.start + 1),
    });
  } else {
    res.status(200).set({
      "Accept-Ranges": "bytes",
      "Content-Length": String(target.size),
    });
  }

  const byteRange = range ?? { start: 0, end: target.size - 1 };
  const fileStream = openStream(target.path, byteRange);
  fileStream.on("error", () => res.destroy());
  fileStream.pipe(res);
});

export default stream;
