import { Router } from "express";
const stream = Router();
import fs from "node:fs"

stream.get("/", (req, res) => {
  const filePath = req.query.path;
  if (typeof filePath !== "string" || !filePath) {
    return res.status(400).json({ error: "A file path is required" });
  }

  let fileSize: number;
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) throw new Error("Not a file");
    fileSize = stat.size;
  } catch {
    return res.status(404).json({ error: "File not found" });
  }

  const range = req.headers.range;
  let start = 0;
  let end = fileSize - 1;
  if (range) {
    const [rawStart, rawEnd] = range.replace("bytes=", "").split("-");
    start = Number(rawStart) || 0;
    end = rawEnd ? Math.min(Number(rawEnd), fileSize - 1) : fileSize - 1;
    if (start > end || start >= fileSize) {
      return res.status(416).set("Content-Range", `bytes */${fileSize}`).json({
        error: "Range not satisfiable",
      });
    }
  }

  if (range) {
    res.status(206).set({
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": String(end - start + 1),
    });
  } else {
    res.status(200).set({ "Accept-Ranges": "bytes", "Content-Length": String(fileSize) });
  }

  const fileStream = fs.createReadStream(filePath, { start, end });
  fileStream.on("error", () => res.destroy());   // évite le crash du serveur
  fileStream.pipe(res);                          // PLUS DE res.sendFile()
});

export default stream;
