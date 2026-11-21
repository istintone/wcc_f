# wcc_f — 作業の進め方

WCCF の筐体1台ぶんの体験をブラウザで再現する。**4作目。**
スマホ縦持ち(Android の Chrome と iPhone)・CPU戦のみ・非商用。
**現在は段階4の途中(任期・育成・称号・カード払い出し・登録が動き、カードと上位の相手は実在の16クラブ。本体は偽名)**(→ [SPEC.md](SPEC.md) の段階表)。

## 原則

- **SPEC が正本**。仕様変更は「①`SPEC.md`/`docs/` を更新 → ②実装 → ③一致を検証」の順。
- **`index.html` は直接編集しない**(ビルド成果物)。`src/` を編集して `python build.py`。
- **数値は `data.js` の `TUNING` に集約**。確率・係数・閾値をロジックに直書きしない。
- **`engine.js` / `club.js` / `pool.js` / `grow.js` / `term.js` は DOM に触らない**。Node でそのまま回せることがテストの前提。
- **描画はエンジンの結果を読むだけ**。見かけの都合で結果や位置を書き換えない(→docs/02 §2.1)。
- **実名を本体に入れない**。カード名・クラブ名は架空名で書き、実名は `packs/*.local.json`(Git管理外)。
- 設計原則は touchline の [docs/00-principles.md](../touchline/docs/00-principles.md)(P1〜P10)を引き継ぐ。
  バランスを疑う前に、同じ症状が載っていないか確認する。
- コミットメッセージは日本語。**プッシュは明示的に指示されたときだけ**行う。

## 変更のたびに走らせるもの

```bash
python build.py
cd src/tests && node enginetest.js        # 試合の中。既定600試合。数値を触ったら 1000 以上で
node clubtest.js                          # 試合の外(世界・日程・PK戦・任期・保存)
```

表示を触ったときは、**390px 幅でスクリーンショットを撮って実際に見る**。
`index.html?quick=1&seed=7&auto=1&stopat=33&ff=1` で、描画を待たずに33分まで進めた画面になる
(`quick=1` はクラブハウスを通さない1試合だけのモード。付けなければクラブハウスから始まる)。
headless Chrome は窓幅を 500px 未満にできないので、幅390の iframe に入れて撮る。

## 触る場所

| やること | 触る場所 |
|---|---|
| 試合の数値を変える | `src/js/data.js` の `TUNING` → `enginetest.js` の実測を docs/02 に写す |
| 選手の手札を変える | `data.js` の `CHANNELS`(役割ごとに3枚) |
| 選手・クラブを足す | `data.js` の `CARD_ROWS` / `TEAMS`(段階4で別ファイルに分ける) |
| JSファイルを増やす | `build.py` の `JS_FILES`。エンジン側なら `src/tests/_setup.js` も |
| 指示の種類を増やす | `engine.js` の `orderMatch` / `applyOrders` |
| スタイルを足す・変える | `data.js` の `STYLES`(全体は `gain` と `cost`、個人は `fx`)→ `enginetest.js` の ⑦。**全体は必ず失うものを持たせる**。設計の正本は docs/04 |
| スキルを足す | `data.js` の `SKILLS`(`style` と `buff`)。語彙は `engine.js` の `FX0` にあるものを使う。**新しい語彙が要るときだけ**判定に1行足す |
| 監督の指示(十字の戦術ボタン + キーパー)を変える | `data.js` の `TUNING.ins`、`engine.js` の `insOf` / `insLane` / `setIns` → `enginetest.js` の ⑥。設計は docs/04 §4.9b、実測は docs/02 §2.11 |
| 試合画面の配置(モニター・縦の盤面・操作の台)を変える | `src/index.html` の `#deck` / `#pad`、`board.js` の `bdPos`、`base.css` の「操作の台」。正本は docs/07 §7.11 |
| 本家との対応表を直す | `tools/gen_kp_design.py` の `MAP` → 実行して docs/04 に書き出す(手で編集しない) |
| 規則の率を変える | `data.js` の `TUNING.rule` → `enginetest.js` の ③b |
| 大会・日程・出場条件を変える | `club.js` の `COMPS` / `SCHED` / `entryOk` → `clubtest.js`。設計の正本は docs/05 |
| 相手クラブの作り方を変える | `club.js` の `genWorld` と `GEN_*`、強さは `data.js` の `TUNING.club` |
| ケガを変える | 起きる率・能力の落ち方・治り方は `data.js` の `TUNING.inj`。判定は `engine.js` の `injCheck`、試合のあとは `grow.js` の `afterMatchGrowth` → `clubtest.js`。正本は docs/05 §5.4・docs/08 §8.8 |
| 連携の相性・付きやすさ(動物占い・国籍・クラブ)を変える | 動物と群れは `data.js` の `ANIMALS` / `aniOfDate` / `aniCompat`、ボーナスは `TUNING.grow.link.bonus`、判定は `grow.js` の `compatOf` / `linkBonusK` / `linkCap`。実在選手の国籍・生年月日は `tools/squads.local.txt` → `gen_cards.py`。正本は docs/05 §5.5 |
| 秘書(口調・親密度・会話・フォロー)を変える | `grow.js` の末尾(`SECS` / `SEC_LINES` / `SEC_EVENTS` / `secFollow`)と `TUNING.sec`、画面は `clubui.js` の `secHtml` / `secPickHtml` / `secClubHtml`。正本は docs/05 §5.12 |
| 経営(資金・ファン・入場料・スタジアム改修・施設)を変える | 数値は `data.js` の `TUNING.biz`、仕組みは `club.js` の末尾(`bizAfterMatch` / `answerStadium` / `buildFac`)、施設の効き目は `grow.js` の `facK` を掛けている所。画面は `clubui.js` の `stadOfferHtml` / `bizClubHtml` / `stadiumSvg`。正本は docs/05 §5.13 |
| スポンサー(業種×☆のマスタ・候補・収入・ミッションと報酬の効果)を変える | マスタは `club.js` の `SP_IND`、数値は `TUNING.biz.sp`、仕組みは `club.js` の末尾(`spOffers` / `signSponsor` / `spRenew` / `spAfterMatch` / `spBoost`)、画面は `clubui.js` の `spPickHtml` / `spTileHtml`。正本は docs/05 §5.14 |
| ブラッシュアップ会議の結論と進み具合を見る | docs/09(4つの観点の総評・4段の進め方・やったこと・判断が要ること) |
| 監督ライセンス・監督契約(クラブ名・エンブレム)を変える | 仕組みは `club.js` の末尾(`registerManager` / `signClub` / `myTeam` / `TOWNS`)、画面は `clubui.js` の `licenseHtml` / `contractHtml`。エンブレムは `emblem.js` / `emblem-art.js`(pftb から取り込み)と `scenes.js` の `emblemSvg`。正本は docs/10 |
| 称号のセット・監督能力を変える | 称号の効き目は `term.js` の `TITLE_FX` と `TUNING.tset`、監督能力は `data.js` の `MAB` と `TUNING.mab`(試合の効き目は `engine.js` の `refreshFx`、熟練度は `club.js` の `mabRank` / `mabOf`)→ `enginetest.js` の ⑩。正本は docs/10 |
| ハーフタイムの指示を変える | 名前は `data.js` の `HT_PHRASE` / `HT_BASIC`、数値は `TUNING.ht`、覚える・登録は `grow.js` の `htOf` / `htAvail` / `toggleHt`、効き目は `engine.js` の `htPlan` と `refreshFx`、画面は `main.js`(字幕のボタン)と `clubui.js` の `htSetHtml`(準備の「戦略方針」に出す) → `enginetest.js` の ⑪。正本は docs/10 §10.8 |
| チームの成長グラフ(器・限界突破・黄金期)と KP のランク(B/A/S/G)を変える | 数値は `TUNING.grow.graph` と `TUNING.rank`、対角と2軸の KP は `data.js` の `AXIS_PAIR` / `STYLES` の `axes`、仕組みは `grow.js` の `graphAdd` / `graphBreak`、ランクは `engine.js` の `styleRank`、画面は `clubui.js` の `growGraphHtml` → `clubtest.js` の ⑥。正本は docs/15 |
| クラブオファー(3択・地域と規模と部・レアクラブ)・クラブの期待(獲得賞金)・オーナーの指令を変える | 数値は `TUNING.offer`、仕組みは `club.js` の末尾(`makeOffers` / `mkOffer` / `pickOffer` / `misAfterMatch`)、年俸は `term.js` の `endTerm`、画面は `clubui.js` の `offerHtml` / `expTileHtml` / `termExpHtml` → `clubtest.js` ④。正本は docs/16 |
| ポジション(左右・CF と ST)・適性を変える | 区切りと適性は `TUNING.zone` / `TUNING.apt`、細かいポジションと束ねは `data.js` の `GROUP_OF` / `BASE_ROLE`、位置からの判定は `engine.js` の `posAt` / `roleAt` / `aptOf`。実在選手は `tools/squads.local.txt`。正本は docs/17 |
| 育成の数値を変える | `data.js` の `TUNING.grow` → `clubtest.js` の ⑥。仕組みは `grow.js`、設計の正本は docs/05 §5.3〜5.6 |
| 特殊練習を直す | `tools/train_source.txt` → `python tools/gen_trainings.py`(`trainings.js` は生成物。手で編集しない) |
| 称号・年俸・引き継ぎを変える | `term.js` の `TITLES` と `data.js` の `TUNING.term` → `clubtest.js`。正本は docs/05 §5.8 |
| 実在クラブ・選手を直す・足す | `tools/squads.local.txt`(実名・Git管理外)→ `python tools/gen_cards.py` → `src/js/realcards.js`(偽名・生成物)と `packs/real.local.json`。**realcards.js は手で編集しない** |
| 場面(タイトル・対戦カード・結果・カード排出)を変える | `src/js/scenes.js`(描画)と `base.css` の末尾。設計の正本は docs/07 |
| 試合のあと(採点・チームの数字・ロッカールーム・優勝の撮影・排出の予兆・リプレイ)を変える | 採点は `engine.js` の `matchRatings` と `TUNING.rate` → `enginetest.js` の ⑨。場面は `scenes.js`、話す選手の知らせは `grow.js` の `newsOf`、リプレイは `main.js` の `stepReplay`。正本は docs/07 §7.12 |
| HOME の直近の試合・クラブ新聞(見出し・ゴシップ)を変える | 文の型と記事は `paper.js`、数は `TUNING.paper`、紙面は `clubui.js` の `lastHtml` / `paperHtml`。正本は docs/07 §7.13 |
| コミュニケーションのチャット(吹き出し)を変える | `clubui.js` の `commChatHtml` / `chatResult` と `theme.css` の「チャット」。正本は docs/07 §7.14 |
| 【仮】選手の絵を作り直す | `python tools/gen_player_art.py` → `src/js/art-players.js`(生成物)。使う所は `clubui.js` の `artSrc`、試合は `render.js` の `drawMan`。正本は docs/10 §10.9 |
| レアKP(固有名・技・効き目・カットイン)を変える・技を足す | 名前と技の割り当ては `tools/rarekp_source.txt` → `python tools/gen_rarekp.py` → `src/js/rarekp.js`(生成物)。技は `data.js` の `RARE_MOVES`、数値は `TUNING.rare`、発動は `engine.js` の `rareOf`、カットインは `scenes.js` の `cutIn` → `enginetest.js` の ⑫。正本は docs/11 |
| キャプテン・キッカーの任命を変える | 効き目は `engine.js` の `capApt` / `rolePlayer` / `refreshFx` / `spKicker` と `TUNING.cap`、任命とやる気は `pool.js` の `setRole`、画面は `clubui.js` の `sqRolesHtml` / `kickMark` → `enginetest.js` の ⑬。正本は docs/12 |
| 相手監督の采配(性格・陣形の変更・スペース・交代)を変える | 数値と性格の表は `TUNING.coach`、仕組みは `engine.js` の `coachStep` / `coachMove` / `setShape` / `coachAim` / `coachTacSub`、性格は `persOfClub`。実況は `main.js` の `shape` → `enginetest.js` の ⑭。正本は docs/13 |
| 試合の描画で、ボールを持たない選手の動き(ゆらぎ・走り込み・寄せ・遅れ)を変える | `render.js` の `offBallGoal` / `drawFrame` と `TUNING.view.mv`(見た目だけ。結果に触れない)。正本は docs/07 §7.15 |
| サイド攻撃・流れの中のクロスを変える | 数値は `TUNING.ins` の `flank*` と `TUNING.shot` の `xc*`、仕組みは `engine.js` の1ステップ(サイドの守備の厚さ・`M.ball.cross` / `xk`)と `shoot` の `xk`。正本は docs/02 §2.15 |
| タイトルのロゴ(オーナーが作ったもの)を差し替える | `assets/logo_src.png` を置き換え → `python tools/gen_logo.py` → `src/js/logo-img.js`(生成物)と `assets/logo_white.png` / `logo_black.png`。タイトルは `scenes.js` の `sceneTitle`。正本は docs/14 §14.17 |
| ロゴ(スラッシュ・ボール)を変える | `src/js/logo.js` の `ballMarkSvg` / `logoSvg` / `logoMarkSvg`(タイトル・看板・結果の透かし)、アイコンは `build.py` の `_png`。正本は docs/14 §14.8 |
| レーダー・適性の色・カードの裏を変える | `src/js/cardback.js`(`radarSvg` / `teamAxes` / `aptZones` / `aptOverlaySvg` / `aptMapSvg` / `cardBackHtml`)と theme.css の「適性の色・レーダー・カードの裏」。正本は docs/14 §14.14 |
| 既定の陣形(SQUAD)を変える | `clubui.js` の `squadHtml` / `sqBind`(描画・引っ張って入れ替え)/ `sqSwap`、`pool.js` の `fillLayout` / `setForm` / `moveSquad` / `autoSquad`(最適配置)。正本は docs/07 §7.10・docs/14 §14.12 |
| 監督室の画面を足す・変える | `clubui.js` の `clubHtml`(HOME / 準備の手順 / タブの振り分け)と `TABS`。構成の正本は docs/07 §7.9 |
| 見た目の決まり(ネオンのデザインシステム: 地・パネル・ボタン・タブ・アイコン・書体)を変える | `src/css/neon.css`(既定の th-bk にだけ掛かる。トークンは先頭の `--n-*` と `--fs-*`)、アイコンは `clubui.js` の `TAB_ICON`、書体は build.py の `FONTS`(英字と数字は `--f-num` に通す。カードだけは Oswald のまま)。地の透かしは `LOGO_IMG.wm`(`tools/gen_logo.py`)。正本は docs/14 §14.18・§14.19。**既定のホワイト × レッドは `src/css/white.css`**(`body.th-wl` にだけ掛かる。部品の名前は同じ。正本は §14.21) |
| テーマ(色)を足す・変える | `src/css/theme.css` の先頭のトークン(`--t-*`)の組。名前は `settings.js` の `THEMES`。**既定は暗い地の `th-bk`**(th-wr の形 + 暗い色の組。白を直に書いた部品は theme.css の末尾で直す)。設計の正本は docs/07 §7.8 |
| カードの見た目を変える | `clubui.js` の `cardHtml`(構成)と `theme.css` の「カード」(意匠) |
| 音を変える | `src/js/sound.js`(Web Audio で合成。音声ファイルは持たない)。BGM は末尾の `BGM_TRACKS`(曲)と `bgmPlay`(どこで鳴らすかは `showClub` / `newMatch` / `sceneResult` / タイトル)。正本は docs/14 §14.9 |
| 公開用を作る | `python build.py --dist` → `dist/`(index.html・manifest・sw.js・アイコン)。実名は入らない |
| 公開する(外に出る操作。決めたときだけ) | `python tools/publish.py` → https://istintone.github.io/wcc_f/ |
| 設定・データの画面を変える | `src/js/settings.js`(実名パックの読み込み・セーブの書き出しと読み込み) |
| 実名で遊ぶ(手元だけ) | `python build.py --real` → `index.local.html`(Git管理外。**公開しない**) |
| カードの一覧・レアリティ・払い出しの率を変える | `pool.js`(`RARITY` / `POOL`)と `data.js` の `TUNING.pack` → `clubtest.js` の ⑦。**一覧の作り方を変えるとカードの id が指す選手が変わる**(セーブのコレクションがずれる) |
| 保存・起動の守り(退避・保存の失敗・画面の消灯・音の復帰・公開前の確認)を変える | `clubui.js` の `initCareer` / `persist`、`club.js` の `rawSave` / `backupSave`、`main.js` の `wakeLock`、`build.py` の `_check_js`、`tools/publish.py` の `boot_check`。正本は docs/01 §1.7 |
| セーブ項目を増やす | `club.js` の `newCareer`。**古いセーブを読んだときに補う処理を `migrate` に足す**(いまは ver 1) |

## 姉妹プロジェクト

- `c:\Claude\repository\pftb` — **試合エンジンの原型**。考え方だけ取り込み、コードは写さない
  (取り込んだものは [docs/03](docs/03-decisions.md) に残す)
- `c:\Claude\repository\touchline` — 設計原則 P1〜P10
- `c:\Claude\repository\card-eleven` — 排出・カード描画の参考(段階4で読む)。試合エンジンは参考にしない
