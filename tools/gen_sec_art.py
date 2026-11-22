#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""秘書の絵を pftb から取り込む(→docs/05 §5.12)。

    python tools/gen_sec_art.py

  入力  ../pftb/src/assets/secretary/sec01.webp … sec04.webp   (どれも 300×357 の立ち絵)
  出力  src/js/art-sec.js   SEC_ART = { s0:{ full:"data:…", face:"data:…" }, … }

  full … 立ち絵(幅150に縮める)。秘書を選ぶ画面・CLUB の秘書の欄
  face … 顔の切り抜き(96×96)
  bust … バストアップ(監督と同じ切り方)。秘書を選ぶ画面・MANAGER の秘書の欄

秘書と絵の組(口調に合わせる): s0 白石(丁寧・紺のスーツとメモ帳)= sec01 / s1 ゾーイ・カーター(元気・腕まくりとコーヒー)= sec03 /
s2 エリカ・ハートマン(クール・眼鏡とタブレット)= sec02 / s3 フィオナ・オコナー(おっとり)= sec04
"""
import base64
import io
import pathlib
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).parent.parent
SRC = ROOT.parent / "pftb" / "src" / "assets" / "secretary"
OUT = ROOT / "src" / "js" / "art-sec.js"
# 秘書 id → (ファイル, 顔の切り抜き (左, 上, 一辺))
MAP = {
    "s0": ("sec01.webp", (90, 22, 112)),
    "s1": ("sec03.webp", (91, 22, 114)),
    "s2": ("sec02.webp", (92, 22, 112)),
    "s3": ("sec04.webp", (94, 22, 112)),
}
FULL_W, FACE = 150, 96


def enc(im):
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=84, method=6)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def main():
    rows, total = [], 0
    for sid, (fn, (x, y, n)) in MAP.items():
        p = SRC / fn
        if not p.exists():
            sys.exit("pftb の秘書の絵が見つからない: " + str(p))
        im = Image.open(p).convert("RGBA")
        full = im.resize((FULL_W, round(im.height * FULL_W / im.width)), Image.LANCZOS)
        face = im.crop((x, y, x + n, y + n)).resize((FACE, FACE), Image.LANCZOS)
        # バストアップ(監督と同じ切り方: 頭の上から 170px・幅 150px → 幅 220。→docs/14 §14.73)
        a = im.split()[3]
        top = a.getbbox()[1]
        head = a.crop((0, top, im.width, top + 60)).getbbox()
        cx = (head[0] + head[2]) // 2
        bust = im.crop((cx - 75, top - 6, cx + 75, top - 6 + 170)).resize((220, round(220 * 170 / 150)), Image.LANCZOS)
        f1, f2, f3 = enc(full), enc(face), enc(bust)
        total += len(f1) + len(f2) + len(f3)
        rows.append('  %s:{ full:"%s",\n    face:"%s",\n    bust:"%s" }' % (sid, f1, f2, f3))
    js = ["/* 生成物。手で編集しない。 python tools/gen_sec_art.py が pftb の秘書の絵から書き出す。 */",
          "const SEC_ART={", ",\n".join(rows), "};", ""]
    OUT.write_bytes("\n".join(js).encode("utf-8"))
    print("ok", OUT.name, "%.1fKB" % (total / 1024))


if __name__ == "__main__":
    main()
