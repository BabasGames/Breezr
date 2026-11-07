#!/usr/bin/env python3
"""Renders the tray menu icons (src/img/menu-*.png) from the Material Symbols Rounded font (Apache 2.0).

The PNGs are white masks: the app tints them to the menu's text colour at runtime. Run again only to add or
change an icon:  python3 scripts/gen-menu-icons.py /path/to/MaterialSymbolsRounded.ttf
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# name: (codepoint, filled)
ICONS = {
    'track': (0xE405, True),          # music_note
    'previous': (0xE045, True),       # skip_previous
    'play': (0xE037, True),           # play_arrow
    'pause': (0xE034, True),          # pause
    'next': (0xE044, True),           # skip_next
    'shuffle': (0xE043, False),       # shuffle
    'shuffle-on': (0xE9E1, False),    # shuffle_on
    'repeat': (0xE040, False),        # repeat
    'repeat-on': (0xE9D6, False),     # repeat_on
    'repeat-one-on': (0xE9D7, False), # repeat_one_on
    'like': (0xE87D, False),          # favorite (outline)
    'liked': (0xE87D, True),          # favorite (filled)
    'open': (0xE89E, False),          # open_in_new
    'settings': (0xE8B8, False),      # settings
    'update': (0xE923, False),        # update
    'info': (0xE88E, False),          # info
    'quit': (0xE8AC, False),          # power_settings_new
}

# Optical size follows the drawn size (the axis starts at 20).
SIZES = {'': (16, 20), '@2x': (32, 32)}


def render(font_path: str, codepoint: int, filled: bool, size: int, opsz: int) -> Image.Image:
    font = ImageFont.truetype(font_path, size)
    font.set_variation_by_axes([1 if filled else 0, 0, opsz, 400])  # Fill, Grade, Optical size, Weight
    mask = Image.new('L', (size, size))
    # With the baseline at the bottom edge, the font's em square fills the canvas exactly.
    ImageDraw.Draw(mask).text((0, size), chr(codepoint), font=font, fill=255, anchor='ls')
    icon = Image.new('RGBA', (size, size), (255, 255, 255, 0))
    icon.putalpha(mask)
    return icon


def main() -> None:
    font_path = sys.argv[1]
    out = Path(__file__).resolve().parent.parent / 'src' / 'img'
    for name, (codepoint, filled) in ICONS.items():
        for suffix, (size, opsz) in SIZES.items():
            render(font_path, codepoint, filled, size, opsz).save(out / f'menu-{name}{suffix}.png', optimize=True)


if __name__ == '__main__':
    main()
