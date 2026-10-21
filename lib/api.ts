import type { Question, Subject } from "@/lib/questions";
import { getInstallationId, useStudyStore } from "@/lib/store";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");

export type QuestionSet = {
  questions: Question[];
  remaining: number | null;
  resetAt: string | null;
  premium: boolean;
  total: number;
  nextOffset: number | null;
};

export type QuestionMode = "practice" | "exam";

export type QuestionSetRequest = {
  mode: QuestionMode;
  offset?: number;
  limit?: number;
};

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_BASE_URL) {
    throw new ApiError("DrivePrep API is not configured.", "API_NOT_CONFIGURED", 503);
  }

  const token = useStudyStore.getState().accessToken;
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  if (init?.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/v1${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Unable to reach DrivePrep API.", "NETWORK_ERROR", 0);
  }

  const payload = await response.json().catch(() => null) as { error?: string; code?: string } | null;
  if (!response.ok) {
    throw new ApiError(
      payload?.error || "The request could not be completed.",
      payload?.code || "REQUEST_FAILED",
      response.status,
    );
  }
  return payload as T;
}

export async function redeemAccessCode(code: string) {
  return request<{ ok: true; token: string; expiresAt: string; status: string }>("/access/redeem", {
    method: "POST",
    body: JSON.stringify({ code, installationId: getInstallationId() }),
  });
}

export async function getAccessSession() {
  return request<{ unlocked: boolean; expiresAt: string | null }>("/access/session");
}

export async function getQuestionSet(subject: Subject, options: QuestionSetRequest): Promise<QuestionSet> {
  const query = new URLSearchParams({
    subject: String(subject),
    installationId: getInstallationId(),
    mode: options.mode,
    offset: String(options.offset ?? 0),
    limit: String(options.limit ?? 50),
  });
  return request<QuestionSet>(`/questions?${query.toString()}`);
}

/**
 * Requests only locally recorded mistake IDs. The API is responsible for
 * withholding IDs outside the caller's active premium session or free pool.
 */
export async function lookupQuestions(questionIds: string[]): Promise<Question[]> {
  const uniqueIds = Array.from(new Set(questionIds));
  if (!uniqueIds.length) return [];
  const found: Question[] = [];
  for (let offset = 0; offset < uniqueIds.length; offset += 100) {
    const result = await request<{ questions: Question[] }>("/questions/lookup", {
      method: "POST",
      body: JSON.stringify({ installationId: getInstallationId(), questionIds: uniqueIds.slice(offset, offset + 100) }),
    });
    found.push(...result.questions);
  }
  return found;
}

export async function generateAccessCodes(input: { count: number; expiresAt: string | null; note: string }, adminKey: string) {
  return request<{ codes: string[] }>("/admin/access-codes", {
    method: "POST",
    headers: { "X-Admin-Key": adminKey },
    body: JSON.stringify(input),
  });
}

export async function setupTelegramBot(adminKey: string) {
  return request<{ ok: true; botUsername?: string }>("/admin/telegram/setup", {
    method: "POST",
    headers: { "X-Admin-Key": adminKey },
  });
}

export async function createTelegramPairingCode(adminKey: string) {
  return request<{ code: string; expiresAt?: string | null }>("/admin/telegram/pairing-code", {
    method: "POST",
    headers: { "X-Admin-Key": adminKey },
  });
}

export function getApiBaseUrl() {
  return API_BASE_URL || null;
}
