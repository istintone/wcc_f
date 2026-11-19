#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""【仮】pftb の汎用選手の絵を wcc_f に取り込む(→docs/10 §10.9)。見た目を確かめるための一時的なもの。

    python tools/gen_player_art.py

  入力  ../pftb/src/assets/players/any-{gk,out}-<id>_{play,stand}.webp   (pftb の汎用選手。どれも 300×357)
  出力  src/js/art-players.js   PLAYER_ART = { "any-gk-05e31f_play": "data:image/webp;base64,..." , ... }

半分の大きさ(幅150)に縮めて埋め込む(index.html が太りすぎないように)。
実名ベースの選手の絵ができたら、このファイルごと差し替える。
"""
import base64
import io
import pathlib
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).parent.parent
SRC = ROOT.parent / "pftb" / "src" / "assets" / "players"
OUT = ROOT / "src" / "js" / "art-players.js"
W = 150


def main():
    files = sorted(SRC.glob("any-*_*.webp"))
    if not files:
        sys.exit("pftb の選手の絵が見つからない: " + str(SRC))
    rows, total = [], 0
    for f in files:
        im = Image.open(f).convert("RGBA")
        h = round(im.height * W / im.width)
        im = im.resize((W, h), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, "WEBP", quality=82, method=6)
        b = base64.b64encode(buf.getvalue()).decode("ascii")
        total += len(b)
        rows.append('  "%s":"data:image/webp;base64,%s"' % (f.stem, b))
    js = ["/* 生成物。手で編集しない。 python tools/gen_player_art.py が pftb の汎用選手の絵から書き出す。",
          "   【仮】見た目を確かめるための一時的な絵(→docs/10 §10.9)。キーは any-{gk|out}-<id>_{play|stand} */",
          "const PLAYER_ART={", ",\n".join(rows), "};"]
    OUT.write_text("\n".join(js) + "\n", encoding="utf-8", newline="\n")
    sys.stdout.buffer.write(("%d 枚 → %s(%d KB)\n" % (len(files), OUT.name, total // 1024)).encode("utf-8"))


if __name__ == "__main__":
    main()
