#!/usr/bin/env bash
# 完成した動画などを renders ブランチに足す (GitHub Actions から呼ぶ)。
#   bash tools/publish_renders.sh "render: maps/foo.json" out/foo_hq.mp4 out/foo_hq_post.txt ...
# renders ブランチは動画がたまって数 GB あるので、中身は取り込まない:
# ファイルの一覧 (ツリー) だけを取り込み、新しいファイルを足したツリーを作って push する。
# 同じ名前のファイルは置き換える。push がぶつかったら取り込み直して再挑戦する。
set -euo pipefail
msg="$1"; shift
[ "$#" -gt 0 ] || { echo "publish_renders: ファイルがありません"; exit 0; }
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

# 新しいファイルを先に取り込んでおく (名前 → blob)
entries=$(for f in "$@"; do printf '100644 blob %s\t%s\n' "$(git hash-object -w "$f")" "$(basename "$f")"; done)
names=$(for f in "$@"; do basename "$f"; done)

for i in 1 2 3 4 5 6 7 8; do
  parent=()
  old=""
  if timeout 120 git fetch -q --depth=1 --filter=blob:none origin renders; then
    parent=(-p FETCH_HEAD)
    # 同じ名前の古いファイルは外す (blob は取り込まないので一覧の行だけ扱う)
    old=$(git ls-tree FETCH_HEAD | awk -F'\t' 'NR==FNR {skip[$0]=1; next} !($2 in skip)' <(printf '%s\n' "$names") -)
  fi
  tree=$(printf '%s\n%s\n' "$old" "$entries" | sed '/^$/d' | git mktree --missing)
  commit=$(git commit-tree "$tree" "${parent[@]}" -m "$msg")
  if timeout 300 git push -q origin "$commit:refs/heads/renders"; then
    echo "renders ブランチに $# 個のファイルを置きました"
    exit 0
  fi
  sleep $((RANDOM % 20 + 5))
done
echo "renders ブランチに置けませんでした (動画は Actions の成果物に残っています)"
exit 1
