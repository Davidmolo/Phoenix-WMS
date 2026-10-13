import fs from "fs";
import path from "path";
import crypto from "crypto";
import { env } from "../config/env";

export function bolUploadsRoot() {
  return path.resolve(env.uploadsDir, "bol");
}

export function ensureBolDir(shipmentId: string) {
  const dir = path.join(bolUploadsRoot(), String(shipmentId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Save a data-URL image; returns relative path from uploads root (posix-ish). */
export function saveDataUrlImage(opts: {
  shipmentId: string;
  dataUrl: string;
  prefix: string;
}): string {
  const m = String(opts.dataUrl || "").match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i);
  if (!m) {
    throw new Error("Photo/signature must be a PNG or JPEG data URL");
  }
  const ext = m[1].toLowerCase().includes("png")
    ? "png"
    : m[1].toLowerCase().includes("webp")
      ? "webp"
      : "jpg";
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 6 * 1024 * 1024) {
    throw new Error("Image too large (max 6 MB)");
  }
  const dir = ensureBolDir(opts.shipmentId);
  const name = `${opts.prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
  fs.writeFileSync(path.join(dir, name), buf);
  return path.posix.join("bol", String(opts.shipmentId), name);
}

export function saveBolHtmlDocument(opts: {
  shipmentId: string;
  bolNumber: string;
  html: string;
  sequence: number;
}): string {
  const dir = ensureBolDir(opts.shipmentId);
  const safe = String(opts.bolNumber || "BOL").replace(/[^A-Za-z0-9_-]+/g, "_");
  const name = `${safe}-v${opts.sequence}.html`;
  fs.writeFileSync(path.join(dir, name), opts.html, "utf8");
  return path.posix.join("bol", String(opts.shipmentId), name);
}

export function resolveUploadPath(relativePath: string): string {
  const rel = String(relativePath || "").replace(/^[/\\]+/, "");
  const full = path.resolve(env.uploadsDir, rel);
  if (!full.startsWith(path.resolve(env.uploadsDir))) {
    throw new Error("Invalid upload path");
  }
  return full;
}

export function readUploadFile(relativePath: string): Buffer {
  return fs.readFileSync(resolveUploadPath(relativePath));
}
