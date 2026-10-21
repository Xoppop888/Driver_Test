#!/usr/bin/env node
/**
 * Imports exactly 100 stable questions for Subject 1 and Subject 4.
 * Selection is deterministic: SHA-256(subject:id), then id. No question text
 * or image assets are modified; image_url is preserved exactly as in the JSON.
 *
 * Usage (from repository root):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node supabase/scripts/import-questions.mjs --write
 * Omit --write to validate and print the deterministic selection only.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const inputPath = path.join(root, "data", "questions.json");
const subjects = [1, 4];
const perSubject = 100;
const shouldWrite = process.argv.includes("--write");

function stableRank(question) {
  return createHash("sha256").update(`${question.subject}:${question.id}`).digest("hex");
}

function selectQuestions(allQuestions, subject) {
  const candidates = allQuestions
    .filter((question) => question.subject === subject && typeof question.id === "string")
    .sort((a, b) => stableRank(a).localeCompare(stableRank(b)) || a.id.localeCompare(b.id));

  if (candidates.length < perSubject) {
    throw new Error(`Subject ${subject} has ${candidates.length} candidates; expected at least ${perSubject}.`);
  }
  return candidates.slice(0, perSubject);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function nullableString(value) {
  return typeof value === "string" ? value : null;
}

function toDbRecord(question, selectionRank) {
  return {
    id: question.id,
    subject: question.subject,
    selection_rank: selectionRank,
    type: nullableString(question.type) ?? "single_choice",
    question_ru: nullableString(question.question_ru) ?? "",
    question_en: nullableString(question.question_en) ?? "",
    options_ru: asArray(question.options_ru),
    options_en: asArray(question.options_en),
    correct_index: Number.isInteger(question.correct_index) ? question.correct_index : null,
    correct_indices: asArray(question.correct_indices).filter(Number.isInteger),
    explanation_ru: nullableString(question.explanation_ru),
    explanation_en: nullableString(question.explanation_en),
    image_url: nullableString(question.image_url),
    source: question.source ?? {},
    translation_status: question.translation_status ?? {}
  };
}

const raw = JSON.parse(await readFile(inputPath, "utf8"));
if (!Array.isArray(raw)) throw new Error("data/questions.json must contain an array.");

const selected = subjects.flatMap((subject) =>
  selectQuestions(raw, subject).map((question, index) => toDbRecord(question, index + 1))
);

console.log(`Validated ${selected.length} records: ${subjects.map((subject) => `Subject ${subject}=100`).join(", ")}.`);
for (const subject of subjects) {
  const ids = selected.filter((question) => question.subject === subject).map((question) => question.id);
  const fingerprint = createHash("sha256").update(ids.join("\n")).digest("hex").slice(0, 16);
  console.log(`Subject ${subject}: 100 IDs, selection fingerprint ${fingerprint}, first=${ids[0]}, last=${ids.at(-1)}`);
}

if (!shouldWrite) {
  console.log("Dry run only. Re-run with --write and service-role environment variables to import.");
  process.exit(0);
}

const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required with --write.");
}

const response = await fetch(`${url}/rest/v1/question_bank?on_conflict=id`, {
  method: "POST",
  headers: {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=minimal"
  },
  body: JSON.stringify(selected)
});
if (!response.ok) throw new Error(`Supabase import failed (${response.status}): ${await response.text()}`);

console.log("Imported 200 deterministically selected question records.");
