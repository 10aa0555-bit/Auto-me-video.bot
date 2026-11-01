import base64, json, subprocess, html, os
os.chdir('/home/user/Auto-me-video.bot')
REPO = "https://github.com/10aa0555-bit/Auto-me-video.bot/raw/renders/"
def post(name):
    for f in (f"{name}_hq_post.txt", f"{name}_post.txt"):
        r = subprocess.run(["git", "show", f"origin/renders:{f}"], capture_output=True, text=True)
        if r.returncode == 0:
            txt = r.stdout.strip()
            body, _, pin = txt.partition("--- 固定コメント ---")
            return body.strip(), pin.strip(), (f.replace("_post.txt", ".mp4"))
    return "", "", name + ".mp4"
def thumb(name):
    p = f"deliver/thumbs/{name}.jpg"
    return "data:image/jpeg;base64," + base64.b64encode(open(p, "rb").read()).decode() if os.path.exists(p) else ""
def secs(mp4):
    return None
GEO_POSTED = [("baarle_border_en", "A Border Through Your House?", 348, "18時間"), ("darien_gap_en", "The Road That Never Connects", 397, "2日前"),
              ("diomede_islands_en", "Russia and the US 4 km apart", 205, "2日前"), ("pig_war_en", "The Pig War", 295, "4日前"), ("emu_war_v2_en", "The Great Emu War", 302, "4日前")]
GEO_QUEUE = [("lesotho_inside_en", "国の中の国（地球ズーム付き）"),
             ("point_nemo_en", "地球で一番孤独な場所"), ("amazon_border_en", "車で行けない大都市"), ("border_slash_en", "世界一長い国境の“散髪”"),
             ("ordos_ghost_en", "100万人用に作った無人の街"), ("alaska_purchase_en", "アラスカはなぜアメリカ？"), ("dingo_fence_en", "5,600 km のフェンス"),
             ("zanzibar_war_en", "Ridiculous Wars #3 として（38分の戦争）"), ("chile_thin_en", "チリはなぜ細い？"), ("saudi_no_rivers_en", "川が1本もない大国"),
             ("canada_border_en", "カナダ人は国境ぎわに住む"), ("jakarta_sinking_en", "沈む首都"), ("greenland_name_en", "グリーンランドの名前の謎"),
             ("dancing_plague_en", "踊りが止まらない町（歴史）"), ("whisky_war_en", "Ridiculous Wars #4 として（古い作り）"), ("japan_coast_en", "日本はなぜ混む？"),
             ("mongolia_empty_en", "「なぜ空っぽ？」系は間をあけて"), ("siberia_empty_en", "「なぜ空っぽ？」系"), ("australia_empty_en", "「なぜ空っぽ？」系")]
MOTIV = [("nobody_coming_en", "1本目向き。強いフック"), ("quiet_one_en", ""), ("mirror_enemy_en", "鏡の赤い目がヨハンっぽい"), ("discipline_en", ""),
         ("three_am_en", "夜21〜23時投稿と相性◎"), ("cold_mind_en", ""), ("burn_past_en", ""), ("one_of_crowd_en", ""), ("pain_teacher_en", ""),
         ("top_of_stairs_en", ""), ("weeks_en", "今日できた最新"), ("stardust_en", "宇宙の絵（他と見た目が違うので最後）")]
HOLD = [("egypt_empty_en", "好みじゃない → 出さない"), ("bir_tawil_en", "好みじゃない → 出さない"), ("emu_war_en", "v2 を投稿済みなので出さない"),
        ("alvarenga_en", "3D 物語（方針外）"), ("violet_jessop_en", "3D 物語（方針外）"), ("roy_sullivan_en", "3D 物語（方針外）"), ("sea_rise_en", "What if（方針外）")]
def card(name, note, status, idx=None, extra=""):
    body, pin, mp4 = post(name)
    title = body.split("\n")[0] if body else name
    t = thumb(name)
    img = f'<img src="{t}" alt="" loading="lazy">' if t else '<div class="noimg"></div>'
    num = f'<span class="num">{idx}</span>' if idx else ""
    badge = {"posted": '<span class="b posted">投稿済み</span>', "next": '<span class="b next">次はこれ</span>', "queue": "", "hold": '<span class="b hold">出さない</span>'}[status]
    copy = "" if status in ("posted", "hold") else f'''<div class="btns"><button data-copy="{html.escape(body)}">説明文をコピー</button><button data-copy="{html.escape(pin)}">固定コメントをコピー</button><a href="{REPO}{mp4}">動画を開く</a></div>'''
    return f'''<article class="card {status}">{img}<div class="info">{num}{badge}<h3>{html.escape(title)}</h3>{f'<p class="note">{html.escape(note)}</p>' if note else ''}{extra}{f'<p class="pin">📌 {html.escape(pin)}</p>' if pin and status!="hold" else ''}{copy}</div></article>'''
geo_posted = "".join(card(n, "", "posted", extra=f'<p class="stat">{v} 回再生・{d}</p>') for n, _, v, d in GEO_POSTED)
geo_q = "".join(card(n, note, "next" if i == 0 else "queue", i + 1) for i, (n, note) in enumerate(GEO_QUEUE))
mot = "".join(card(n, note, "next" if i == 0 else "queue", i + 1) for i, (n, note) in enumerate(MOTIV))
hold = "".join(card(n, note, "hold") for n, note in HOLD)
page = open("tools/catalog_tpl.html").read()
page = page.replace("{{GEO_POSTED}}", geo_posted).replace("{{GEO_QUEUE}}", geo_q).replace("{{MOTIV}}", mot).replace("{{HOLD}}", hold)
page = page.replace("{{COUNTS}}", f"地理 {len(GEO_POSTED)} 本投稿済み・{len(GEO_QUEUE)} 本待機 ／ モチベーション {len(MOTIV)} 本待機")
open("deliver/catalog.html", "w").write(page)
print(len(page) // 1024, "KB")
