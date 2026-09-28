import express from "express";

const app = express();

app.use(express.json())
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
