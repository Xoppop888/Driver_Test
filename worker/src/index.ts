import {
  constantTimeEqual,
  createAccessCode,
  createSessionToken,
  hashAccessCode,
  hashSessionToken,
} from "./crypto";

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  CODE_PEPPER: string;
  ADMIN_KEY: string;
  CORS_ORIGINS: string;
}

type RuntimeConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
  codePepper: string;
  adminKey: string;
};

type RpcIssue = {
  ok: boolean;
  code?: string;
  question_ids?: string[];
  remaining?: number | null;
  reset_at?: string | null;
  premium?: boolean;
};

type RpcEntitlement = {
  unlocked: boolean;
  status?: "free" | "premium";
  expires_at?: string | null;
  installation_id?: string;
};

type RpcRedeem = {
  ok: boolean;
  code?: string;
  status?: "premium";
  expires_at?: string;
};

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "application/json; charset=utf-8");
  responseHeaders.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

function errorResponse(error: ApiError): Response {
  return json({ error: error.message, code: error.code }, error.status);
}

function getRuntimeConfig(env: Env): RuntimeConfig {
  const supabaseUrl = env.SUPABASE_URL?.replace(/\/$/, "");
  if (!supabaseUrl || !/^https?:\/\//.test(supabaseUrl)) {
    throw new Error("SUPABASE_URL is not configured");
  }
  if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.CODE_PEPPER || !env.ADMIN_KEY) {
    throw new Error("Worker secret is not configured");
  }
  if (env.CODE_PEPPER.length < 32 || env.ADMIN_KEY.length > 256) {
    throw new Error("Worker secret does not meet length requirements");
  }
  return {
    supabaseUrl,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    codePepper: env.CODE_PEPPER,
    adminKey: env.ADMIN_KEY,
  };
}

function corsHeaders(request: Request, env: Env): Headers | null {
  const origin = request.headers.get("Origin");
  if (!origin) return new Headers({ Vary: "Origin" });

  const origins = (env.CORS_ORIGINS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!origins.includes(origin)) return null;

  return new Headers({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Admin-Key",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  });
}

function withCors(response: Response, cors: Headers): Response {
  const headers = new Headers(response.headers);
  cors.forEach((value, key) => headers.set(key, value));
  return new Response(response.body, { status: response.status, headers });
}

async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ApiError(400, "invalid_request", "Request body must be an object.");
  }
  return parsed as Record<string, unknown>;
}

function requiredString(value: unknown, field: string, maxLength = 256): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new ApiError(400, "invalid_request", `${field} is invalid.`);
  }
  return value.trim();
}

function installationId(value: unknown): string {
  const id = requiredString(value, "installationId", 128);
  if (id.length < 8 || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(id)) {
    throw new ApiError(400, "invalid_installation_id", "installationId is invalid.");
  }
  return id;
}

function subject(value: string | null): 1 | 4 {
  if (value === "1") return 1;
  if (value === "4") return 4;
  throw new ApiError(400, "invalid_subject", "subject must be 1 or 4.");
}

function bearerToken(request: Request, optional = false): string | null {
  const value = request.headers.get("Authorization");
  if (!value && optional) return null;
  if (!value?.startsWith("Bearer ") || value.length <= "Bearer ".length) {
    throw new ApiError(401, "invalid_authorization", "A valid Bearer token is required.");
  }
  return value.slice("Bearer ".length).trim();
}

function unwrapRpc<T>(data: unknown): T {
  // PostgREST emits an array for SETOF RPCs and an object for jsonb scalar RPCs.
  if (Array.isArray(data)) return data[0] as T;
  return data as T;
}

async function supabaseRpc<T>(config: RuntimeConfig, name: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // The status is checked below; a non-JSON proxy response is never exposed.
  }
  if (!response.ok) {
    console.error("Supabase RPC failed", { name, status: response.status, body });
    throw new ApiError(502, "backend_unavailable", "The access service is temporarily unavailable.");
  }
  return unwrapRpc<T>(body);
}

function rpcFailure(result: { code?: string } | null | undefined): never {
  const code = result?.code ?? "backend_unavailable";
  if (code === "invalid_session") {
    throw new ApiError(401, code, "The access session is invalid or expired.");
  }
  if (code === "invalid_code") {
    throw new ApiError(400, code, "The access code is invalid, expired, or already used.");
  }
  if (code === "invalid_request") {
    throw new ApiError(400, code, "The request is invalid.");
  }
  if (code === "question_bank_unseeded") {
    throw new ApiError(503, code, "The question bank has not been imported yet.");
  }
  throw new ApiError(502, "backend_unavailable", "The access service is temporarily unavailable.");
}

async function handleRedeem(request: Request, env: Env): Promise<Response> {
  const config = getRuntimeConfig(env);
  const body = await readJsonObject(request);
  const code = requiredString(body.code, "code", 128);
  const id = installationId(body.installationId);
  const rawToken = createSessionToken();
  const sessionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const result = await supabaseRpc<RpcRedeem>(config, "redeem_access_code", {
    p_code_hash: await hashAccessCode(code, config.codePepper),
    p_installation_id: id,
    p_token_hash: await hashSessionToken(rawToken, config.codePepper),
    p_session_expires_at: sessionExpiresAt,
  });
  if (!result?.ok || result.status !== "premium" || !result.expires_at) rpcFailure(result);

  return json({
    ok: true,
    token: rawToken,
    expiresAt: result.expires_at,
    status: result.status,
  });
}

async function handleSession(request: Request, env: Env): Promise<Response> {
  const config = getRuntimeConfig(env);
  const token = bearerToken(request);
  const result = await supabaseRpc<RpcEntitlement>(config, "get_session_entitlement", {
    p_token_hash: await hashSessionToken(token!, config.codePepper),
  });

  return json({
    unlocked: result?.unlocked === true,
    expiresAt: result?.expires_at ?? null,
  });
}

async function handleQuestions(request: Request, env: Env): Promise<Response> {
  const config = getRuntimeConfig(env);
  const url = new URL(request.url);
  const id = installationId(url.searchParams.get("installationId"));
  const selectedSubject = subject(url.searchParams.get("subject"));
  const token = bearerToken(request, true);

  const issue = await supabaseRpc<RpcIssue>(config, "issue_question_access", {
    p_installation_id: id,
    p_subject: selectedSubject,
    p_token_hash: token ? await hashSessionToken(token, config.codePepper) : null,
  });
  if (!issue?.ok || !Array.isArray(issue.question_ids)) rpcFailure(issue);

  const questions = await supabaseRpc<unknown[]>(config, "get_question_bank", {
    p_question_ids: issue.question_ids,
  });
  if (!Array.isArray(questions) || questions.length !== issue.question_ids.length) {
    throw new ApiError(502, "backend_unavailable", "The access service is temporarily unavailable.");
  }

  // This endpoint is intentionally practice-only. It returns correct indices so
  // the existing client-side practice flow can score answers. No exam endpoint
  // or client-controllable exam scoring state is introduced here.
  return json({
    questions,
    remaining: issue.remaining ?? null,
    resetAt: issue.reset_at ?? null,
    premium: issue.premium === true,
  });
}

async function handleCreateCodes(request: Request, env: Env): Promise<Response> {
  const config = getRuntimeConfig(env);
  const suppliedKey = request.headers.get("X-Admin-Key") ?? "";
  if (!constantTimeEqual(suppliedKey, config.adminKey)) {
    throw new ApiError(401, "unauthorized", "Admin authorization failed.");
  }

  const body = await readJsonObject(request);
  const count = body.count;
  if (!Number.isInteger(count) || (count as number) < 1 || (count as number) > 100) {
    throw new ApiError(400, "invalid_count", "count must be an integer from 1 to 100.");
  }

  let expiresAt: string | null = null;
  if (body.expiresAt !== undefined && body.expiresAt !== null) {
    const parsed = new Date(requiredString(body.expiresAt, "expiresAt", 64));
    if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
      throw new ApiError(400, "invalid_expires_at", "expiresAt must be a future ISO-8601 timestamp.");
    }
    expiresAt = parsed.toISOString();
  }

  let note: string | null = null;
  if (body.note !== undefined && body.note !== null) {
    note = requiredString(body.note, "note", 500);
  }

  const codes = Array.from({ length: count as number }, createAccessCode);
  const codeHashes = await Promise.all(codes.map((code) => hashAccessCode(code, config.codePepper)));
  const result = await supabaseRpc<{ ok: boolean; code?: string }>(config, "create_access_code_batch", {
    p_code_hashes: codeHashes,
    p_expires_at: expiresAt,
    p_note: note,
  });
  if (!result?.ok) rpcFailure(result);

  // Plaintext values are returned only to the admin in this one response.
  return json({ codes });
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if ((url.pathname === "/health" || url.pathname === "/v1/health") && request.method === "GET") {
    return json({ ok: true, service: "driveprep-access-api" });
  }
  if (url.pathname === "/v1/access/redeem" && request.method === "POST") return handleRedeem(request, env);
  if (url.pathname === "/v1/access/session" && request.method === "GET") return handleSession(request, env);
  if (url.pathname === "/v1/questions" && request.method === "GET") return handleQuestions(request, env);
  if (url.pathname === "/v1/admin/access-codes" && request.method === "POST") return handleCreateCodes(request, env);
  throw new ApiError(404, "not_found", "Route not found.");
}

interface WorkerHandler {
  fetch(request: Request, env: Env): Promise<Response>;
}

const handler: WorkerHandler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(request, env);
    if (!cors) return json({ error: "Origin is not allowed.", code: "cors_forbidden" }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    try {
      return withCors(await route(request, env), cors);
    } catch (error) {
      if (error instanceof ApiError) return withCors(errorResponse(error), cors);
      console.error("Unhandled Worker error", error);
      return withCors(
        json({ error: "The access service is temporarily unavailable.", code: "internal_error" }, 500),
        cors,
      );
    }
  },
};

export default handler;
