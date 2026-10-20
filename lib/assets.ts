export function assetPath(path: string | null) {
  if (!path) return null;
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return `${basePath}${path}`;
}
