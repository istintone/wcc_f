#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""レアKP の表を src/js/rarekp.js に書き出す(→docs/11)。

    python tools/gen_rarekp.py

  入力  tools/rarekp_source.txt   1行1枚: カードの No. | 固有名 | 技(- は技なし)
  出力  src/js/rarekp.js          RARE_KP = { "mcb01":{ name:"…", mv:"godsave" }, ... }
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).parent.parent
SRC = ROOT / "tools" / "rarekp_source.txt"
OUT = ROOT / "src" / "js" / "rarekp.js"
MOVES = {"roulette", "longshot", "nolook", "heel", "overhead", "sliding", "godsave"}


def main():
    rows = []
    for n, line in enumerate(SRC.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) != 3:
            sys.exit("%d 行目: 3項目ではない: %s" % (n, line))
        cid, name, mv = parts
        if mv != "-" and mv not in MOVES:
            sys.exit("%d 行目: 知らない技 %s" % (n, mv))
        ent = {"name": name}
        if mv != "-":
            ent["mv"] = mv
        rows.append('  "%s":%s' % (cid, json.dumps(ent, ensure_ascii=False)))
    js = ["/* 生成物。手で編集しない。 python tools/gen_rarekp.py が tools/rarekp_source.txt から書き出す(→docs/11)。",
          "   レアKP: WORLD CLASS 以上のカードの固有名と技。★5 で KP にしたときに発動する */",
          "const RARE_KP={", ",\n".join(rows), "};"]
    OUT.write_text("\n".join(js) + "\n", encoding="utf-8", newline="\n")
    sys.stdout.buffer.write(("%d 枚 → %s\n" % (len(rows), OUT.name)).encode("utf-8"))


if __name__ == "__main__":
    main()
