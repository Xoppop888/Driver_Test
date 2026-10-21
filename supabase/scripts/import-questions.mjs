#!/usr/bin/env node
/**
 * Deterministically imports every DrivePrep question (Subject 1=2545,
 * Subject 4=1833). SHA-256(subject:id), then id, defines selection_rank.
 * Therefore ranks 1..100 are exactly the same stable rows/ranks as the legacy
 * 100-question importer. This script sends JSON records only: it never reads,
 * uploads, or writes image binaries; image_url is retained as plain text.
 *
 * Usage (from repository root):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node supabase/scripts/import-questions.mjs --write
 * Omit --write for deterministic validation/dry run.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const inputPath = path.join(root, "data", "questions.json");
const subjectCounts = new Map([[1, 2545], [4, 1833]]);
const legacyPerSubject = 100;
const writeBatchSize = 250;
const shouldWrite = process.argv.includes("--write");

function stableRank(question) {
  return createHash("sha256").update(`${question.subject}:${question.id}`).digest("hex");
}

function orderedQuestions(allQuestions, subject) {
  return allQuestions
    .filter((question) => question.subject === subject && typeof question.id === "string")
    .sort((a, b) => stableRank(a).localeCompare(stableRank(b)) || a.id.localeCompare(b.id));
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
    // Deliberately plain URL text only. No image file or binary field is sent.
    image_url: nullableString(question.image_url),
    source: question.source ?? {},
    translation_status: question.translation_status ?? {}
  };
}

function fingerprint(ids) {
  return createHash("sha256").update(ids.join("\n")).digest("hex").slice(0, 16);
}

const raw = JSON.parse(await readFile(inputPath, "utf8"));
if (!Array.isArray(raw)) throw new Error("data/questions.json must contain an array.");

const selected = [];
for (const [subject, expectedCount] of subjectCounts) {
  const ordered = orderedQuestions(raw, subject);
  if (ordered.length !== expectedCount) {
    throw new Error(`Subject ${subject} has ${ordered.length} candidates; expected exactly ${expectedCount}.`);
  }

  // This is intentionally kept as an assertion rather than a second selection
  // algorithm: the first 100 ordered IDs are the previous importer selection.
  const legacyIds = ordered.slice(0, legacyPerSubject).map((question) => question.id);
  const rankedIds = ordered.map((question) => question.id);
  if (legacyIds.some((id, index) => rankedIds[index] !== id)) {
    throw new Error(`Subject ${subject} no longer preserves legacy ranks 1..${legacyPerSubject}.`);
  }

  selected.push(...ordered.map((question, index) => toDbRecord(question, index + 1)));
  console.log(
    `Subject ${subject}: ${ordered.length} IDs, first-${legacyPerSubject} fingerprint ${fingerprint(legacyIds)}, ` +
    `first=${legacyIds[0]}, last=${ordered.at(-1)?.id}`
  );
}

if (selected.length !== 4378) throw new Error(`Expected 4378 total records; got ${selected.length}.`);
console.log(`Validated ${selected.length} records (Subject 1=2545, Subject 4=1833); write batch size=${writeBatchSize}.`);

if (!shouldWrite) {
  console.log("Dry run only. Re-run with --write and service-role environment variables to import.");
  process.exit(0);
}

const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required with --write.");
}

for (let start = 0; start < selected.length; start += writeBatchSize) {
  const batch = selected.slice(start, start + writeBatchSize);
  const response = await fetch(`${url}/rest/v1/question_bank?on_conflict=id`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify(batch)
  });
  if (!response.ok) throw new Error(`Supabase import failed at ${start + 1}-${start + batch.length} (${response.status}): ${await response.text()}`);
  console.log(`Imported ${start + 1}-${start + batch.length} of ${selected.length}.`);
}

console.log("Imported all 4,378 deterministic question records; image_url text only, no image binaries.");
