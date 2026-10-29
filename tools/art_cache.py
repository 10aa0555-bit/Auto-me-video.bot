"""描いた AI イラストを art-cache ブランチに保存・復元する (Actions のキャッシュは消えることがあるため)。

使い方:
    python tools/art_cache.py restore   # ブランチの絵を ~/.cache/geo_short/art に戻す
    python tools/art_cache.py save      # まだ保存していない絵を JPEG にしてブランチに push する

ファイル名はキャッシュと同じ (square_<hash>) で、拡張子だけ .jpg にする。読み込みは中身で判定するので、
復元時は .png の名前のまま JPEG を置く。
"""
import glob
import os
import shutil
import subprocess
import sys
import tempfile

import cv2

ART = os.path.expanduser("~/.cache/geo_short/art")
BRANCH = "art-cache"


def git(*args, cwd=None, check=True):
    return subprocess.run(["git", *args], cwd=cwd, check=check, capture_output=True, text=True)


def fetch(dest):
    """ブランチの中身を dest に展開する。ブランチが無ければ False。"""
    if git("fetch", "-q", "origin", BRANCH, check=False).returncode != 0:
        return False
    archive = subprocess.run(["git", "archive", "FETCH_HEAD"], check=True, capture_output=True).stdout
    subprocess.run(["tar", "-x", "-C", dest], input=archive, check=True)
    return True


def restore():
    os.makedirs(ART, exist_ok=True)
    with tempfile.TemporaryDirectory() as d:
        if not fetch(d):
            print("art-cache ブランチはまだありません")
            return
        n = 0
        for f in glob.glob(os.path.join(d, "*.jpg")):
            dst = os.path.join(ART, os.path.basename(f)[:-4] + ".png")
            if not os.path.exists(dst):
                shutil.copy(f, dst)
                n += 1
        print(f"保存済みの絵を {n} 枚戻しました")


def save():
    with tempfile.TemporaryDirectory() as d:
        repo = os.path.join(d, "repo")
        os.makedirs(repo)
        have = fetch(repo)
        new = []
        for f in glob.glob(os.path.join(ART, "square_*.png")):
            name = os.path.basename(f)[:-4] + ".jpg"
            if not os.path.exists(os.path.join(repo, name)):
                img = cv2.imread(f, cv2.IMREAD_COLOR)
                if img is not None:
                    cv2.imwrite(os.path.join(repo, name), img, [cv2.IMWRITE_JPEG_QUALITY, 93])
                    new.append(name)
        if not new:
            print("新しく保存する絵はありません")
            return
        git("init", "-q", cwd=repo)
        git("config", "user.name", "github-actions[bot]", cwd=repo)
        git("config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com", cwd=repo)
        url = git("remote", "get-url", "origin").stdout.strip()
        git("remote", "add", "origin", url, cwd=repo)
        # 認証情報 (Actions の extraheader など) を引き継ぐ
        for line in git("config", "--get-regexp", r"^http\..*\.extraheader$", check=False).stdout.splitlines():
            key, val = line.split(" ", 1)
            git("config", key, val, cwd=repo)
        if have:
            git("fetch", "-q", "origin", BRANCH, cwd=repo)
            git("reset", "-q", "--soft", "FETCH_HEAD", cwd=repo)
        git("add", "-A", cwd=repo)
        git("commit", "-qm", f"art: {len(new)} 枚", cwd=repo)
        for _ in range(3):
            if git("push", "-q", "origin", f"HEAD:{BRANCH}", cwd=repo, check=False).returncode == 0:
                print(f"絵を {len(new)} 枚保存しました")
                return
            git("fetch", "-q", "origin", BRANCH, cwd=repo)
            git("rebase", "-q", "FETCH_HEAD", cwd=repo, check=False)
        sys.exit("art-cache への push に失敗しました")


if __name__ == "__main__":
    {"restore": restore, "save": save}[sys.argv[1]]()
