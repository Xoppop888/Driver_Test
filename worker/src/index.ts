import {
  constantTimeEqual,
  createAccessCode,
  createSessionToken,
  createTelegramPairingCode,
  deriveTelegramWebhookSecret,
  hashAccessCode,
  hashSessionToken,
  hashTelegramPairingCode,
} from "./crypto";

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  CODE_PEPPER: string;
  ADMIN_KEY?: string;
  CORS_ORIGINS: string;
  /** Cloudflare Worker secret; never configure this as a public var. */
  TELEGRAM_BOT_TOKEN?: string;
}

type RuntimeConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
  codePepper: string;
  adminKey: string;
};

type QuestionMode = "legacy" | "practice" | "exam";
type TelegramDeliveryStatus = "pending" | "delivered" | "failed";

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

type RpcTelegramPairing = {
  ok: boolean;
  code?: "invalid_request" | "invalid_pairing_code" | "admin_already_paired";
  paired?: boolean;
  duplicate?: boolean;
};

type RpcTelegramBatch = {
  ok: boolean;
  code?: "invalid_request" | "telegram_not_admin";
  duplicate?: boolean;
  batch_id?: string;
  delivery_status?: TelegramDeliveryStatus | null;
};

type TelegramUpdate = {
  update_id?: unknown;
  message?: {
    text?: unknown;
    chat?: { id?: unknown; type?: unknown };
    from?: { id?: unknown; is_bot?: unknown };
  };
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
  if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.CODE_PEPPER) {
    throw new Error("Worker secret is not configured");
  }
  // Study endpoints do not depend on the administrative key. The admin routes
  // validate its strength separately in assertAdmin().
  const adminKey = env.ADMIN_KEY?.trim() ?? "";
  if (env.CODE_PEPPER.length < 32 || adminKey.length > 256) {
    throw new Error("Worker secret does not meet length requirements");
  }
  return {
    supabaseUrl,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    codePepper: env.CODE_PEPPER,
    adminKey,
  };
}

function telegramBotToken(env: Env): string {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token || token.length > 256) {
    throw new ApiError(503, "telegram_not_configured", "Telegram administration is not configured.");
  }
  return token;
}

function assertAdmin(request: Request, config: RuntimeConfig): void {
  if (config.adminKey.length < 32) {
    throw new ApiError(503, "admin_key_too_weak", "Administrative access is not configured securely.");
  }
  const suppliedKey = request.headers.get("X-Admin-Key") ?? "";
  if (!constantTimeEqual(suppliedKey, config.adminKey)) {
    throw new ApiError(401, "unauthorized", "Admin authorization failed.");
  }
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

function questionMode(value: string | null): QuestionMode {
  // Old deployed clients omit mode and expect the original 100 premium rows.
  if (value === null) return "legacy";
  if (value === "practice") return "practice";
  if (value === "exam") return "exam";
  throw new ApiError(400, "invalid_mode", "mode must be practice or exam.");
}

function nonNegativeQueryInteger(value: string | null, field: string, fallback: number): number {
  if (value === null) return fallback;
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw new ApiError(400, "invalid_request", `${field} is invalid.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new ApiError(400, "invalid_request", `${field} is invalid.`);
  }
  return parsed;
}

function practiceLimit(value: string | null): number {
  const limit = nonNegativeQueryInteger(value, "limit", 50);
  if (limit < 1 || limit > 50) {
    throw new ApiError(400, "invalid_limit", "limit must be an integer from 1 to 50.");
  }
  return limit;
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
  const headers = new Headers({
    apikey: config.serviceRoleKey,
    "Content-Type": "application/json",
  });
  // Modern sb_secret_ keys are not JWTs; only legacy service_role keys belong
  // in Authorization: Bearer, or Supabase rejects the request as an invalid JWT.
  if (!config.serviceRoleKey.startsWith("sb_secret_")) {
    headers.set("Authorization", `Bearer ${config.serviceRoleKey}`);
  }

  const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // The status is checked below; a non-JSON proxy response is never exposed.
  }
  if (!response.ok) {
    // Do not log RPC bodies: some calls intentionally process one-time values.
    console.error("Supabase RPC failed", { name, status: response.status });
    throw new ApiError(502, "backend_unavailable", "The access service is temporarily unavailable.");
  }
  // get_question_bank returns a JSONB array as a scalar RPC result. Do not
  // mistake that array for PostgREST's SETOF response envelope.
  if (name === "get_question_bank") return body as T;
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

function secureRandomInt(maxExclusive: number): number {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > 0x1_0000_0000) {
    throw new Error("invalid random range");
  }
  const range = 0x1_0000_0000;
  const ceiling = Math.floor(range / maxExclusive) * maxExclusive;
  const value = new Uint32Array(1);
  do {
    crypto.getRandomValues(value);
  } while (value[0] >= ceiling);
  return value[0] % maxExclusive;
}

function sampleQuestionIds(questionIds: string[], count: number): string[] {
  const sample = [...questionIds];
  const take = Math.min(count, sample.length);
  for (let index = 0; index < take; index += 1) {
    const swapIndex = index + secureRandomInt(sample.length - index);
    [sample[index], sample[swapIndex]] = [sample[swapIndex], sample[index]];
  }
  return sample.slice(0, take);
}

async function getQuestionChunk(config: RuntimeConfig, questionIds: string[]): Promise<unknown[]> {
  if (questionIds.length === 0) return [];
  if (questionIds.length > 100) throw new Error("question chunk exceeds RPC maximum");
  const questions = await supabaseRpc<unknown[]>(config, "get_question_bank", {
    p_question_ids: questionIds,
  });
  if (!Array.isArray(questions) || questions.length !== questionIds.length) {
    throw new ApiError(502, "backend_unavailable", "The access service is temporarily unavailable.");
  }
  return questions;
}

async function handleQuestions(request: Request, env: Env): Promise<Response> {
  const config = getRuntimeConfig(env);
  const url = new URL(request.url);
  const id = installationId(url.searchParams.get("installationId"));
  const selectedSubject = subject(url.searchParams.get("subject"));
  const mode = questionMode(url.searchParams.get("mode"));
  const offset = nonNegativeQueryInteger(url.searchParams.get("offset"), "offset", 0);
  const limit = practiceLimit(url.searchParams.get("limit"));
  if (mode === "exam" && offset !== 0) {
    throw new ApiError(400, "invalid_offset", "exam offset must be 0.");
  }
  const token = bearerToken(request, true);

  const issue = await supabaseRpc<RpcIssue>(config, "issue_question_access", {
    p_installation_id: id,
    p_subject: selectedSubject,
    p_token_hash: token ? await hashSessionToken(token, config.codePepper) : null,
  });
  if (!issue?.ok || !Array.isArray(issue.question_ids)) rpcFailure(issue);

  const total = issue.question_ids.length;
  let questionIds: string[];
  let nextOffset: number | null;
  if (mode === "legacy") {
    // Preserve the prior frontend's complete premium set until Pages is updated.
    questionIds = issue.question_ids.slice(0, issue.premium === true ? 100 : 50);
    nextOffset = null;
  } else if (mode === "practice") {
    questionIds = issue.question_ids.slice(offset, offset + limit);
    nextOffset = offset + questionIds.length < total ? offset + questionIds.length : null;
  } else {
    // Free users' 50 IDs are the Shanghai-day allocation selected from the full
    // bank. Premium users are freshly sampled from their complete subject pool.
    questionIds = sampleQuestionIds(issue.question_ids, issue.premium === true ? 100 : 50);
    nextOffset = null;
  }

  const questions = await getQuestionChunk(config, questionIds);
  return json({
    questions,
    remaining: issue.remaining ?? null,
    resetAt: issue.reset_at ?? null,
    premium: issue.premium === true,
    total,
    nextOffset,
  });
}

async function handleQuestionLookup(request: Request, env: Env): Promise<Response> {
  const config = getRuntimeConfig(env);
  const body = await readJsonObject(request);
  const id = installationId(body.installationId);
  if (!Array.isArray(body.questionIds) || body.questionIds.length < 1 || body.questionIds.length > 100) {
    throw new ApiError(400, "invalid_question_ids", "questionIds must contain from 1 to 100 values.");
  }
  const requestedIds = Array.from(new Set(body.questionIds.map((value) => requiredString(value, "questionId", 128))));
  const token = bearerToken(request, true);
  const tokenHash = token ? await hashSessionToken(token, config.codePepper) : null;

  // Mistakes may span both Subjects. Intersect requested IDs with the caller's
  // current free pools or valid premium entitlements before retrieving records.
  const allowedIds = new Set<string>();
  for (const selectedSubject of [1, 4] as const) {
    const issue = await supabaseRpc<RpcIssue>(config, "issue_question_access", {
      p_installation_id: id,
      p_subject: selectedSubject,
      p_token_hash: tokenHash,
    });
    if (!issue?.ok || !Array.isArray(issue.question_ids)) rpcFailure(issue);
    for (const questionId of issue.question_ids) {
      if (typeof questionId === "string") allowedIds.add(questionId);
    }
  }

  const permittedIds = requestedIds.filter((questionId) => allowedIds.has(questionId));
  const questions = await getQuestionChunk(config, permittedIds);
  return json({ questions });
}

async function handleCreateCodes(request: Request, env: Env): Promise<Response> {
  const config = getRuntimeConfig(env);
  assertAdmin(request, config);

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

  // Plaintext values are returned only to the administrator in this response.
  return json({ codes });
}

type TelegramApiEnvelope<T> = { ok?: boolean; result?: T };

async function telegramApi<T>(
  botToken: string,
  method: string,
  body: BodyInit,
  headers: HeadersInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: "POST",
      headers,
      body,
    });
  } catch {
    throw new ApiError(502, "telegram_unavailable", "Telegram delivery is temporarily unavailable.");
  }

  let payload: TelegramApiEnvelope<T> | null = null;
  try {
    payload = await response.json() as TelegramApiEnvelope<T>;
  } catch {
    // Do not expose or log third-party response bodies.
  }
  if (!response.ok || payload?.ok !== true) {
    throw new ApiError(502, "telegram_unavailable", "Telegram delivery is temporarily unavailable.");
  }
  return payload.result as T;
}

async function telegramJson<T>(botToken: string, method: string, payload: unknown): Promise<T> {
  return telegramApi<T>(botToken, method, JSON.stringify(payload), { "Content-Type": "application/json" });
}

async function sendTelegramMessage(botToken: string, chatId: number, text: string): Promise<void> {
  await telegramJson(botToken, "sendMessage", { chat_id: String(chatId), text });
}

async function sendTelegramCodesDocument(botToken: string, chatId: number, codes: string[]): Promise<void> {
  // A document avoids Telegram's 4096-character sendMessage limit. The CSV is
  // held only in this request body; it is never logged or persisted by us.
  const csv = `access_code\r\n${codes.join("\r\n")}\r\n`;
  const form = new FormData();
  form.set("chat_id", String(chatId));
  form.set("caption", `Generated ${codes.length} DrivePrep access code${codes.length === 1 ? "" : "s"}. Store this file securely.`);
  form.set("document", new Blob([csv], { type: "text/csv;charset=utf-8" }), "driveprep-access-codes.csv");
  await telegramApi(botToken, "sendDocument", form);
}

async function handleTelegramSetup(request: Request, env: Env): Promise<Response> {
  const config = getRuntimeConfig(env);
  assertAdmin(request, config);
  const botToken = telegramBotToken(env);
  const webhookUrl = new URL(request.url);
  if (webhookUrl.protocol !== "https:") {
    throw new ApiError(400, "invalid_webhook_origin", "Telegram webhook origin must use HTTPS.");
  }

  await telegramJson(botToken, "setWebhook", {
    url: `${webhookUrl.origin}/v1/telegram/webhook`,
    allowed_updates: ["message"],
    secret_token: await deriveTelegramWebhookSecret(botToken),
  });
  return json({ ok: true });
}

async function handleTelegramPairingCode(request: Request, env: Env): Promise<Response> {
  const config = getRuntimeConfig(env);
  assertAdmin(request, config);
  const pairingCode = createTelegramPairingCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const result = await supabaseRpc<{ ok: boolean; code?: string }>(config, "create_telegram_pairing_code", {
    p_code_hash: await hashTelegramPairingCode(pairingCode, config.codePepper),
    p_expires_at: expiresAt,
  });
  if (!result?.ok) rpcFailure(result);

  // This is the only response containing the pairing plaintext. Never log it.
  return json({ code: pairingCode, expiresAt });
}

function positiveSafeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function privateTelegramCommand(update: TelegramUpdate): {
  updateId: number;
  chatId: number;
  userId: number;
  text: string;
} | null {
  const updateId = positiveSafeInteger(update.update_id);
  const message = update.message;
  const chatId = positiveSafeInteger(message?.chat?.id);
  const userId = positiveSafeInteger(message?.from?.id);
  if (!updateId || !chatId || !userId || message?.chat?.type !== "private" || message?.from?.is_bot === true || typeof message?.text !== "string") {
    return null;
  }
  return { updateId, chatId, userId, text: message.text };
}

async function markTelegramDelivery(
  config: RuntimeConfig,
  updateId: number,
  status: "delivered" | "failed",
): Promise<void> {
  // This is bookkeeping only. The update claim remains the anti-duplication
  // boundary even if a transient status update is unavailable.
  try {
    await supabaseRpc<{ ok: boolean }>(config, "mark_telegram_batch_delivery", {
      p_update_id: updateId,
      p_delivery_status: status,
    });
  } catch {
    // Avoid logging values associated with a one-time code delivery.
  }
}

async function handleTelegramWebhook(request: Request, env: Env): Promise<Response> {
  const config = getRuntimeConfig(env);
  const botToken = telegramBotToken(env);
  const expectedSecret = await deriveTelegramWebhookSecret(botToken);
  const suppliedSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
  if (!constantTimeEqual(suppliedSecret, expectedSecret)) {
    return json({ ok: false }, 401);
  }

  let update: TelegramUpdate;
  try {
    update = await request.json() as TelegramUpdate;
  } catch {
    return json({ ok: true });
  }
  const command = privateTelegramCommand(update);
  if (!command) return json({ ok: true });

  const pair = /^\/pair(?:@[A-Za-z0-9_]{1,64})?\s+([A-Za-z0-9-]{6,128})\s*$/i.exec(command.text);
  if (pair) {
    const result = await supabaseRpc<RpcTelegramPairing>(config, "claim_telegram_pairing", {
      p_update_id: command.updateId,
      p_chat_id: command.chatId,
      p_user_id: command.userId,
      p_code_hash: await hashTelegramPairingCode(pair[1], config.codePepper),
    });
    if (result?.duplicate) return json({ ok: true });
    if (result?.ok && result.paired) {
      await sendTelegramMessage(botToken, command.chatId, "Paired. You can now use /generate N (1-100).");
    } else if (result?.code === "invalid_pairing_code") {
      await sendTelegramMessage(botToken, command.chatId, "Pairing code is invalid or expired.");
    } else if (result?.code === "admin_already_paired") {
      await sendTelegramMessage(botToken, command.chatId, "An administrator private chat is already paired.");
    }
    return json({ ok: true });
  }

  const generate = /^\/generate(?:@[A-Za-z0-9_]{1,64})?\s+([0-9]{1,3})\s*$/i.exec(command.text);
  if (!generate) return json({ ok: true });
  const count = Number(generate[1]);
  if (!Number.isInteger(count) || count < 1 || count > 100) return json({ ok: true });

  // Codes are generated only in memory. The atomic RPC stores their hashes and
  // claims update_id in the same transaction before any Telegram delivery.
  const codes = Array.from({ length: count }, createAccessCode);
  const codeHashes = await Promise.all(codes.map((code) => hashAccessCode(code, config.codePepper)));
  const result = await supabaseRpc<RpcTelegramBatch>(config, "claim_telegram_code_batch", {
    p_update_id: command.updateId,
    p_chat_id: command.chatId,
    p_user_id: command.userId,
    p_code_hashes: codeHashes,
    p_note: `Telegram /generate ${count}`,
  });

  // All non-admin commands are silently ignored, including malformed claims.
  if (!result?.ok || result.code === "telegram_not_admin") return json({ ok: true });
  if (result.duplicate) {
    if (result.delivery_status !== "delivered") {
      try {
        await sendTelegramMessage(
          botToken,
          command.chatId,
          "A previous /generate request was already processed, but its code file cannot be resent. If no file arrived, issue a new /generate N command.",
        );
      } catch {
        // The webhook acknowledgement still prevents duplicate minting.
      }
    }
    return json({ ok: true });
  }

  try {
    await sendTelegramCodesDocument(botToken, command.chatId, codes);
    await markTelegramDelivery(config, command.updateId, "delivered");
    return json({ ok: true });
  } catch {
    await markTelegramDelivery(config, command.updateId, "failed");
    // A Telegram retry is safe: it sees the claimed update and receives only a
    // sanitized instruction, never a newly minted plaintext batch.
    throw new ApiError(502, "telegram_delivery_failed", "Telegram document delivery could not be completed.");
  }
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if ((url.pathname === "/health" || url.pathname === "/v1/health") && request.method === "GET") {
    return json({ ok: true, service: "driveprep-access-api" });
  }
  if (url.pathname === "/v1/access/redeem" && request.method === "POST") return handleRedeem(request, env);
  if (url.pathname === "/v1/access/session" && request.method === "GET") return handleSession(request, env);
  if (url.pathname === "/v1/questions" && request.method === "GET") return handleQuestions(request, env);
  if (url.pathname === "/v1/questions/lookup" && request.method === "POST") return handleQuestionLookup(request, env);
  if (url.pathname === "/v1/admin/access-codes" && request.method === "POST") return handleCreateCodes(request, env);
  if (url.pathname === "/v1/admin/telegram/setup" && request.method === "POST") return handleTelegramSetup(request, env);
  if (url.pathname === "/v1/admin/telegram/pairing-code" && request.method === "POST") return handleTelegramPairingCode(request, env);
  if (url.pathname === "/v1/telegram/webhook" && request.method === "POST") return handleTelegramWebhook(request, env);
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
      // Do not include request bodies or environment values in logs.
      console.error("Unhandled Worker error", error instanceof Error ? error.name : "unknown");
      return withCors(
        json({ error: "The access service is temporarily unavailable.", code: "internal_error" }, 500),
        cors,
      );
    }
  },
};

export default handler;
