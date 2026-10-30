# maps — 土地のミステリー・空白地帯シリーズ

海外向けの英語ショート (TikTok / YouTube Shorts 共通、縦 1080x1920)。書き出しは Remotion
(`.github/workflows/remotion.yml`、`script=maps/<名前>.json`)。台本の書き方は `geo_short/README.md` と同じで、
Remotion 版だけの追加は下の表。

## 規約

- **役割**: 海外向けに収益化を狙う地理系クリエイター。セリフは洗練された英語、演出の指示と解説は日本語。
- **長さ**: 63〜68 秒 (TikTok の Creator Rewards は 1 分超が条件。61 秒ちょうどは処理で 60 秒台に落ちる危険があるので余裕を持つ)。
  英語ナレーション約 170〜190 語 / 960〜1,040 文字 (Kokoro af_heart, speed 1.08 の実績)。
- **独自性 (収益化審査対策)**: データの羅列にせず、歴史・地理の「なぜ」を物語にする。
  止めたくなる仕掛け (地図の隅の小さな文字、隠れたヒント、一瞬の比較) を入れる。激しい点滅はしない。
- **構成**
  1. Hook (0〜2 秒): 1 フレーム目からタイトル帯と問い。最初の 1〜2 秒で離脱が決まる
  2. Deep Dive 1 (〜25 秒): 地図の動きに合わせた歴史・地理のエピソード
  3. Deep Dive 2 (〜45 秒): 他国や今のデータとの比較、独自の考察
  4. Climax & Mystery (〜60 秒): いちばんの謎・驚き
  5. Engagement (最後): コメントで議論が起きる二択・三択の問い (冒頭につながるとループする)
- **事実**: 出典を並べる手間はかけないが、数字・年・出来事は裏で確認して間違いを出さない
  (誇張しすぎた数字は「Actually...」と突っ込まれ、誤情報として伸びが抑えられる)。
- **避ける地域**: 台湾、ウクライナ、カシミール、イスラエル・パレスチナなど、今も争っている地域。
- **確認用の書式**: [Voiceover] (英語) / [Map Animation] (日本語) で台本を見せてから JSON にする。

## 固定スタイル (2026-10-30 に決定。ユーザーが「この感じ」で固定)

エジプト編 (`egypt_empty_en`) とザンジバル戦争 (`scripts/zanzibar_war_en.json`) の見た目を基準にする。

- 地図: Sentinel-2 の衛星写真が主役。寄りは span 0.8〜1.0 度まで
- 地形図 (`base: "relief"`) は砂漠・乾いた土地 (アフリカ、中東、オーストラリア内陸など) だけ。森や凍土・湖の多い所では迷彩柄のようにまだらになるので使わない
- 熱帯雨林 (アマゾン、コンゴ、東南アジア) は Sentinel-2 に斜めの縞が出るので、台本の一番上に `"imagery": "bluemarble"` を書き、寄りは span 4 度まで
- 1 シーン目は、主役の国を国旗で塗る (`"fill": {"EGY": "flag:eg"}`、2 シーン目で `null` にして消す)。輪郭で囲むより国旗のほうが一目で分かる
- 文字: 1 シーン目は 2 行の大きな問いのタイトル帯 (`banner.badge: false`)。字幕は Poppins の白文字 + 黒フチで、今読んでいる単語だけ黄色 (#ffd23f) にして少し弾ませる
- 数字: カウントアップ (`texts.count`)、比べるときは暗くした地図 + 棒グラフ (`dim` + `bars`)、大きさ比べは `ghosts`
- 人の分布: オレンジの光る点 (`swarms`)、国は赤く光る輪郭 (`outline`)、川・鉄道・柵は光る線 (`lines` の glow)
- キャラ: 2D ベクターのちびキャラのステッカー (白フチ + 影、弾んで出る・呼吸する・跳ねて歩く)。絵文字は使わない
- 使わないもの: 青い方眼の背景、3D 絵文字、BGM (投稿時に TikTok の曲を 10〜15% で付ける)

## カメラ

- 一番寄るときも `span` (画面の横幅の経度) は **0.8〜1.0 度まで**。それより寄ると衛星写真が粗く見える。
- 広い全体図 (span 10〜20) → 地域 (3〜5) → 寄り (1 前後) の 3 段くらいで動かす。

## Remotion 版で使える追加の指定

| キー | 内容 |
|---|---|
| `swarms` | 人が住む場所などの点の群れ `[{"path": [[経度, 緯度], ...], "count", "spread_km", "delay", "duration", "keep": true}]`。線に沿って順に灯る。`keep` でシーン末尾に消さない (次のシーンで `"delay": -9` にすると最初から点いた状態で続く) |
| `banner.badge` | `false` で 2 行目も大きな文字 (問いのタイトル向け) |
| `lines[].style` | `glow` (光る線) / `solid` / `dashed` / `arrow` / `arrow_dashed` |
| `base` | `"relief"` でベージュの地形図 |
| `dim` | `true` で地図の上に暗い膜をかけ、文字や棒グラフを読みやすくする (青い方眼 `blueprint` は AI っぽく見えるので使わない) |
| `bars` | 数字の比べっこの棒グラフ `{"title", "unit", "y", "delay", "items": [{"label", "value", "color"}]}`。`dim` と一緒に使う (国旗の絵文字は表示できないので文字だけ) |

地図は Sentinel-2 cloudless 2016 (EOX、CC BY 4.0) のタイル。説明欄に出典が自動で入る。

## ネタ帳 (事実の注意つき)

| # | ネタ | 注意 |
|---|---|---|
| 11 | Why is 95% of Egypt empty? | 「99% が 1%」は誇張。約 95% が国土の約 5% (ナイル沿い) に住む → **作成済み: egypt_empty_en** |
| 15 | Bir Tawil: the land nobody wants | 約 2,060 km²。主張するとハラーイブ・トライアングルを失う理屈で正しい |
| 13 | Why Greenland is not green | 赤毛のエイリーク (985 年ごろ)、氷床は約 80%。「最古の不動産詐欺」は冗談として言う |
| 12 | The US-Canada border "slash" | 幅約 6m (20 ft) の伐採帯を国際境界委員会が維持。「毎年」ではなく数年ごと。森 (ジャングルではない) |
| 8 | Why Canadians hug the US border | 「9 割」は誇張。約 75% が国境から 160km 以内 |
| 6 | Why is Australia empty? | 内陸が乾くのは主に亜熱帯高気圧帯。グレートディバイディング山脈は東側の雨を遮る一因にすぎない |
| 7 | The 5,600 km Dingo Fence | 「万里の長城より長い」は誤り (長城は約 21,000km)。「ロンドン〜ニューヨークより長い」なら正しい |
| 9 | Why nobody lives in Siberia | ロシアの約 77%。ヴァシュガン湿原 (約 5 万 km²、スイスより広い) |
| 14 | China's desert ghost city (Ordos) | 「国家の長期戦略」は推測なので「説がある」と言う |
| 10 | The Amazon's lawless border | 実在の事件・犯罪が絡むので後回し。扱うなら断定を避ける |

### 次のネタ (2026-10-30 追加。上から順に作る)

| # | ネタ | 見せ場・注意 |
|---|---|---|
| 16 | Why is Chile so long and thin? | 約 4,300km × 平均約 180km。ghosts で欧州や米国に重ねる。アンデスとアタカマ砂漠の「なぜ」 |
| 17 | Point Nemo: the loneliest place on Earth | 陸から約 2,700km。一番近い人間は宇宙ステーションのことがある。宇宙機の墓場 (imagery は海なので Blue Marble で可) |
| 18 | Russia and the US are 4 km apart | ダイオミード諸島。間に日付変更線があり「明日の島」と「昨日の島」。冬は氷で歩けるが渡るのは禁止 |
| 19 | The town where borders go through houses | バールレ = ヘルトフ / ナッサウ (ベルギーとオランダの飛び地が入り組む)。玄関の位置で国が決まる |
| 20 | The country inside a country | レソト: 南アフリカに完全に囲まれた国。国土全体が標高 1,000m 以上 |
| 21 | Why is Mongolia so empty? | 世界で一番人口密度が低い国 (約 2 人/km²)。人口の約半分がウランバートル |
| 22 | The 100 km gap in the Pan-American Highway | ダリエン地峡。道路がアラスカからアルゼンチンまでつながらない理由 (熱帯なので imagery: bluemarble) |
| 23 | Why does Alaska belong to the US? | 1867 年にロシアから 720 万ドルで購入。「スワードの愚行」と笑われた |
| 24 | Why is Indonesia moving its capital? | ジャカルタが沈んでいる (地下水のくみ上げ)。ボルネオの新首都ヌサンタラ (熱帯なので bluemarble) |
| 25 | Why do Japanese cities squeeze onto the coast? | 国土の約 3 分の 2 が森林・山地。平野に人が集中 |
