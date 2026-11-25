> [← 索引 (SPEC.md)](../SPEC.md)

## 1. アーキテクチャ

### 1.1 ファイル構成

```
wcc_f/
  index.html          ビルド成果物(単一ファイル)。直接編集しない
  build.py            src/ を結合して index.html を書き出す
  src/
    index.html        ひな形。/*__CSS__*/ と /*__JS__*/ に埋め込まれる
    css/base.css      配置と最初の見た目
    css/theme.css     テーマ(色のトークン)とカード・場面の意匠
    assets/fonts/     埋め込む書体(Oswald。SIL Open Font License)
    js/data.js        数値(TUNING)・手札・陣形・カード・クラブ・差し替え層
    js/engine.js      試合エンジン。DOM非依存
    js/realcards.js   実在16クラブの選手(偽名。生成物。tools/gen_cards.py が書き出す)
    js/trainings.js   特殊練習48種(生成物。tools/gen_trainings.py が書き出す)
    js/club.js        クラブ運営(大会・任期・相手クラブの生成・保存)。DOM非依存
    js/pool.js        カード(一覧・払い出し・登録の入れ替え)。DOM非依存
    js/grow.js        育成(練習・ラウンジ・ミーティング・★・連携・モチベーション)。DOM非依存
    js/term.js        任期の終わり(称号・年俸・施設・引き継ぎ)。DOM非依存
    js/render.js      試合映像(上半分・Canvas)
    js/board.js       カード盤面(下半分・DOM)
    js/clubui.js      クラブハウスの画面
    js/sound.js       音(Web Audio で合成)
    js/scenes.js      場面(タイトル・対戦カード・結果・カード排出)とエンブレム
    js/settings.js    設定・データ(実名パックの読み込み・セーブの書き出しと読み込み)
    js/main.js        進行と再生。起動の副作用を持つので必ず最後
    tests/            Node で回す検証
  docs/
  packs/              実名パックの置き場(*.local.json は Git管理外)
```

import/export やバンドラは使わない。文字列結合でグローバルスコープに連結する(前3作と同じ)。

### 1.2 層の分け方

```
 engine.js  ──▶  イベント列  ──▶  render.js / board.js
     ▲                                   │
     └────── orderMatch(指示) ◀──────────┘
```

- エンジンは**1ステップ解いて**イベントを返す。描画はそれを再生するだけ
- 盤面の操作は**指示**としてエンジンに積まれ、次のステップの入力になる
- 逆向きの矢印はこの1本だけ。描画がエンジンの状態を書き換えることはない

### 1.3 スマートフォン対応

| | |
|---|---|
| 向き | 縦持ち。上 = 映像(105:66) / 下 = 盤面(残り全部) |
| 高さ | `100dvh`。アドレスバーの出入りで盤面が隠れない |
| 入力 | Pointer Events。盤面は `touch-action:none`(ドラッグでページが動かない) |
| 拡大の抑止 | viewport の `user-scalable=no` に加え、iOS は `gesturestart` を止める |
| 切り欠き | `env(safe-area-inset-*)` |
| 裏に回ったとき | `visibilitychange` で一時停止する |

iPhone の Chrome は中身が Safari(WebKit)なので、**Android の Chrome と iPhone の両方で確かめる**。

### 1.4 表示の差し替え層(実名・画像)

**選手のID・能力は共通で、表示名と画像だけを差し替える。**

```js
const PACK={ names:{}, teams:{}, images:{} };
nameOf(card)      // PACK.names[card.id] があればそれ、無ければ架空名
teamNameOf(team)
```

- 本体(公開する側)には架空名しか入れない
- 実名パックは `packs/*.local.json` に置き、友人には**ファイルで直接渡す**
- 読み込みはゲーム内の「設定・データ」から(→§1.6)。`fetch` で取りに行かない
- カード画像の差し替えも同じ `PACK.images` に載せる

> 公開URLに実名データを置くと、モードを切り替え式にしても公開していることになる。
> だから「置かない」で成立させる。

### 1.5 配布(段階5)

**静的ホスティングに置き、URLで配る。** ホーム画面に追加すれば全画面で開き、オフラインでも動く。

```
python build.py --dist   →  dist/
    index.html             本体(単一ファイル。実名は入らない)
    manifest.webmanifest   ホーム画面に追加したときの名前・向き・アイコン
    sw.js                  Service Worker。版ごとにキャッシュを替える(先にネット、だめならキャッシュ)
    icon-192.png / icon-512.png / apple-touch-icon.png   アイコン(TOP のロゴのボール。tools/gen_logo.py → assets/)
```

- **公開先は GitHub Pages**(https://istintone.github.io/wcc_f/)。`python tools/publish.py` が検証 → `dist/` の書き出し →
  `gh-pages` ブランチへの push までを行う(gh-pages は公開用の中身だけ。履歴は持たない)
- Service Worker は `http(s)` で開いたときだけ登録する。`file://` で開いた index.html はいままでどおり動く
- **セーブは端末の中**(localStorage)。設定・データから**ファイルに書き出す / テキストでコピーする / 読み込む**ができる。
  ブラウザのデータを消すとセーブも消えるので、機種変更の前は書き出す

### 1.6 実名パックの読み込み

**本体には実名を入れない。** 実名で遊ぶ方法は2つ。

| 方法 | 使う人 | 中身 |
|---|---|---|
| 設定・データ →「パックを読み込む」 | 友人(公開版で遊ぶ) | パックのファイル(`packs/real.local.json`)を選ぶ。**その端末の localStorage にだけ**保存し、表示名を差し替える。「パックを外す」で偽名に戻る |
| `python build.py --real` | 手元 | パックを埋め込んだ `index.local.html` を作る(Git管理外。**公開しない**) |

- パックはファイルとして直接渡す(メッセージに添付するなど)。公開の場所には置かない
- 読み込みは `FileReader`。`fetch` で取りに行かない
- パックの形: `{ "names": { カードid: 実名 }, "teams": { クラブid: { "name": 実名 } } }`。
  このゲームのカードに1つも当てはまらないファイルは受け付けない

### 1.7 壊れないための決まり(2026-11-18)

1任期は100試合(約5時間)あるので、セーブが消えると遊びそのものが壊れる。

- **読めないセーブは上書きしない**。壊れた・新しい版で作られたセーブは `wcc_f.save.bad` に退避してから新しく始め、秘書が知らせる。退避もできなければ、その任期は端末に書かない(前のセーブを守る)。退避したものは CLUB の「設定・データ」から書き出す・消す(`club.js` の `rawSave` / `backupSave`、`clubui.js` の `initCareer`)
- 保存に失敗したら秘書が知らせる(`clubui.js` の `persist`。保存はすべてこれを通す)
- 起動時に `navigator.storage.persist()` を頼む(iPhone はしばらく開かないとサイトのデータを消すことがある)
- 試合の間は画面を消さない(Wake Lock。キックオフから試合終了まで。止めて考えている間も)
- 裏に回ったら音を止め、触ったら戻す(iPhone は電話や通知のあと音が止まったままになる)。押した音は click で鳴らす(なでてスクロールしただけで鳴らないように)
- **ビルドで連結した JS の構文を `node --check` で確かめる**。全ファイルが1つのスコープに入るので、名前の重なり(`const now` など)もここで止まる
- **公開の前に headless Chrome で起動しきるかを確かめる**(`tools/publish.py`)。起動しきると html に `data-boot="ok"`、起動中のエラーは `data-boot="err: …"` が付く

