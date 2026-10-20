#!/usr/bin/env python3
"""Build the app's normalized bilingual question JSON."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

TYPE_MAP = {1: "single_choice", 2: "multiple_choice", 3: "true_false"}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--translations", type=Path, required=True)
    parser.add_argument("--image-manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    source = json.loads(args.source.read_text(encoding="utf-8"))
    translations = {str(row["id"]): row for row in json.loads(args.translations.read_text(encoding="utf-8"))}
    image_data = json.loads(args.image_manifest.read_text(encoding="utf-8"))
    images = image_data.get("images", {})
    failures = image_data.get("failures", [])
    if failures:
        raise SystemExit(f"Image manifest contains {len(failures)} failures")

    output: list[dict[str, Any]] = []
    missing: list[str] = []
    for item in source:
        original_id = str(item["id"])
        translated = translations.get(original_id)
        if translated is None:
            missing.append(original_id)
            continue
        options_count = len(item.get("itemsDescArray", []))
        options_ru = translated.get("options_ru", [])
        options_en = translated.get("options_en", [])
        if len(options_ru) != options_count or len(options_en) != options_count:
            raise SystemExit(f"{original_id}: option count mismatch")
        labels = item.get("itemsTitleArray", [])
        answer_tokens = [token.strip() for token in str(item.get("answer", "")).split(",") if token.strip()]
        indices = [labels.index(token) for token in answer_tokens]
        q_type = TYPE_MAP[item["type"]]
        output.append({
            "id": f"doupoa:s{item['subject']}:{original_id}",
            "subject": item["subject"],
            "type": q_type,
            "question_ru": translated["question_ru"],
            "question_en": translated["question_en"],
            "options_ru": options_ru,
            "options_en": options_en,
            "correct_index": indices[0] if q_type != "multiple_choice" else None,
            "correct_indices": indices,
            "explanation_ru": translated.get("explanation_ru"),
            "explanation_en": translated.get("explanation_en"),
            "image_url": images.get(original_id),
            "source": {
                "repository": "https://github.com/doupoa/DrivingTestSubjectOne",
                "path": "q.json",
                "original_id": original_id,
                "revision": "0111991bdc6a383a2a979047ba58135de8b5b7f2",
                "data_updated_at": "2022-07-17",
                "source_image_url": item.get("url") or None,
            },
            "translation_status": {"ru": "machine", "en": "machine"},
        })
    if missing:
        raise SystemExit(f"Missing translations: {len(missing)}; first IDs: {missing[:5]}")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"built {len(output)} normalized records")
    print(f"subject1={sum(row['subject'] == 1 for row in output)} subject4={sum(row['subject'] == 4 for row in output)}")
    print(f"with_images={sum(bool(row['image_url']) for row in output)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
