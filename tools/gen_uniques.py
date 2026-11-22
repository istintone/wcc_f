#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""カードが初めから持つ固有タグの表を書き出す(→docs/23 §23.4)。

    python tools/gen_uniques.py

  入力  tools/unique_source.txt   (カードの id | 名前 | 型)
  出力  src/js/uniques.js         UNIQUE_CARDS = { id: { name, kind } }
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).parent.parent
SRC = ROOT / "tools" / "unique_source.txt"
OUT = ROOT / "src" / "js" / "uniques.js"
KINDS = {"striker", "speedster", "magic", "flair", "maestro", "wall", "keeper", "runner"}


def main():
    rows = {}
    for n, line in enumerate(SRC.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) != 3 or parts[2] not in KINDS:
            sys.exit("%d 行目: 「id | 名前 | 型」の形にする(型は %s)" % (n, " ".join(sorted(KINDS))))
        rows[parts[0]] = {"name": parts[1], "kind": parts[2]}
    js = ["/* 生成物。手で編集しない。 python tools/gen_uniques.py が tools/unique_source.txt から書き出す(→docs/23 §23.4)。 */",
          "const UNIQUE_CARDS=" + json.dumps(rows, ensure_ascii=False) + ";", ""]
    OUT.write_bytes("\n".join(js).encode("utf-8"))
    print("ok", len(rows), "枚")


if __name__ == "__main__":
    main()
