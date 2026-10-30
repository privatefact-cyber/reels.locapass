"""写真の壁のダミー素材(仮)を作る。LOCAPASSに保存済みのイメージ写真(public/placeholders/、Pixabay由来)から、
業種ごとに24枚を選んで4:5に切り出し、public/photo-wall/<preset>/NN.jpg に小さく(120×150)書き出す。
本番用にAI生成した雰囲気写真を作ったら、同じファイル名で差し替える(コードは変更不要)。
使い方: python3 scripts/generate-photo-wall-dummies.py"""
import os, random, shutil
from PIL import Image, ImageOps

BASE = os.path.join(os.path.dirname(__file__), "..", "public")
SOURCES = {
    "cafe": ["food"], "restaurant": ["food"], "izakaya": ["food"],
    "shopping": ["shop", "other"], "sightseeing": ["tour"], "stay": ["stay"],
    "pet": ["pet"], "beauty": ["beauty", "flower"], "community": ["other", "tour"], "other": ["other"],
}
COUNT, W, H = 24, 120, 150

shutil.rmtree(os.path.join(BASE, "photo-wall"), ignore_errors=True)
for preset, groups in SOURCES.items():
    files = sorted(
        os.path.join(BASE, "placeholders", g, f)
        for g in groups
        for f in os.listdir(os.path.join(BASE, "placeholders", g))
        if f.lower().endswith(".jpg")
    )
    picks = random.Random(preset).sample(files, min(COUNT, len(files)))
    while len(picks) < COUNT:
        picks.append(random.Random(preset + str(len(picks))).choice(files))
    out = os.path.join(BASE, "photo-wall", preset)
    os.makedirs(out, exist_ok=True)
    for n, src in enumerate(picks, 1):
        img = ImageOps.fit(Image.open(src).convert("RGB"), (W, H), Image.LANCZOS)
        img.save(os.path.join(out, f"{n:02d}.jpg"), quality=72)
print("done")
