#!/usr/bin/env python3
r"""Diff flow/05-contract.md endpoint tables against a live /openapi.json.

Parses ALL markdown table rows shaped "| METHOD | `/path` | ... |" anywhere in
flow/05-contract.md (no hardcoded section list, so new contract sections are picked
up automatically), and compares the (method, path) set against the live OpenAPI spec.

Usage:
    python3 .claude/skills/contract-check/check_contract.py [base_url]

Default base_url: http://localhost:${API_HOST_PORT:-8800}
"""
from __future__ import annotations

import json
import re
import sys
import urllib.request
from pathlib import Path

METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE"}
ROW_RE = re.compile(
    r"^\|\s*(GET|POST|PUT|PATCH|DELETE)\s*\|\s*`([^`]+)`\s*\|", re.MULTILINE
)


def load_contract_endpoints(contract_path: Path) -> set[tuple[str, str]]:
    text = contract_path.read_text()
    return {(m.group(1), m.group(2)) for m in ROW_RE.finditer(text)}


def load_live_endpoints(base_url: str) -> set[tuple[str, str]]:
    url = f"{base_url.rstrip('/')}/openapi.json"
    with urllib.request.urlopen(url, timeout=15) as resp:
        spec = json.loads(resp.read().decode())
    live: set[tuple[str, str]] = set()
    for path, methods in spec.get("paths", {}).items():
        for method in methods:
            if method.upper() in METHODS:
                live.add((method.upper(), path))
    return live


def main() -> int:
    repo_root = Path(__file__).resolve().parents[3]
    contract_path = repo_root / "flow" / "05-contract.md"
    base_url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8800"

    contract = load_contract_endpoints(contract_path)
    try:
        live = load_live_endpoints(base_url)
    except Exception as exc:  # noqa: BLE001 - report and exit non-zero
        print(f"Could not fetch {base_url}/openapi.json: {exc}")
        return 2

    missing_in_runtime = sorted(contract - live)
    undocumented = sorted(live - contract)

    print(f"Contract endpoints: {len(contract)}  Live endpoints: {len(live)}")

    if missing_in_runtime:
        print("\nIn flow/05-contract.md but NOT live (build gap or drift):")
        for method, path in missing_in_runtime:
            print(f"  {method:6} {path}")

    if undocumented:
        print("\nLive but NOT in flow/05-contract.md (undocumented / stale contract):")
        for method, path in undocumented:
            print(f"  {method:6} {path}")

    if not missing_in_runtime and not undocumented:
        print("\nNo drift: contract and live OpenAPI match.")
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
