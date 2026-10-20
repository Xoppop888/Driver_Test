#!/usr/bin/env python3
"""Copy available local question images and download missing source images."""
from __future__ import annotations

import argparse
import json
import shutil
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen


def download_one(item: dict, out_dir: Path, local_dir: Path | None) -> tuple[str, str | None, str | None]:
    subject = item.get("subject")
    original_id = str(item.get("id"))
    source_url = item.get("url") or ""
    filename = f"s{subject}-{original_id}.jpg"
    target = out_dir / filename
    if target.exists() and target.stat().st_size > 100:
        return original_id, f"/images/{filename}", None

    if local_dir:
        local = local_dir / f"{original_id}.jpg"
        if local.exists() and local.stat().st_size > 100:
            shutil.copy2(local, target)
            return original_id, f"/images/{filename}", None

    if not source_url:
        return original_id, None, "missing source url"
    candidates = [source_url]
    if source_url.startswith("http://"):
        candidates.insert(0, "https://" + source_url[len("http://"):])
    last_error = None
    for url in candidates:
        try:
            request = Request(url, headers={"User-Agent": "DrivePrep/0.1 question-image-import"})
            with urlopen(request, timeout=35) as response:
                payload = response.read()
            if len(payload) < 100:
                raise ValueError("response too small")
            target.write_bytes(payload)
            return original_id, f"/images/{filename}", None
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
            time.sleep(0.1)
    return original_id, None, last_error or "download failed"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--local-dir", type=Path)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--workers", type=int, default=24)
    args = parser.parse_args()

    records = json.loads(args.source.read_text(encoding="utf-8"))
    records = [record for record in records if record.get("url")]
    args.output_dir.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, str] = {}
    failures: list[dict[str, str]] = []
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(download_one, item, args.output_dir, args.local_dir) for item in records]
        for position, future in enumerate(as_completed(futures), 1):
            original_id, path, error = future.result()
            if path:
                manifest[original_id] = path
            else:
                failures.append({"id": original_id, "error": error or "unknown"})
            if position % 100 == 0 or position == len(futures):
                print(f"Images processed {position}/{len(futures)}; downloaded {len(manifest)}; failed {len(failures)}", flush=True)

    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(json.dumps({"images": manifest, "failures": failures}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0 if not failures else 2


if __name__ == "__main__":
    raise SystemExit(main())
