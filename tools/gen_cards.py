#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""実在クラブの選手データから、本体用(偽名)と実名パックを書き出す(→docs/06)。

    python tools/gen_cards.py

  入力  tools/squads.local.txt     実名入り。Git管理外
  出力  src/js/realcards.js        **偽名だけ**。本体に入る(Git管理)
        packs/real.local.json      実名パック。Git管理外。python build.py --real で手元用の版に埋め込む

偽名は実名から機械的に作る: 姓の音を1〜2か所、別の音に替える(場所と音は名前ごとに決まる乱数。
毎回同じ偽名になる)。実名を連想させすぎないため(2026-11-18 に母音をずらすだけの作り方から変えた)。
一覧は手で書かない(→touchline P10)。squads.local.txt を直したら、これを実行する。
"""
import hashlib
import json
import random
import pathlib
import sys

ROOT = pathlib.Path(__file__).parent.parent
SRC = ROOT / "tools" / "squads.local.txt"
OUT_JS = ROOT / "src" / "js" / "realcards.js"
OUT_PACK = ROOT / "packs" / "real.local.json"

ROLES = {"GK", "CB", "SB", "DMF", "CMF", "OMF", "SMF", "WG", "CF"}
FORMS = {"4-3-3", "4-4-2", "4-2-3-1", "3-5-2"}

# カタカナの行。母音 a i u e o の順
ROWS = ["アイウエオ", "カキクケコ", "サシスセソ", "タチツテト", "ナニヌネノ", "ハヒフヘホ", "マミムメモ",
        "ヤ・ユ・ヨ", "ラリルレロ", "ワ・・・ヲ", "ガギグゲゴ", "ザジズゼゾ", "ダヂヅデド", "バビブベボ", "パピプペポ",
        "ァィゥェォ"]
SHIFT = {0: 4, 1: 3, 2: 4, 3: 0, 4: 0}       # a→o / i→e / u→o / e→a / o→a
SMALL = set("ャュョァィゥェォッー")


def shift_kana(ch):
    for row in ROWS:
        i = row.find(ch)
        if i >= 0:
            j = SHIFT[i]
            while row[j] == "・":                # ヤ行・ワ行の空き
                j = (j + 1) % 5
            return row[j]
    return None


# 替えたあとの音の候補(小さい文字・空き・ヲ は使わない)。段ごとにも引けるようにする
KANA = [ch for row in ROWS[:-1] for ch in row if ch not in "・ヲ"]
COL = {v: [row[v] for row in ROWS[:-1] if row[v] not in "・ヲ"] for v in range(5)}
SMALL_YO = set("ャュョ")      # 前の音はイ段でないと読めない(シャ・キョ など)
SMALL_V = set("ァィゥェォ")   # 前の音はウ段にそろえる(ファ・ティ など)


def pseudo(name):
    """実名 → 偽名。姓の音を1〜2か所、別の音に替える。ン も替える対象。小さい文字・長音は残す"""
    head, sep, word = name.rpartition(".")
    rng = random.Random(int(hashlib.md5(name.encode("utf-8")).hexdigest(), 16))
    pos = [i for i, ch in enumerate(word) if ch not in SMALL and (ch == "ン" or any(ch in r for r in ROWS))]
    if not pos:
        return head + sep + word + "ス"
    k = min(len(pos), rng.choice((1, 2)))
    w = list(word)
    for i in rng.sample(pos, k):
        nxt = word[i + 1] if i + 1 < len(word) else ""
        pool = COL[1] if nxt in SMALL_YO else COL[2] if nxt in SMALL_V else KANA
        pool = [c for c in pool if c != word[i]]
        w[i] = rng.choice(pool)
    new = "".join(w)
    return head + sep + (new if new != word else word + "ス")


def main():
    clubs, cur = [], None
    for ln, line in enumerate(SRC.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip() or line.startswith("#"):
            continue
        f = line.split("|")
        if line.startswith("@"):
            cid, pname, rname, short, color, form, kp = f
            assert form in FORMS, (ln, form)
            cur = {"id": cid[1:], "pname": pname, "rname": rname, "short": short, "color": color,
                   "form": form, "kp": int(kp), "pl": []}
            clubs.append(cur)
            continue
        no, rname, roles, age, r, traits, skill = f
        rl = roles.split("/")
        assert all(x in ROLES for x in rl), (ln, roles)
        cur["pl"].append({"no": int(no), "rname": rname, "roles": rl, "age": int(age), "r": float(r),
                          "traits": traits, "skill": skill})
    names, teams, rows, seen = {}, {}, [], set()
    for ci, c in enumerate(clubs):
        assert len(c["pl"]) == 16, (c["id"], len(c["pl"]))
        assert c["pl"][0]["roles"][0] == "GK", c["id"]
        teams[c["id"]] = {"name": c["rname"]}
        for i, p in enumerate(c["pl"]):
            pid = "%s%02d" % (c["id"].lower(), i + 1)
            pn = pseudo(p["rname"])
            assert pn != p["rname"], p["rname"]
            if pn in seen:
                pn = pn + "ス"
            seen.add(pn)
            names[pid] = p["rname"]
            rows.append('  ["%s",%d,%d,"%s","%s",%d,%s,"%s","%s"]' % (
                pid, ci, p["no"], pn, "/".join(p["roles"]), p["age"], p["r"], p["traits"], p["skill"]))
    js = ["/* 生成物。手で編集しない。 python tools/gen_cards.py が tools/squads.local.txt から書き出す。",
          "   実在クラブの選手(→docs/06)。**名前は偽名**。実名は packs/real.local.json(Git管理外)。",
          "   REAL_CLUBS: [id, 偽名クラブ, 略称, 色, 陣形, KPの並び位置(1〜16)]",
          "   REAL_ROWS : [カードid, クラブの番号, 背番号, 偽名, 役割, 年齢, 格, 特徴, スキル]",
          "     並びは陣形の枠の順に先発11人 → 控え5人。能力は役割のひな形 + 格 + 特徴から pool.js が作る */",
          "const REAL_CLUBS=["]
    js.append(",\n".join('  ["%s","%s","%s","%s","%s",%d]' % (c["id"], c["pname"], c["short"], c["color"], c["form"], c["kp"])
                         for c in clubs))
    js.append("];")
    js.append("const REAL_ROWS=[")
    js.append(",\n".join(rows))
    js.append("];")
    OUT_JS.write_text("\n".join(js) + "\n", encoding="utf-8", newline="\n")
    OUT_PACK.parent.mkdir(exist_ok=True)
    OUT_PACK.write_text(json.dumps({"names": names, "teams": teams}, ensure_ascii=False, indent=1) + "\n",
                        encoding="utf-8", newline="\n")
    sample = [(p["rname"], pseudo(p["rname"])) for p in clubs[0]["pl"][:6]]
    sys.stdout.buffer.write(("%d クラブ / %d 人 → %s と %s\n例: %s\n" % (
        len(clubs), len(rows), OUT_JS.name, OUT_PACK.name,
        " / ".join("%s→%s" % s for s in sample))).encode("utf-8"))


if __name__ == "__main__":
    main()
