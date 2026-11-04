# 鹿威しカコーン（Japan Garden KAKOON!）

竹筒に水がたまったらタップして「カコーン！」と鳴らす、ブラウザで遊ぶタイミングゲームです。

## 遊び方
- 3本の鹿威しに水がたまっていきます。
- 水が**金色ゾーン**にあるときにタップすると PERFECT（100点＋コンボボーナス）。
- 金色ゾーンより下ならGOOD（30点、コンボは途切れる）。早すぎると鳴りません。
- 水があふれるとライフが1つ減ります。ライフ3つを失うとゲームオーバー。
- 時間が経つほど水の勢いが増していきます。

## 起動方法
ES Modules を使っているため、ローカルサーバー経由で開いてください。

```bash
python3 -m http.server 8000
```

ブラウザで http://localhost:8000/ を開きます。GitHub Pages などの静的ホスティングにそのまま置けます。

## テスト
```bash
npm test
```

## 構成
| ファイル | 内容 |
|---|---|
| `index.html` / `style.css` | 画面（タイトル・プレイ・GAME OVER・広告オーバーレイ） |
| `src/main.js` | ゲーム本体（水量・判定・スコア・効果音・画面遷移） |
| `src/ads.js` | 広告ルール（`AdPolicy`）、収益試算、デモ用広告プロバイダ |
| `tests/ads.test.mjs` | 広告ルールと収益試算のテスト |
| `docs/game-design.md` | 企画書（広告・収益部分） |

## 広告について
現在の広告は**デモ用のモック**（`MockAdProvider`）です。カウントダウン付きの画面で代用しています。
本番では AdMob / Google AdSense for Games(H5) などの SDK に差し替えてください。
差し替えが必要なのは `MockAdProvider`（`isLoaded` / `show`）だけです。

## 公開（GitHub Pages）
`main` に push すると `.github/workflows/pages.yml` が自動でテストと公開を行います。
初回のみ、リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** に設定してください。
公開URL: https://techgymjp.github.io/shishi/
