#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""tools/train_source.txt(本家の特殊練習48種の控え)から src/js/trainings.js を生成する。

一覧は手で写さない(→touchline P10)。train_source.txt を直したら、これを実行する。
    python tools/gen_trainings.py

1行の形:  名称|ハーフタイムの指示|効果1|効果2|上がる軸|下がる軸
  効果は「連携・個人能力☆☆☆」のように、伸びるもの(連携 / 個人 / 特殊 / セットプレイ)と星の数。
  軸は OFF / DEF / 支配 / 奪取 / スピード / パワー(ALL は全部)。
出力の slot は「どの基本練習の上位として出るか」。上がる軸のうち割り当ての少ない枠へ入れる(ALL は any)。
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).parent.parent
SRC = ROOT / "tools" / "train_source.txt"
OUT = ROOT / "src" / "js" / "trainings.js"

AXIS = {"OFF": "O", "DEF": "D", "ディフェンス": "D", "支配": "R", "奪取": "C", "スピード": "S", "パワー": "P"}
SLOT = {"O": "off", "D": "def", "R": "tec", "C": "sta", "S": "spd", "P": "pow"}
KIND = [("連携", "link"), ("個人", "ind"), ("特殊", "sp"), ("セットプレイ", "set")]


def effect(txt):
    """「連携・個人能力☆☆☆」→ {link:3, ind:3}"""
    out = {}
    if txt == "なし":
        return out
    n = txt.count("☆")
    for word, key in KIND:
        if word in txt:
            out[key] = n
    return out


def axes(txt):
    if txt == "なし":
        return []
    if txt == "ALL":
        return list("ODRCSP")
    return [AXIS[t] for t in txt.split("、")]


def main():
    rows = []
    cnt0 = {}
    for line in SRC.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        name, phrase, e1, e2, up, down = line.split("|")
        eff = effect(e1)
        for k, v in effect(e2).items():
            eff[k] = max(eff.get(k, 0), v)
        ups, downs = axes(up), axes(down)
        # 上がる軸のうち、まだ割り当ての少ない枠へ入れる(先頭の軸で決めると OFF に偏る)
        if up == "ALL":
            slot = "any"
        else:
            slot = min((SLOT[a] for a in ups), key=lambda k: (cnt0.get(k, 0), "sta spd pow def tec off".split().index(k)))
            cnt0[slot] = cnt0.get(slot, 0) + 1
        name = re.sub(r"\(13-14\)$", "", name)
        rows.append((name, slot, eff, ups, downs))
    js = ["/* 生成物。手で編集しない。 python tools/gen_trainings.py が tools/train_source.txt から書き出す。",
          "   特殊練習(→docs/05 §5.3)。基本練習6種の上位として、同じ slot の枠に差し替わって出る。",
          "     eff  … 伸びるものと星の数(link 連携 / ind 個人能力 / sp 特殊能力 / set セットプレイ)",
          "     up / down … 戦力グラフの上がる軸・下がる軸 */",
          "const TRAIN_SP=["]
    for name, slot, eff, ups, downs in rows:
        e = ", ".join("%s:%d" % kv for kv in eff.items())
        js.append('  { name:"%s", slot:"%s", eff:{ %s }, up:"%s", down:"%s" },' % (name, slot, e, "".join(ups), "".join(downs)))
    js[-1] = js[-1].rstrip(",")
    js.append("];")
    OUT.write_text("\n".join(js) + "\n", encoding="utf-8", newline="\n")
    cnt = {}
    for r in rows:
        cnt[r[1]] = cnt.get(r[1], 0) + 1
    sys.stdout.buffer.write(("%d 種 → %s  slot別: %s\n" % (len(rows), OUT.name, cnt)).encode("utf-8"))


if __name__ == "__main__":
    main()
