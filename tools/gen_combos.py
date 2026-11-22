#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""特別なコンビの表を書き出す(→docs/23 §23.3b)。

    python tools/gen_combos.py

  入力  tools/combo_source.txt   (カードの id | コンビの名前 | 軸)
  出力  src/js/combos.js         SPECIAL_COMBOS = [ { id, name, ids:[...], ax }, ... ]
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).parent.parent
SRC = ROOT / "tools" / "combo_source.txt"
OUT = ROOT / "src" / "js" / "combos.js"
AXES = set("ODSPRC")


def main():
    rows = []
    for n, line in enumerate(SRC.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) != 3:
            sys.exit("%d 行目: 「id … | 名前 | 軸」の形にする" % n)
        ids, name, ax = parts[0].split(), parts[1], parts[2]
        if not 2 <= len(ids) <= 5 or ax not in AXES:
            sys.exit("%d 行目: カードは2〜5枚、軸は O D S P R C のどれか" % n)
        rows.append({"id": "sp%02d" % (len(rows) + 1), "name": name, "ids": ids, "ax": ax})
    js = ["/* 生成物。手で編集しない。 python tools/gen_combos.py が tools/combo_source.txt から書き出す(→docs/23 §23.3b)。 */",
          "const SPECIAL_COMBOS=" + json.dumps(rows, ensure_ascii=False) + ";", ""]
    OUT.write_bytes("\n".join(js).encode("utf-8"))
    print("ok", len(rows), "組")


if __name__ == "__main__":
    main()
