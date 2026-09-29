import express from "express";
import filesRoutes from "./routes/files.routes.js";

export const app = express();

app.use(express.json());

app.use("/files", filesRoutes); // signifie que toutes les routes définies dans filesRoutes commencent par /files
