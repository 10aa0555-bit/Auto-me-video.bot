"""Cloudflare Workers AI の画像モデルを試し描きして、比べられるように PNG を保存する。

使い方: python tools/art_preview.py tools/art_preview.json out/previews
"""
import base64
import json
import os
import sys
import time

import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from geo_short.assets import _cf_credentials  # noqa: E402

jobs = json.load(open(sys.argv[1]))
out = sys.argv[2]
os.makedirs(out, exist_ok=True)
acct, token = _cf_credentials()
H = {"Authorization": f"Bearer {token}"}

for i, job in enumerate(jobs):
    model = job["model"]
    url = f"https://api.cloudflare.com/client/v4/accounts/{acct}/ai/run/{model}"
    t = time.time()
    try:
        if job.get("multipart"):
            form = {k: (None, str(v)) for k, v in job["params"].items()}
            r = requests.post(url, headers=H, files=form, timeout=300)
        else:
            r = requests.post(url, headers=H, json=job["params"], timeout=300)
        if r.headers.get("content-type", "").startswith("image/"):
            data = r.content
        else:
            j = r.json()
            if not j.get("success", True) or "result" not in j:
                print(f"[{i}] {model}: HTTP {r.status_code} {j.get('errors')}")
                continue
            data = base64.b64decode(j["result"]["image"])
        name = f"{i:02d}_{job.get('name', model.split('/')[-1])}.png"
        open(os.path.join(out, name), "wb").write(data)
        from PIL import Image
        w, h = Image.open(os.path.join(out, name)).size
        print(f"[{i}] {model}: OK {w}x{h} {time.time() - t:.1f}s -> {name}")
    except Exception as e:
        print(f"[{i}] {model}: 失敗 {e}")
