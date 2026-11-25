#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""スタジアムの絵(5段。オーナーが用意したもの)を取り込む(→docs/14 §14.150)。

    python tools/gen_stadium_art.py

  入力  assets/stadium_tiers.png   672×1586。黒い帯で区切られた5枚(上から Lv1〜Lv5)
  出力  src/js/art-stadium.js      STAD_ART = [ "data:image/webp;…"(Lv1), …, (Lv5) ]

  区切り(黒い帯)は明るさから自動で見つける。どの段も同じ縦横比(668:310)に中央で切りそろえる
"""
import base64, io, pathlib
from PIL import Image

ROOT = pathlib.Path(__file__).parent.parent
SRC = ROOT / "assets" / "stadium_tiers.png"
OUT = ROOT / "src" / "js" / "art-stadium.js"

im = Image.open(SRC).convert("RGB"); px = im.load(); W, H = im.size
row = [sum(sum(px[x, y]) for x in range(0, W, 4)) / (W // 4) for y in range(H)]
bands = []
for y in range(H):
    if row[y] < 25:
        if bands and y - bands[-1][1] <= 2: bands[-1][1] = y
        else: bands.append([y, y])
panels = [(bands[i][1] + 1, bands[i + 1][0]) for i in range(len(bands) - 1)]
assert len(panels) == 5, panels
PW, PH = W - 4, 306   # 左右の黒い縁を落とし、高さは一番低い段に合わせる
out = []; tops = []; grass = []
for y0, y1 in panels:
    h = y1 - y0; top = y0 + max(0, (h - PH) // 2)
    p = im.crop((2, top, 2 + PW, top + PH))
    # 芝が始まる高さ(中央の列で、緑の画素が多くなる最初の行)。試合のモニターで、ここより上(空・スタンド)を奥に描く
    q = p.load()
    def green(y): return sum(1 for x in range(PW // 2 - 60, PW // 2 + 60, 4) if q[x, y][1] > q[x, y][0] + 40 and q[x, y][1] > q[x, y][2] + 20)
    tops.append(next(y for y in range(PH) if green(y) >= 25))
    # 芝の色(芝の線の少し下の、緑の画素の平均)。試合のモニターの芝をこの色に寄せる(→docs/14 §14.152)
    gs = [q[x, y] for y in range(tops[-1] + 8, min(PH, tops[-1] + 60)) for x in range(40, PW - 40, 3)
          if q[x, y][1] > q[x, y][0] + 40 and q[x, y][1] > q[x, y][2] + 20]
    grass.append([round(sum(c[i] for c in gs) / len(gs)) for i in range(3)])
    buf = io.BytesIO(); p.save(buf, "WEBP", quality=82, method=6)
    out.append("data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode())
    print(len(out), (y0, y1), len(buf.getvalue()) // 1024, "KB")
head = "/* 生成物(tools/gen_stadium_art.py)。手で編集しない。スタジアムの絵 Lv1〜Lv5(→docs/14 §14.150) */\n"
body = "const STAD_ART=[\n" + ",\n".join('"' + d + '"' for d in out) + "\n];\n"
tail = "const STAD_W=" + str(PW) + ", STAD_TOP=" + str(tops) + ";   // 芝が始まる高さ(px)。試合のモニターはここより上を奥のスタンドに描く\n" + "const STAD_GRASS=" + str(grass) + ";   // 絵の芝の色(RGB)。モニターの芝をこの色に寄せる\n"
OUT.write_text(head + body + tail, encoding="utf-8")
print("->", OUT)
