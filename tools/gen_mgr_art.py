#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""監督のアバターを pftb から取り込む(→docs/14 §14.69)。

    python tools/gen_mgr_art.py

  入力  ../pftb/src/assets/manager/mob01a.webp … mob01h.webp(どれも 300×357 の立ち絵。一般的な監督。b はブランドのロゴがあるので外して 7人)
  出力  src/js/art-mgr.js   MGR_ART = [ { full, bust, face }, … ]

  full … 立ち絵(幅150)。MANAGER の監督の欄・アバターを選ぶ画面
  bust … バストアップ(頭から胸まで。幅220)。ハーフタイムの指示の演出
  face … 顔(96×96)。チャットの監督の発言

**本体に入れるのは mob01(一般的な監督)だけ**。mg01・mg02 は実在の監督の似顔絵なので入れない(実名を本体に入れない決まりと同じ扱い)。
"""
import base64
import io
import pathlib
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).parent.parent
SRC = ROOT.parent / "pftb" / "src" / "assets" / "manager"
OUT = ROOT / "src" / "js" / "art-mgr.js"
NAMES = ["mob01" + c for c in "acdefgh"]   # mob01b は実在のスポーツブランドのロゴが入っているので外す


def enc(im, q=84):
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=q, method=6)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def main():
    rows, total = [], 0
    for nm in NAMES:
        p = SRC / (nm + ".webp")
        if not p.exists():
            sys.exit("pftb の監督の絵が見つからない: " + str(p))
        im = Image.open(p).convert("RGBA")
        a = im.split()[3]
        bb = a.getbbox()                      # 絵のある範囲
        top = bb[1]
        head = a.crop((0, top, im.width, top + 60)).getbbox()   # 頭の左右
        cx = (head[0] + head[2]) // 2
        # 顔: 頭の上から 100px 四方
        n = 74
        face = im.crop((cx - n // 2, top - 3, cx + n // 2, top - 3 + n)).resize((96, 96), Image.LANCZOS)
        # バストアップ: 頭の上から 170px、幅 150px
        bw, bh = 150, 170
        bust = im.crop((cx - bw // 2, top - 6, cx + bw // 2, top - 6 + bh)).resize((220, round(220 * bh / bw)), Image.LANCZOS)
        full = im.resize((150, round(im.height * 150 / im.width)), Image.LANCZOS)
        f1, f2, f3 = enc(full), enc(bust), enc(face)
        total += len(f1) + len(f2) + len(f3)
        rows.append('  { full:"%s",\n    bust:"%s",\n    face:"%s" }' % (f1, f2, f3))
    js = ["/* 生成物。手で編集しない。 python tools/gen_mgr_art.py が pftb の監督の絵(一般的な監督 mob01)から書き出す。 */",
          "const MGR_ART=[", ",\n".join(rows), "];", ""]
    OUT.write_bytes("\n".join(js).encode("utf-8"))
    print("ok", OUT.name, len(rows), "人 %.1fKB" % (total / 1024))


if __name__ == "__main__":
    main()
