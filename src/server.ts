import express from "express";
import filesRoutes from "./routes/files.routes.js";

const app = express();

app.use(express.json())
app.use("/files", filesRoutes);
const PORT = 3000;

app.get("/", (_req, res) => {
  res.send('Ca marche!!')
})
app.listen(PORT, () => {
  console.log(`Riffl backend running on http://localhost:${PORT}`);
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "riffl"
})
})
