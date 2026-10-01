import { createHash, createHmac } from "crypto";

type PresignMethod = "GET" | "PUT" | "DELETE" | "HEAD";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

function encodeRfc3986(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function hash(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function objectPath(bucket: string, key: string) {
  return `/${encodeRfc3986(bucket)}/${key.split("/").map(encodeRfc3986).join("/")}`;
}

export function createR2PresignedUrl(method: PresignMethod, key: string, expiresInSeconds = 300) {
  const accountId = required("R2_ACCOUNT_ID");
  const accessKeyId = required("R2_ACCESS_KEY_ID");
  const secretAccessKey = required("R2_SECRET_ACCESS_KEY");
  const bucket = required("R2_BUCKET_NAME");

  const host = `${accountId}.r2.cloudflarestorage.com`;
  const region = "auto";
  const service = "s3";
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresInSeconds),
    "X-Amz-SignedHeaders": "host",
  };

  const canonicalQuery = Object.entries(query)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${encodeRfc3986(name)}=${encodeRfc3986(value)}`)
    .join("&");

  const canonicalUri = objectPath(bucket, key);
  const canonicalRequest = [method, canonicalUri, canonicalQuery, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join(
    "\n",
  );

  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, hash(canonicalRequest)].join("\n");

  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, service);
  const signingKey = hmac(serviceKey, "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
