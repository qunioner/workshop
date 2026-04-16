import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const META_KEY = "_meta.json";
export type MetaMap = Record<string, { displayName: string }>;

interface Env {
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET_NAME: string;
  R2_PUBLIC_DOMAIN: string;
  ADMIN_PASSWORD: string;
}

/**
 * 環境変数を取得する
 * Cloudflare Pages: getRequestContext().env を使用
 * ローカル開発: process.env にフォールバック
 */
export function getEnv(): Env {
  try {
    return getRequestContext().env as unknown as Env;
  } catch {
    return {
      R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID ?? "",
      R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID ?? "",
      R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY ?? "",
      R2_BUCKET_NAME: process.env.R2_BUCKET_NAME ?? "",
      R2_PUBLIC_DOMAIN: process.env.R2_PUBLIC_DOMAIN ?? "",
      ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? "",
    };
  }
}

export function createS3Client(): S3Client {
  const env = getEnv();
  return new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
}

export function getBucketName(): string {
  return getEnv().R2_BUCKET_NAME;
}

/** R2 に保存した _meta.json を読み込む */
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

/** _meta.json を R2 に書き込む */
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
