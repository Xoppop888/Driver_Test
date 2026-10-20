#!/usr/bin/env python3
"""Translate the full question bank in resumable batches with fallback splitting."""
from __future__ import annotations

import argparse
import json
import os
import re
import time
from pathlib import Path
from typing import Any

from openai import OpenAI

MODEL = "gpt-6-luna"
SYSTEM = """You translate Chinese driving-theory questions for a bilingual RU/EN study app.
Return one output object for every input object, keeping every id and option order exactly unchanged.
Translate faithfully into natural Russian and English. Preserve negation, numbers, units,
road-sign terms and legal meaning. Never invent facts. Strip HTML. Explanations may be null
only when the input explanation is empty. Return JSON only as an object with an `items` array."""


def clean(value: Any) -> str:
    if not value:
        return ""
    text = re.sub(r"<br\s*/?>", "\n", str(value), flags=re.I)
    text = re.sub(r"</p\s*>", "\n", text, flags=re.I)
    return re.sub(r"<[^>]+>", "", text).strip()


def explanation(item: dict[str, Any]) -> str:
    return clean(item.get("remark")) or clean(item.get("answerSkillExplain")) or clean(item.get("answerSkill"))


def request_batch(client: OpenAI, batch: list[dict[str, Any]]) -> list[dict[str, Any]]:
    payload = [{
        "id": str(item["id"]),
        "type": {1: "single_choice", 2: "multiple_choice", 3: "true_false"}.get(item.get("type"), "unknown"),
        "question_zh": clean(item.get("question")),
        "options_zh": [clean(x) for x in item.get("itemsDescArray", [])],
        "explanation_zh": explanation(item) or None,
    } for item in batch]
    prompt = json.dumps({"items": payload}, ensure_ascii=False)
    expected_ids = [str(item["id"]) for item in batch]
    last_error: Exception | None = None
    for attempt in range(1, 5):
        try:
            response = client.chat.completions.create(
                model=MODEL,
                messages=[{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                max_completion_tokens=30000,
                extra_body={"reasoning": {"effort": "low"}},
            )
            if not response.choices:
                raise ValueError(f"empty choices: {response.model_dump_json()[:1000]}")
            parsed = json.loads(response.choices[0].message.content or "{}")
            rows = parsed.get("items", [])
            by_id = {str(row.get("id")): row for row in rows}
            if set(by_id) != set(expected_ids):
                raise ValueError(f"id set mismatch: expected {len(expected_ids)}, got {len(by_id)}")
            ordered = [by_id[item_id] for item_id in expected_ids]
            for translated, original in zip(ordered, batch):
                expected_options = len(original.get("itemsDescArray", []))
                if len(translated.get("options_ru", [])) != expected_options or len(translated.get("options_en", [])) != expected_options:
                    raise ValueError(f"option count mismatch for {original['id']}")
                for field in ("question_ru", "question_en"):
                    if not str(translated.get(field, "")).strip():
                        raise ValueError(f"empty {field} for {original['id']}")
            return ordered
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            print(f"batch {len(batch)} attempt {attempt} failed: {exc}", flush=True)
            if attempt < 4:
                time.sleep(2 ** (attempt - 1))
    if len(batch) > 1:
        midpoint = len(batch) // 2
        print(f"splitting failed batch of {len(batch)} into {midpoint}+{len(batch) - midpoint}", flush=True)
        return request_batch(client, batch[:midpoint]) + request_batch(client, batch[midpoint:])
    raise RuntimeError(f"single question failed: {last_error}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--checkpoint-dir", type=Path, required=True)
    parser.add_argument("--batch-size", type=int, default=20)
    parser.add_argument("--sleep", type=float, default=0.05)
    args = parser.parse_args()
    if not os.getenv("OPENAI_API_KEY") or not os.getenv("OPENAI_API_BASE"):
        raise SystemExit("OPENAI_API_KEY and OPENAI_API_BASE must be configured")

    source = json.loads(args.source.read_text(encoding="utf-8"))
    args.checkpoint_dir.mkdir(parents=True, exist_ok=True)
    client = OpenAI(timeout=240, max_retries=2)
    all_rows: list[dict[str, Any]] = []
    total_batches = (len(source) + args.batch_size - 1) // args.batch_size
    for batch_no, start in enumerate(range(0, len(source), args.batch_size), 1):
        batch = source[start : start + args.batch_size]
        checkpoint = args.checkpoint_dir / f"batch-{batch_no:04d}.json"
        if checkpoint.exists():
            rows = json.loads(checkpoint.read_text(encoding="utf-8"))
            all_rows.extend(rows)
            print(f"[{batch_no}/{total_batches}] reused {len(rows)}", flush=True)
            continue
        rows = request_batch(client, batch)
        checkpoint.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        all_rows.extend(rows)
        print(f"[{batch_no}/{total_batches}] translated {len(rows)} (total {len(all_rows)}/{len(source)})", flush=True)
        time.sleep(args.sleep)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(all_rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"finished: {len(all_rows)} records -> {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
