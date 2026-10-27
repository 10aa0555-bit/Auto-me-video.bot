"""Cloudflare Workers AI の接続確認 (Secrets の中身は表示せず、形と API の返事だけを出す)。"""
import os
import re
import sys

import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def shape(name):
    v = os.environ.get(name, "")
    parts = re.findall(r"\S+", v)
    desc = [f"{len(p)}文字{'(32桁の16進=アカウントIDの形)' if re.fullmatch(r'[0-9a-f]{32}', p) else ''}"
            for p in parts]
    print(f"{name}: {v.count(chr(10)) + 1} 行, 部分 {len(parts)} 個: {', '.join(desc) or '空'}")


shape("CF_ACCOUNT_ID")
shape("CF_API_TOKEN")

from geo_short.assets import _cf_credentials  # noqa: E402
acct, token = _cf_credentials()
H = {"Authorization": f"Bearer {token}"}
base = "https://api.cloudflare.com/client/v4"


def show(label, r):
    try:
        j = r.json()
        info = {k: j.get(k) for k in ("success", "errors", "messages")}
        if isinstance(j.get("result"), dict):
            info["result_keys"] = list(j["result"].keys())[:5]
            info["status"] = j["result"].get("status")
    except Exception:
        info = r.text[:300]
    print(f"{label}: HTTP {r.status_code} {info}")


show("トークン確認 (user)", requests.get(f"{base}/user/tokens/verify", headers=H, timeout=30))
show("トークン確認 (account)", requests.get(f"{base}/accounts/{acct}/tokens/verify", headers=H, timeout=30))
show("アカウント", requests.get(f"{base}/accounts/{acct}", headers=H, timeout=30))
show("FLUX 生成", requests.post(f"{base}/accounts/{acct}/ai/run/@cf/black-forest-labs/flux-1-schnell",
                               headers=H, json={"prompt": "a cute cartoon pig", "steps": 4}, timeout=120))
