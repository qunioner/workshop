import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const META_KEY = "_meta.json";
export type MetaMap = Record<string, { displayName: string }>;

// 管理画面パスワード（直接記述）
export const ADMIN_PASSWORD = "1111";

function getEnv(): Record<string, string> {
  try {
    const ctx = getRequestContext();
    return ctx.env as Record<string, string>;
  } catch {
    // ローカル開発時は process.env を使用
    return process.env as Record<string, string>;
  }
}

export function getPublicDomain(): string {
  return getEnv().R2_PUBLIC_DOMAIN ?? "";
}

export function createS3Client(): S3Client {
  const env = getEnv();
  return new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID ?? "",
      secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? "",
    },
  });
}

export function getBucketName(): string {
  return getEnv().R2_BUCKET_NAME ?? "";
}

export async function getMeta(): Promise<MetaMap> {
  const s3 = createS3Client();
  try {
    const res = await s3.send(
      new GetObjectCommand({ Bucket: getBucketName(), Key: META_KEY })
    );
    const text = await res.Body?.transformToString();
    return text ? (JSON.parse(text) as MetaMap) : {};
  } catch {
    return {};
  }
}

export async function saveMeta(meta: MetaMap): Promise<void> {
  const s3 = createS3Client();
  await s3.send(
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: META_KEY,
      Body: JSON.stringify(meta),
      ContentType: "application/json",
    })
  );
}
