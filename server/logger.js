import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const logDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "logs");
const logFile = path.join(logDir, "app.log");

function ensureLogDir() {
  fs.mkdirSync(logDir, { recursive: true });
}

function serializeMeta(meta) {
  if (meta == null) return "";
  if (meta instanceof Error) {
    return ` ${JSON.stringify({ name: meta.name, message: meta.message, stack: meta.stack })}`;
  }
  try {
    return ` ${JSON.stringify(meta)}`;
  } catch {
    return ` ${String(meta)}`;
  }
}

function write(level, message, meta) {
  ensureLogDir();
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}${serializeMeta(meta)}\n`;
  try {
    fs.appendFileSync(logFile, line, "utf8");
  } catch (error) {
    console.error("Failed to write app.log:", error.message);
  }

  if (level === "error") console.error(message, meta ?? "");
  else if (level === "warn") console.warn(message, meta ?? "");
  else console.log(message, meta ?? "");
}

export const logger = {
  info(message, meta) {
    write("info", message, meta);
  },
  warn(message, meta) {
    write("warn", message, meta);
  },
  error(message, meta) {
    write("error", message, meta);
  },
  get filePath() {
    return logFile;
  },
};
