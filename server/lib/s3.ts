import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";

const s3 = new S3Client({
  region: process.env.AWS_REGION ?? "us-east-1",
  credentials: process.env.AWS_ACCESS_KEY_ID ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  } : undefined,
});

const BUCKET = process.env.AWS_S3_BUCKET ?? "auditly-pbc";

export async function uploadToS3(params: {
  key: string;
  buffer: Buffer;
  contentType: string;
}): Promise<{ url: string; hash: string }> {
  const hash = crypto.createHash("sha256").update(params.buffer).digest("hex");

  if (!process.env.AWS_S3_BUCKET) {
    // Dev mode: skip S3, return a placeholder URL
    console.log(`[S3] No bucket configured. Would upload ${params.key} (${params.buffer.length} bytes, sha256: ${hash.slice(0, 16)}...)`);
    return { url: `https://placeholder-s3/${params.key}`, hash };
  }

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: params.key,
    Body: params.buffer,
    ContentType: params.contentType,
    ServerSideEncryption: "AES256",
  }));

  const url = `https://${BUCKET}.s3.${process.env.AWS_REGION ?? "us-east-1"}.amazonaws.com/${params.key}`;
  return { url, hash };
}

export async function getPresignedDownloadUrl(key: string, expiresInSeconds = 3600): Promise<string> {
  if (!process.env.AWS_S3_BUCKET) return `https://placeholder-s3/${key}`;
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, cmd, { expiresIn: expiresInSeconds });
}
