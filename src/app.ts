import express from "express";
import filesRoutes from "./routes/files.routes.js";
import streamRoutes from "./routes/stream.routes.js";
import action from "./routes/action.routes.js";

export const app = express();

app.use(express.json());

app.use("/files", filesRoutes); // signifie que toutes les routes définies dans filesRoutes commencent par /files

app.get("/", (_req, res) => {
  res.send("Ca marche!!");
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "riffl",
  });
});

app.use("/stream", streamRoutes)

app.use("/action", action);
