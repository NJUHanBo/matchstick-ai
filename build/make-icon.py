"""Generate app icon from the matchstick flame design."""
from PIL import Image, ImageDraw
import os, struct

SIZE = 1024
CENTER = SIZE // 2

def draw_icon(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = size / 64.0

    # Rounded rect background
    r = int(12 * s)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=(11, 11, 20, 255))

    # Matchstick body
    bx1, by1 = int(28 * s), int(26 * s)
    bx2, by2 = int(36 * s), int(54 * s)
    br = int(3 * s)
    d.rounded_rectangle([bx1, by1, bx2, by2], radius=br, fill=(214, 177, 106, 255))

    # Outer flame (orange)
    flame_points = []
    steps = 60
    import math
    cx, cy_base = CENTER, int(28 * s)
    flame_w = int(10 * s)
    flame_h = int(20 * s)
    top_y = int(8 * s)

    for i in range(steps + 1):
        t = i / steps
        if t <= 0.5:
            tt = t / 0.5
            x = cx + flame_w * math.sin(tt * math.pi)
            y = top_y + (cy_base - top_y) * tt
        else:
            tt = (t - 0.5) / 0.5
            angle = math.pi + tt * math.pi
            x = cx + flame_w * math.sin(angle) * (1 - tt * 0.3)
            y = cy_base - flame_h * 0.3 * math.sin(tt * math.pi)
        flame_points.append((x, y))

    d.polygon(flame_points, fill=(255, 107, 47, 255))

    # Draw a simpler elliptical flame
    d.ellipse([int(22 * s), int(12 * s), int(42 * s), int(38 * s)], fill=(255, 107, 47, 255))

    # Inner flame (yellow)
    d.ellipse([int(27 * s), int(17 * s), int(37 * s), int(33 * s)], fill=(255, 209, 102, 255))

    # Flame tip
    tip_points = [
        (CENTER, int(8 * s)),
        (int(26 * s), int(22 * s)),
        (int(38 * s), int(22 * s)),
    ]
    d.polygon(tip_points, fill=(255, 107, 47, 255))

    inner_tip = [
        (CENTER, int(15 * s)),
        (int(29 * s), int(24 * s)),
        (int(35 * s), int(24 * s)),
    ]
    d.polygon(inner_tip, fill=(255, 209, 102, 255))

    return img

def main():
    out_dir = os.path.join(os.path.dirname(__file__), '..', 'build')
    os.makedirs(out_dir, exist_ok=True)

    iconset = os.path.join(out_dir, 'icon.iconset')
    os.makedirs(iconset, exist_ok=True)

    sizes = [16, 32, 64, 128, 256, 512, 1024]
    for sz in sizes:
        img = draw_icon(sz)
        img.save(os.path.join(iconset, f'icon_{sz}x{sz}.png'))
        if sz <= 512:
            img2 = draw_icon(sz * 2)
            img2.save(os.path.join(iconset, f'icon_{sz}x{sz}@2x.png'))

    # Also save a 1024 PNG for electron-builder
    big = draw_icon(1024)
    big.save(os.path.join(out_dir, 'icon.png'))

    print(f'Icons saved to {iconset}')
    print(f'icon.png saved to {out_dir}')

if __name__ == '__main__':
    main()
