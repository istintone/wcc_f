# wcc_f

スマートフォンのブラウザで遊ぶ、カードを動かして采配するサッカーゲーム(1人用・CPU戦)。
**非商用。知り合いの範囲で遊ぶためのもの。**

- 遊ぶ: GitHub Pages の URL を開き、ホーム画面に追加する(全画面・オフラインで動く)
- セーブは端末の中。設定・データから書き出し / 読み込みができる
- 選手名・クラブ名は偽名。実名パックはこのリポジトリには置いていない

仕様は [SPEC.md](SPEC.md)、作業の進め方は [CLAUDE.md](CLAUDE.md)。

```bash
python build.py            # index.html を作る(src/ が正本)
python build.py --dist     # 公開用を dist/ に作る
cd src/tests && node enginetest.js && node clubtest.js
```
