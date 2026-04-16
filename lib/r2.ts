import { getRequestContext } from "@cloudflare/next-on-pages";
import {
  S3Client, GetObjectCommand, PutObjectCommand,
  ListObjectsV2Command, DeleteObjectsCommand,
} from "@aws-sdk/client-s3";

export const META_KEY = "_meta.json";
export type MetaMap = Record<string, { displayName: string }>;
export const ADMIN_PASSWORD = "1111";

// ── Minimal R2 binding types ─────────────────────────────────────────────────
interface R2Obj {
  key: string; size: number; uploaded: Date;
  httpMetadata?: { contentType?: string };
  body: ReadableStream;
  text(): Promise<string>;
}
interface R2Bucket {
  list(): Promise<{ objects: R2Obj[] }>;
  get(key: string, opts?: { range?: { offset?: number; length?: number; suffix?: number } }): Promise<R2Obj | null>;
  put(key: string, body: string | Uint8Array, opts?: { httpMetadata?: { contentType?: string } }): Promise<void>;
  delete(key: string): Promise<void>;
}
type CfEnv = { BUCKET?: R2Bucket; R2_PUBLIC_DOMAIN?: string };

// ── Cloudflare context ───────────────────────────────────────────────────────
function getCfEnv(): CfEnv | null {
  try { return getRequestContext().env as CfEnv; } catch { return null; }
}
function getR2(): R2Bucket | null {
  return getCfEnv()?.BUCKET ?? null;
}
export function getPublicDomain(): string {
  return getCfEnv()?.R2_PUBLIC_DOMAIN ?? process.env.R2_PUBLIC_DOMAIN ?? "";
}

// ── S3 client (local dev fallback) ───────────────────────────────────────────
function s3() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}
const bkt = () => process.env.R2_BUCKET_NAME!;

// ── File listing ─────────────────────────────────────────────────────────────
export async function listFiles(): Promise<{ key: string; size: number; lastModified: Date }[]> {
  const r2 = getR2();
  if (r2) {
    const res = await r2.list();
    return res.objects.map(o => ({ key: o.key, size: o.size, lastModified: o.uploaded }));
  }
  const res = await s3().send(new ListObjectsV2Command({ Bucket: bkt() }));
  return (res.Contents ?? []).map(o => ({ key: o.Key!, size: o.Size ?? 0, lastModified: o.LastModified ?? new Date() }));
}

// ── Get object (stream / download) ───────────────────────────────────────────
export async function fetchObject(key: string, range?: string): Promise<{
  body: ReadableStream; contentType: string;
  contentLength: number | null; contentRange: string | null; status: number;
} | null> {
  const r2 = getR2();
  if (r2) {
    type RangeOpt = { offset?: number; length?: number; suffix?: number };
    let rangeOpt: RangeOpt | undefined;
    let contentRange: string | null = null;
    if (range) {
      const m = range.match(/bytes=(\d*)-(\d*)/);
      if (m) {
        const s = m[1] ? parseInt(m[1]) : undefined;
        const e = m[2] ? parseInt(m[2]) : undefined;
        if (s !== undefined && e !== undefined) rangeOpt = { offset: s, length: e - s + 1 };
        else if (s !== undefined) rangeOpt = { offset: s };
        else if (e !== undefined) rangeOpt = { suffix: e };
      }
    }
    const obj = await r2.get(key, rangeOpt ? { range: rangeOpt } : undefined);
    if (!obj) return null;
    if (rangeOpt?.offset !== undefined) {
      const start = rangeOpt.offset;
      const end = rangeOpt.length ? start + rangeOpt.length - 1 : obj.size - 1;
      contentRange = `bytes ${start}-${end}/${obj.size}`;
    }
    return {
      body: obj.body,
      contentType: obj.httpMetadata?.contentType ?? "audio/mpeg",
      contentLength: obj.size,
      contentRange,
      status: range ? 206 : 200,
    };
  }
  // Local dev: S3
  try {
    const res = await s3().send(new GetObjectCommand({
      Bucket: bkt(), Key: key, ...(range ? { Range: range } : {}),
    }));
    const stream = res.Body?.transformToWebStream();
    if (!stream) return null;
    return {
      body: stream,
      contentType: res.ContentType ?? "audio/mpeg",
      contentLength: res.ContentLength ?? null,
      contentRange: res.ContentRange ?? null,
      status: range ? 206 : 200,
    };
  } catch { return null; }
}

// ── Upload ───────────────────────────────────────────────────────────────────
export async function uploadFile(key: string, body: Uint8Array, contentType: string): Promise<void> {
  const r2 = getR2();
  if (r2) { await r2.put(key, body, { httpMetadata: { contentType } }); return; }
  await s3().send(new PutObjectCommand({ Bucket: bkt(), Key: key, Body: body, ContentType: contentType }));
}

// ── Delete ───────────────────────────────────────────────────────────────────
export async function removeFiles(keys: string[]): Promise<void> {
  const r2 = getR2();
  if (r2) { await Promise.all(keys.map(k => r2.delete(k))); return; }
  await s3().send(new DeleteObjectsCommand({
    Bucket: bkt(), Delete: { Objects: keys.map(k => ({ Key: k })) },
  }));
}

// ── Meta ─────────────────────────────────────────────────────────────────────
export async function getMeta(): Promise<MetaMap> {
  const r2 = getR2();
  if (r2) {
    const obj = await r2.get(META_KEY);
    if (!obj) return {};
    try { return JSON.parse(await obj.text()) as MetaMap; } catch { return {}; }
  }
  try {
    const res = await s3().send(new GetObjectCommand({ Bucket: bkt(), Key: META_KEY }));
    const text = await res.Body?.transformToString();
    return text ? JSON.parse(text) as MetaMap : {};
  } catch { return {}; }
}

export async function saveMeta(meta: MetaMap): Promise<void> {
  const r2 = getR2();
  const body = JSON.stringify(meta);
  if (r2) { await r2.put(META_KEY, body, { httpMetadata: { contentType: "application/json" } }); return; }
  await s3().send(new PutObjectCommand({ Bucket: bkt(), Key: META_KEY, Body: body, ContentType: "application/json" }));
}
