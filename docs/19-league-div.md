# 19. レギュラーリーグの Div 制

オーナーの要望(2026-11-21): レギュラーリーグを Div 制にする。2nd Div < 1st Div < Premier Div の3段。昇格するとリーグの相手が強くなる。Div ごとに優勝トロフィー。Premier は有名メガクラブの育成レベル最大のチームと競うメインステージ。最終節の結果で昇格・降格を知らせる。Premier の上位は残留。任期初めのクラブ選び(オファー)で始める Div が変わる。

## 19.1 決まり

| | 2nd Div | 1st Div | Premier Div |
|---|---|---|---|
| リーグの格(`S.grade`) | 1 | 2 | 3 |
| 相手7クラブの強さの段 | 1,1,2,2,2,3,3 | 2,2,3,3,3,4,4 | **4,4,5,5,5,5,5**(実在のメガクラブ中心) |
| Premier の相手の成長グラフ | | | 全軸 95・KP の軸は金色(育成レベル最大。リーグ戦だけ) |
| 昇格 | 上位2 | 上位2 | — |
| 降格 | — | 7位以下 | 7位以下 |

- 昇格・降格はリーグの最終節(第14節。周の最後の試合)で決まり、**次の周から**反映。降格するとファンが少し減る
- 最終節の結果の画面に帯で知らせる: 昇格(緑)/ 降格(灰)/ 残留(金。Premier・1st Div の残留)
- 優勝トロフィーは Div ごと(トロフィーの棚に Premier・1st Div・2nd Div の3つ)。前の記録(Div の無い優勝)は 2nd Div として数える
- 始める Div はクラブオファーで決まる(1部 = Premier・2部 = 1st Div・3部 = 2nd Div。オファーの名前も Div の名前に)
- SEASON の順位表に Div の名前と、昇格・降格の圏内の印

## 19.2 実装

| やること | 場所 |
|---|---|
| Div の顔ぶれ・昇格と降格の順位・Premier の相手の強さ | `TUNING.club.leagueTiers` / `promoteRank` / `relegateRank` / `premierGraph` |
| Div の名前・相手の定義・最終節の判定 | `club.js` の `DIV_NAME` / `divName` / `setLeagueName` / `oppDefOf`、`applyResult`(第14節)、`endCycle`(反映) |
| 結果の画面の帯 | `scenes.js` の `sceneResult`(`.res-div`) |
| トロフィー | `clubui.js` の `TROPHY_ORDER` / `trophyKey` / `trophyName` |
| テスト | `clubtest.js` ④ の「Div 制」 |
