import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

export const META_KEY = "_meta.json";
export type MetaMap = Record<string, { displayName: string }>;

/**
 * リクエスト時に S3 クライアントを生成する（モジュール初期化時ではない）
 * Cloudflare Workers では process.env はリクエスト時に解決されるため
 */
export function createS3Client(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

export function getBucketName(): string {
  return process.env.R2_BUCKET_NAME!;
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
