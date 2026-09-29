import assert from "node:assert/strict";
import { test } from "node:test";
import request from "supertest";
import { app } from "./app.js";

test("GET / answers with a welcome message", async () => {
  const response = await request(app).get("/");

  assert.equal(response.status, 200);
  assert.match(response.text, /Ca marche/);
});

test("GET /health reports the service status", async () => {
  const response = await request(app).get("/health");

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: "ok", service: "riffl" });
});
