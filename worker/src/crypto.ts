const encoder = new TextEncoder();

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The code's display formatting is intentionally not part of its hash. */
export function normalizeAccessCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function hashAccessCode(code: string, pepper: string): Promise<string> {
  return sha256Hex(`driveprep:access-code:v1:${normalizeAccessCode(code)}:${pepper}`);
}

export async function hashSessionToken(token: string, pepper: string): Promise<string> {
  return sha256Hex(`driveprep:session:v1:${token}:${pepper}`);
}

function randomHex(bytes: number): string {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(values, (value) => value.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** 128 bits of entropy; hyphens are for humans and are stripped before hashing. */
export function createAccessCode(): string {
  const hex = randomHex(16);
  return `DP-${hex.match(/.{1,4}/g)?.join("-") ?? hex}`;
}

/** URL-safe opaque bearer token with 256 bits of entropy. */
export function createSessionToken(): string {
  const values = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const value of values) binary += String.fromCharCode(value);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/**
 * Compares up to a fixed maximum, rather than returning on the first mismatch.
 * Runtime configuration limits ADMIN_KEY to this maximum as well.
 */
export function constantTimeEqual(left: string, right: string): boolean {
  const comparisonWidth = 256;
  let different = left.length ^ right.length;
  for (let index = 0; index < comparisonWidth; index += 1) {
    different |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return different === 0;
}
