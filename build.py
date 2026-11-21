#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""wcc_f ビルドスクリプト

src/index.html(ひな形)の /*__CSS__*/ と /*__JS__*/ に、src/css/*.css と src/js/*.js を
結合して埋め込み、ルートの index.html(単一ファイルの成果物)を書き出す。
import/export やバンドラは使わず、単純な文字列結合でグローバルスコープに連結する。

    python build.py           # ビルド
    python build.py --check   # 書き出さず、index.html が最新かだけ確かめる
    python build.py --real    # 実名パック(packs/*.local.json)を埋め込んだ index.local.html を作る(Git管理外・手元用)
    python build.py --dist    # 公開用(ホーム画面に追加できる版)を dist/ に書き出す。**実名は入らない**
"""
import hashlib
import os
import shutil
import subprocess
import tempfile
import struct
import zlib
import json
import re
import sys
import pathlib

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"
OUT = ROOT / "index.html"

# 結合順。data.js は先頭("use strict" を持つ)、main.js は起動の副作用を持つので最後。
# DOM に触らない8つ(data / trainings / realcards / engine / club / pool / grow / term)は src/tests/_setup.js の ENGINE_FILES と同じ並びにする。
JS_FILES = ["data.js", "trainings.js", "realcards.js", "rarekp.js", "engine.js", "club.js", "pool.js", "grow.js", "term.js", "emblem-art.js", "emblem.js", "art-players.js", "art-sec.js", "paper.js", "logo-img.js", "logo.js", "cardback.js", "render.js", "board.js", "clubui.js", "settings.js", "sound.js", "scenes.js", "main.js"]
CSS_FILES = ["base.css", "theme.css", "neon.css", "white.css"]   # neon = ブラック × レッドの作り込み / white = ホワイト × レッドの作り込み
# 埋め込む書体(英数字だけの latin サブセット。日本語はシステムの書体)。Oswald は SIL Open Font License
# (ファイル, 書体名, 太さ, 斜体か)。Barlow Condensed は見出し・数字用(本物の斜体を持つ。OFL。→docs/14 §14.18)
FONTS = [("oswald-latin.woff2", "Oswald", "200 700", False),
         ("BarlowCondensed-500.woff2", "Barlow Condensed", "500", False),
         ("BarlowCondensed-700.woff2", "Barlow Condensed", "700", False),
         ("BarlowCondensed-700i.woff2", "Barlow Condensed", "700", True),
         ("BarlowCondensed-800i.woff2", "Barlow Condensed", "800", True)]


def _join(sub, names):
    return "\n\n".join((SRC / sub / n).read_text(encoding="utf-8").strip() for n in names)


def _font_css():
    """src/assets/fonts の woff2 を base64 で埋め込む(外へ取りに行かない。オフラインで動く)"""
    import base64
    out = []
    for fname, family, weight, italic in FONTS:
        f = SRC / "assets" / "fonts" / fname
        if not f.is_file():
            print("書体が無いので飛ばす:", fname)
            continue
        b64 = base64.b64encode(f.read_bytes()).decode("ascii")
        out.append("@font-face{font-family:'%s';font-style:%s;font-weight:%s;font-display:swap;"
                   "src:url(data:font/woff2;base64,%s) format('woff2')}" % (family, "italic" if italic else "normal", weight, b64))
    return "\n".join(out)


def _pack_js():
    """packs/*.local.json(実名パック)を PACK に流し込む JS。main.js(起動)の直前に置く"""
    out = []
    for f in sorted((ROOT / "packs").glob("*.local.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        out.append("Object.assign(PACK.names,%s);Object.assign(PACK.teams,%s);" % (
            json.dumps(d.get("names", {}), ensure_ascii=False), json.dumps(d.get("teams", {}), ensure_ascii=False)))
    return "\n".join(out)


def _check_js(js):
    """連結した JS の構文を node で確かめる(全ファイルが1つのスコープに入るので、名前の重なりもここで見つかる)"""
    node = shutil.which("node")
    if not node:
        print("JS の構文確認: node が無いので省略")
        return
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as f:
        f.write(js)
        tmp = f.name
    try:
        r = subprocess.run([node, "--check", tmp], capture_output=True, text=True, encoding="utf-8")
    finally:
        os.unlink(tmp)
    if r.returncode != 0:
        print(r.stderr)
        sys.exit("ERROR: 連結した JS に構文エラーがある")
    print("JS の構文確認: OK")


def assemble(real=False):
    html = (SRC / "index.html").read_text(encoding="utf-8")
    for mark in ("/*__CSS__*/", "/*__JS__*/"):
        if html.count(mark) != 1:
            sys.exit("ERROR: src/index.html に %s が1つだけ必要です" % mark)
    html = html.replace("/*__CSS__*/", _font_css() + "\n\n" + _join("css", CSS_FILES))
    js = _join("js", JS_FILES[:-1]) + "\n\n" + (_pack_js() + "\n\n" if real else "") + _join("js", JS_FILES[-1:])
    if "--check" not in sys.argv:
        _check_js(js)
    return html.replace("/*__JS__*/", js)


def _png(size):
    """アイコン(PNG)を外部のライブラリなしで描く。ロゴのマーク「スラッシュ・ボール」(→docs/14 第3弾):
    黒の地に、白いボール・黒い五角形・赤い斜めの切れ込み2本・金の縁"""
    import math
    rows = []
    c = (size - 1) / 2
    R = 0.34 * size
    pent = [(c + math.cos(-math.pi / 2 + i * 2 * math.pi / 5) * R * 0.4, c + math.sin(-math.pi / 2 + i * 2 * math.pi / 5) * R * 0.4) for i in range(5)]

    def in_pent(x, y):
        for i in range(5):
            ax, ay = pent[i]; bx, by = pent[(i + 1) % 5]
            if (bx - ax) * (y - ay) - (by - ay) * (x - ax) < 0:
                return False
        return True
    t = math.radians(-28)
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            dx, dy = x - c, y - c
            d = (dx * dx + dy * dy) ** 0.5
            if d < R:
                v = (-dx * math.sin(t) + dy * math.cos(t)) / R      # 斜めの帯の位置(ボールの半径で正規化)
                if 0.14 <= v < 0.34 or 0.40 <= v < 0.48:
                    px = (224, 31, 61)
                elif in_pent(x, y) or d > R * 0.93:
                    px = (22, 24, 31)
                else:
                    px = (246, 247, 250)
            elif d < R * 1.1:
                px = (240, 207, 117)
            else:
                px = (12, 14, 19)
            row += bytes(px)
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def build_dist(html):
    """公開用。index.html + manifest + service worker + アイコン。service worker は版ごとにキャッシュを替える"""
    dist = ROOT / "dist"
    dist.mkdir(exist_ok=True)
    ver = hashlib.sha1(html.encode("utf-8")).hexdigest()[:10]
    (dist / "index.html").write_text(html, encoding="utf-8", newline="\n")
    files = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png"]
    manifest = {"name": "wcc_f", "short_name": "wcc_f", "start_url": "./", "scope": "./", "display": "standalone",
                "orientation": "portrait", "background_color": "#0e1320", "theme_color": "#0e1320",
                "icons": [{"src": "icon-192.png", "sizes": "192x192", "type": "image/png"},
                          {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"}]}
    (dist / "manifest.webmanifest").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    sw = """// 生成物(build.py --dist)。版 %s
const CACHE="wcc_f-%s", FILES=%s;
self.addEventListener("install",e=>{ e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())); });
self.addEventListener("activate",e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
  .then(()=>self.clients.claim())); });
// 先にネットを見て、つながらなければキャッシュ(更新がすぐ届き、オフラインでも開ける)
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  e.respondWith(fetch(e.request).then(r=>{ const c=r.clone(); caches.open(CACHE).then(x=>x.put(e.request,c)); return r; })
    .catch(()=>caches.match(e.request,{ ignoreSearch:true }).then(r=>r||caches.match("index.html"))));
});
""" % (ver, ver, json.dumps(files))
    (dist / "sw.js").write_text(sw, encoding="utf-8", newline="\n")
    for name, size in (("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)):
        (dist / name).write_bytes(_png(size))
    print("公開用 -> dist/ (版 %s。index.html / manifest / sw.js / アイコン3つ)" % ver)


def main():
    real = "--real" in sys.argv
    html = assemble(real)
    if real:
        out = ROOT / "index.local.html"
        out.write_text(html, encoding="utf-8", newline="\n")
        print("実名パックを埋め込んだ版 -> index.local.html (Git管理外・手元用。公開しない)")
        return
    if "--check" in sys.argv:
        ok = OUT.is_file() and OUT.read_text(encoding="utf-8") == html
        print("index.html は最新:", ok)
        sys.exit(0 if ok else 1)
    used = set(re.findall(r'\$\(["\']([^"\']+)["\']\)', html))
    used |= set(re.findall(r'getElementById\(["\']([^"\']+)["\']\)', html))
    declared = set(re.findall(r'\bid=["\']([^"\']+)["\']', html))
    missing = sorted(used - declared)
    print("MISSING ids:", missing or "なし")
    if missing:
        sys.exit("ERROR: 参照しているIDがHTMLにありません")
    OUT.write_text(html, encoding="utf-8", newline="\n")
    if "--dist" in sys.argv:
        build_dist(html)
    print("ビルド完了 -> index.html (%d KB)" % (len(html.encode("utf-8")) // 1024))


if __name__ == "__main__":
    main()
