# howto/ — しくみ解説のジオラマ (英語、3D の模型)

- 参考にした作り方: 机の上の木の台座のジオラマで、道具や機械のしくみを落ち着いた英語ナレーションで説明する (台本・模型・名前はオリジナル)
- 書き出し: `script=howto/<名前>.json` → `tools/whatif_prep.py` (`"style": "diorama"`) → Remotion の `Diorama` (`--gl=swangle`)
- 舞台は 2 つ: `table` (木の台座の上の線路と汽車、原点) と `lab` (仕組みを大きく見せる実験台、x=300)。カメラは場面ごとの `cam` / `to` (ゆっくり動く先)、`cut: true` で暗転して切り替え
- lab の指定: `shift` (車輪の横ずれ)、`yaw`、`lift`、`turn`、`rings`、`arrows`、`sparks`、`flange`、`axle`、`push`、`labels` (lab の原点からの位置)
- 新しいネタで別の機械を見せるときは `remotion/src/diorama/Diorama.tsx` の lab に部品を足す
