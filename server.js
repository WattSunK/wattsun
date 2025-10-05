import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import healthRouter, { setStartTime } from "./routes/health.js";

// ✅ Ensure .env is loaded from project directory (NAS-safe)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, ".env") });

const app = express();
const PORT = Number(process.env.PORT || 3101);

// Ensure canonical folders exist
const requiredDirs = [
  path.resolve(process.env.LOG_DIR || "./logs"),
  path.resolve(process.env.RUN_DIR || "./run"),
  path.resolve("./data/dev"),
  path.resolve("./docs"),
];
requiredDirs.forEach((d) => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, "public")));

// Health endpoint
setStartTime(Date.now());
app.use("/api/health", healthRouter);

// Root index for a quick “it’s up” signal
app.get("/", (_req, res) => {
  res
    .type("html")
    .send(`<pre>Tenant–Landlord Marketplace (dev)
GET /api/health → { ok: true, uptime, checks }</pre>`);
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Marketplace dev server listening on http://127.0.0.1:${PORT}`);
});
