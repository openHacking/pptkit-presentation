import path from "node:path";

export function mimeTypeForAsset(assetId: string) {
  const extension = path.extname(assetId).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".gif") return "image/gif";
  if (extension === ".svg") return "image/svg+xml";
  return "image/png";
}

export function resolveNodeAsset(assetId: string, mimeType = mimeTypeForAsset(assetId)) {
  const value = path.resolve("assets", assetId);
  return { source: { type: "path" as const, value }, mimeType, dedupeKey: value };
}
