#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""オーナーが作ったタイトルのロゴ(assets/logo_src.png。白地に黒の線)から、透明な地の2枚を作り、src/js/logo-img.js に埋め込む(→docs/14 §14.17)。

    python tools/gen_logo.py

  出力  assets/logo_black.png … 黒い線・透明な地(明るい地の上に)
        assets/logo_white.png … 白黒を反転した版。白い線・透明な地(暗い地の上に。タイトルはこちら)
        (透かし wm / wmk) … ボールのマークをごく薄くした白 / 黒の版(監督室の地の透かし。→docs/14 §14.19・§14.21)。ファイルには書き出さない
        (ball) … ボールのマークだけ(白い地に黒い線、円の外は透明)。試合の看板のロゴ(→docs/14 §14.153)
        assets/icon-192.png・icon-512.png・apple-touch-icon.png・favicon.png … ホーム画面・ブックマークのアイコン(赤い地に白いボール)
        src/js/logo-img.js   LOGO_IMG = { white:"data:image/png;base64,...", black:"...", wm:"...", ball:"..." }
線の濃さをそのまま不透明さにする(縁のなめらかさを残す)。周りの余白は切り、幅 W に縮める。
"""
import base64
import io
import pathlib

from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).parent.parent
SRC = ROOT / "assets" / "logo_src.png"
OUT_JS = ROOT / "src" / "js" / "logo-img.js"
W = 560
WM_ALPHA = 0.06    # 透かしの濃さ(暗い地に白)
WMK_ALPHA = 0.045  # 透かしの濃さ(明るい地に黒)
ICON_BG = (200, 16, 46)   # アイコンの地(テーマの赤 #c8102e)
ICON_D = 0.72             # アイコンの中のボールの直径(一辺に対する割合。maskable の安全な円 80% に収める)


def ball_of(g):
    """元の絵からボールだけを切り出す(白い地 + 黒い線。円の外は透明)。大きいまま返す"""
    ink = Image.eval(g, lambda v: 255 - v)
    top = ink.crop((0, 0, g.width, int(g.height * 0.64)))        # 文字(WCC/F …)より上
    x0, y0, x1, y1 = Image.eval(top, lambda v: 255 if v > 60 else 0).getbbox()
    d = max(x1 - x0, y1 - y0); cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    sx, sy = round(cx - d / 2), round(cy - d / 2); sq = g.crop((sx, sy, sx + d, sy + d))
    big = 4                                                      # 円の縁をなめらかにする(大きく描いて縮める)
    mask = Image.new("L", (d * big, d * big), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, d * big - 1, d * big - 1), fill=255)
    mask = mask.resize((d, d), Image.LANCZOS)
    im = Image.merge("RGBA", (sq, sq, sq, mask))
    return im


def words_of(g, h=72, rgb=(0, 0, 0)):
    """「WORLD CHAMPION / CLUBS FOOTBALLERS」の2行だけを切り出す(黒い線・透明な地。高さ h)。試合の看板(→docs/14 §14.154)"""
    ink = Image.eval(g, lambda v: 255 - v)
    y0 = int(g.height * 0.79)                                    # WCC/F の下線より下
    part = ink.crop((0, y0, g.width, g.height))
    box = Image.eval(part, lambda v: 255 if v > 60 else 0).getbbox()
    part = part.crop(box)
    part = part.resize((round(part.width * h / part.height), h), Image.LANCZOS)
    im = Image.new("RGBA", part.size, rgb + (0,)); im.putalpha(part)
    return im


def icon_of(ball, size):
    """赤い地の真ん中に白いボール"""
    im = Image.new("RGBA", (size, size), ICON_BG + (255,))
    d = round(size * ICON_D); b = ball.resize((d, d), Image.LANCZOS)
    im.alpha_composite(b, ((size - d) // 2, (size - d) // 2))
    return im.convert("RGB")


def main():
    g = Image.open(SRC).convert("L")
    ink = Image.eval(g, lambda v: 255 - v)                 # 黒いほど濃い
    box = Image.eval(ink, lambda v: 255 if v > 60 else 0).getbbox()
    pad = 12
    box = (max(0, box[0] - pad), max(0, box[1] - pad), min(g.width, box[2] + pad), min(g.height, box[3] + pad))
    ink = ink.crop(box)
    h = round(ink.height * W / ink.width)
    ink = ink.resize((W, h), Image.LANCZOS)
    ink = Image.eval(ink, lambda v: 0 if v < 24 else min(255, int((v - 24) * 255 / 200)))   # 地のかすかな汚れを消す
    data = {}
    for name, rgb in (("white", (255, 255, 255)), ("black", (0, 0, 0)), ("wm", (255, 255, 255)), ("wmk", (0, 0, 0))):
        im = Image.new("RGBA", ink.size, rgb + (0,))
        im.putalpha(ink if not name.startswith("wm") else Image.eval(ink, lambda v: round(v * (WM_ALPHA if name == "wm" else WMK_ALPHA))))
        if name.startswith("wm"):      # ボールのマークだけ(中心 50.7% / 31.4%、直径は幅の 62.9%。タイトルの暗い円と同じ値)。文字は入れない
            cx, cy, r = 0.507 * W, 0.314 * ink.height, 0.629 * W / 2 + 4
            im = im.crop((round(cx - r), max(0, round(cy - r)), round(cx + r), round(cy + r)))
            im = im.resize((im.width // 2, im.height // 2), Image.LANCZOS)   # 薄いので半分の大きさで足りる
        else:
            im.save(ROOT / "assets" / ("logo_%s.png" % name), optimize=True)
        buf = io.BytesIO()
        im.save(buf, "PNG", optimize=True)
        data[name] = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
    ball = ball_of(Image.open(SRC).convert("L"))
    for name, size in (("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180), ("favicon.png", 64)):
        icon_of(ball, size).save(ROOT / "assets" / name, optimize=True)
    buf = io.BytesIO(); ball.resize((128, 128), Image.LANCZOS).save(buf, "PNG", optimize=True)
    data["ball"] = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
    buf = io.BytesIO(); words_of(Image.open(SRC).convert("L")).save(buf, "PNG", optimize=True)
    data["words"] = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
    buf = io.BytesIO(); words_of(Image.open(SRC).convert("L"), rgb=(255, 255, 255)).save(buf, "PNG", optimize=True)
    data["wordsW"] = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
    js = ["/* 生成物。手で編集しない。 python tools/gen_logo.py が assets/logo_src.png(オーナーが作ったロゴ)から書き出す(→docs/14 §14.17)。",
          "   white … 白い線・透明な地(暗い地の上に) / black … 黒い線・透明な地 / wm … ごく薄い白(暗い地の透かし) / wmk … ごく薄い黒(明るい地の透かし) / ball … ボールのマークだけ(試合の看板) / words・wordsW … WORLD CHAMPION CLUBS FOOTBALLERS の2行(黒・白。試合の看板) */",
          "const LOGO_IMG={",
          '  white:"%s",' % data["white"],
          '  black:"%s",' % data["black"],
          '  wm:"%s",' % data["wm"],
          '  wmk:"%s",' % data["wmk"],
          '  ball:"%s",' % data["ball"],
          '  words:"%s",' % data["words"],
          '  wordsW:"%s"' % data["wordsW"],
          "};"]
    OUT_JS.write_text("\n".join(js) + "\n", encoding="utf-8", newline="\n")
    print("logo-img.js %d KB(%dx%d)" % (OUT_JS.stat().st_size // 1024, W, h))


if __name__ == "__main__":
    main()
