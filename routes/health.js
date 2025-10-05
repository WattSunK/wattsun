import fs from "fs";
import path from "path";

let START_TIME_MS = Date.now();
export const setStartTime = (ms) => { START_TIME_MS = ms; };

const checkWritable = (dir) => {
  try {
    const testFile = path.join(dir, `.probe_${Date.now()}.tmp`);
    fs.writeFileSync(testFile, "ok");
    fs.unlinkSync(testFile);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};

const requiredEnv = ["PORT", "DB_PATH", "SESSION_SECRET", "LOG_DIR", "RUN_DIR"];

export default function healthRouter(req, res, next) {
  const route = async (_req, _res) => {
    const uptimeSec = Math.floor((Date.now() - START_TIME_MS) / 1000);

    const missingEnv = requiredEnv.filter((k) => !process.env[k]);
    const dbPath = process.env.DB_PATH || "./data/dev/marketplace.dev.db";

    const checks = {
      env: {
        ok: missingEnv.length === 0,
        missing: missingEnv
      },
      paths: {
        dataDevExists: fs.existsSync(path.resolve("./data/dev")),
        docsExists: fs.existsSync(path.resolve("./docs"))
      },
      db: {
        path: dbPath,
        exists: fs.existsSync(path.resolve(dbPath))
      },
      writable: {
        logs: checkWritable(path.resolve(process.env.LOG_DIR || "./logs")),
        run: checkWritable(path.resolve(process.env.RUN_DIR || "./run"))
      }
    };

    const ok =
      checks.env.ok &&
      checks.paths.dataDevExists &&
      checks.writable.logs.ok &&
      checks.writable.run.ok;

    return _res.json({ ok, uptime: uptimeSec, checks });
  };

  return route(req, res, next);
}
