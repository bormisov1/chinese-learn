#!/usr/bin/env python3
"""Generate Android adaptive-icon and Play Store assets from assets/icon.png.

Outputs into assets/ (app icon layers) and store/play/ (Play Console uploads).
Run: python3 scripts/build-store-assets.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ICON = Image.open(ROOT / "assets" / "icon.png").convert("RGBA")
PEACH = (247, 192, 124, 255)  # #F7C07C, the icon background
OUT_ASSETS = ROOT / "assets"
OUT_PLAY = ROOT / "store" / "play"
OUT_PLAY.mkdir(parents=True, exist_ok=True)

# Adaptive icon: 1024px layers, safe zone is the inner 66% (675px circle).
# The foreground is the full icon scaled into the safe zone; its corners match
# the background layer color so the blend is invisible.
fg = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
scaled = ICON.resize((675, 675), Image.LANCZOS)
fg.paste(scaled, ((1024 - 675) // 2, (1024 - 675) // 2))
fg.save(OUT_ASSETS / "adaptive-icon-foreground.png")

# Splash icon: the icon's inner circle as a transparent PNG badge.
circle_mask = Image.new("L", (1024, 1024), 0)
ImageDraw.Draw(circle_mask).ellipse((160, 184, 864, 888), fill=255)
splash = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
splash.paste(ICON, (0, 0), circle_mask)
splash.save(OUT_ASSETS / "splash-icon.png")

# Play Store icon: 512x512.
ICON.resize((512, 512), Image.LANCZOS).save(OUT_PLAY / "play-icon-512.png")

# Feature graphic: 1024x500, icon badge on the peach background.
font_bold = ImageFont.truetype("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", 96)
font_hanzi = ImageFont.truetype("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", 160)
feature = Image.new("RGBA", (1024, 500), PEACH)
badge = Image.open(OUT_ASSETS / "splash-icon.png").resize((360, 360), Image.LANCZOS)
feature.paste(badge, (80, 70), badge)
draw = ImageDraw.Draw(feature)
draw.text((490, 145), "Hanzi", font=font_bold, fill=(32, 35, 31, 255))
draw.text((490, 255), "Deck", font=font_bold, fill=(32, 35, 31, 255))
draw.text((900, 150), "汉", font=font_hanzi, fill=(233, 113, 77, 255))
feature.convert("RGB").save(OUT_PLAY / "feature-graphic-1024x500.png")
print("done")
