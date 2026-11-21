# 17. ポジションの細分化(左右・CF と ST)

オーナーの要望(2026-11-21): pftb を踏襲して、ポジションを左右まで細かくする。右が得意・左が得意といった選手の個性を出す。
例: ヤマルは RWG、エムバペは LWG。

## 17.1 細かいポジション

盤面の位置と、カードの「得意な役割」はこちらで持つ(自陣から見た左右)。

```
LWG  CF   RWG
LWG  ST   RWG
LMF  OMF  RMF
LMF  CMF  RMF
LMF  DMF  RMF
LSB  CB   RSB
     GK
```

- 区切り: 前の役割の区切りはそのまま(`TUNING.zone`)。FW の高さのうち `cfH`(0.80)より前が CF、後ろが ST。左右の端は高さにかかわらず LWG / RWG
- 4-4-2・3-5-2 の2人目の FW(少し下がった枠)は ST になる

## 17.2 メインとサブ(pftb にならう)

pftb はカードに「メイン(GK・DF・MF・FW)」と「サブ(細かいポジションを複数)」を持たせ、サブが合えば満額、メインだけ合えば少し減り、違えば大きく減る。
wcc_f も同じ形: カードの `pos` がメイン、`roles`(得意な役割)がサブ(先頭が主)。

## 17.3 適性

| | 適性 | 例 |
|---|---|---|
| 得意な役割 | own 1.00 | RWG の選手を RWG に |
| **同じ役割の反対側・CF⇔ST** | **side 0.95**(新しい段) | RWG の選手を LWG に / CF の選手を ST に |
| 同じポジション | group 0.90 | RWG の選手を CF に |
| 隣のポジション | near 0.76 | |
| DF⇔FW | far 0.62 | |

- 盤面の役割の札の文字色・SQUAD の ◎○△×・カードの裏の適性マップ(反対側は薄い緑)に出る
- 試合の動き(手札など)は、左右を束ねた役割で決める(`baseRole`: LSB・RSB → SB、LMF・RMF → SMF、LWG・RWG → WG、ST → CF)。動きは変えず、適性だけが変わる

## 17.4 選手データ

- 実在選手: `tools/squads.local.txt` の役割を左右付きに書き換えた。先発は陣形の枠の左右、控えや中央の枠の選手の2つ目の役割は、ふだんのサイドで指定(41人)。誤りは1行ずつ直してよい。エムバペはオーナーの例に合わせて `LWG/CF`
- 架空のカード(初めの16枚など): 所属クラブの既定の陣形で置かれる側。控えは id のたね
- 生成する相手クラブ: 陣形の枠の細かいポジションで作る。控えの SMF は左右をたねで

## 17.5 実装

| やること | 場所 |
|---|---|
| 区切り・適性の段 | `TUNING.zone.cfH`・`TUNING.apt.side` |
| 細かいポジション・束ね | `data.js` の `GROUP_OF` / `BASE_ROLE` / `baseRole` / `LR_ROLE` / `sidedRoles` |
| 位置 → ポジション・適性 | `engine.js` の `posAt` / `roleAt`(束ね)/ `aptOf`。選手は `p.pos`(細かい)と `p.role`(束ね) |
| 表示 | 盤面(`board.js`・`clubui.js` の `sqRole`)、カードの裏の適性マップ(`cardback.js` の `aptZones`) |
| 実在選手のデータ | `tools/squads.local.txt` → `python tools/gen_cards.py` |
