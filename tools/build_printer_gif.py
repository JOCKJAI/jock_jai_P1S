from pathlib import Path
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "key-visual-printer-v2.png"
OUTPUT = ROOT / "public" / "printer-kv-printing-v3.gif"

TARGET_SIZE = (946, 1024)
FRAME_COUNT = 12
FRAME_DURATION_MS = 100

# The new key visual's spool is seen side-on. Rotate only its inner rotor in
# circular space, then compress it back to the original perspective. This
# keeps the frame, filament roll, printer body, and transparent silhouette
# pixel-perfect and stationary across every frame.
ROTOR_BOX = (84, 132, 220, 424)
ROTOR_MASK_BOX = (6, 5, 130, 287)


def make_rotor_mask(size: tuple[int, int]) -> Image.Image:
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse(ROTOR_MASK_BOX, fill=255)
    return mask


def to_gif_frame(frame: Image.Image, palette: Image.Image) -> Image.Image:
    """Quantize while reserving palette index 255 for true transparency."""
    alpha = frame.getchannel("A")
    paletted = frame.convert("RGB").quantize(
        palette=palette,
        dither=Image.Dither.NONE,
    )
    transparent = Image.new("P", frame.size, 255)
    transparent.putpalette(paletted.getpalette() + [0, 0, 0])
    transparent.paste(paletted, mask=alpha.point(lambda value: 255 if value >= 128 else 0))
    transparent.info["transparency"] = 255
    return transparent


def main() -> None:
    base = Image.open(SOURCE).convert("RGBA")
    left, top, right, bottom = ROTOR_BOX
    rotor = base.crop(ROTOR_BOX)
    rotor_mask = make_rotor_mask(rotor.size)

    # Undo the side-on perspective before rotation.
    circle_size = (rotor.height, rotor.height)
    rotor_circle = rotor.resize(circle_size, Image.Resampling.NEAREST)
    mask_circle = rotor_mask.resize(circle_size, Image.Resampling.NEAREST)

    rgba_frames: list[Image.Image] = []
    for index in range(FRAME_COUNT):
        # Filament leaves the top of the reel towards the printer, so the
        # visible front face turns clockwise while feeding.
        angle = -index * (360 / FRAME_COUNT)
        turned = rotor_circle.rotate(angle, resample=Image.Resampling.NEAREST)
        turned_mask = mask_circle.rotate(angle, resample=Image.Resampling.NEAREST)
        turned = turned.resize(rotor.size, Image.Resampling.NEAREST)
        turned_mask = turned_mask.resize(rotor.size, Image.Resampling.NEAREST)

        frame = base.copy()
        frame.alpha_composite(turned, (left, top), (0, 0, rotor.width, rotor.height))

        # Restore the untouched pixels outside the inner rotor ellipse.
        original_crop = base.crop(ROTOR_BOX)
        composite_crop = Image.composite(frame.crop(ROTOR_BOX), original_crop, rotor_mask)
        frame.paste(composite_crop, (left, top))
        frame = frame.resize(TARGET_SIZE, Image.Resampling.NEAREST)
        rgba_frames.append(frame)

    # A shared palette prevents the stationary printer from colour-shimmering
    # when the GIF advances to the next rotor frame.
    palette = rgba_frames[0].convert("RGB").quantize(
        colors=255,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    )
    frames = [to_gif_frame(frame, palette) for frame in rgba_frames]

    frames[0].save(
        OUTPUT,
        save_all=True,
        append_images=frames[1:],
        duration=FRAME_DURATION_MS,
        loop=0,
        disposal=2,
        transparency=255,
        optimize=False,
    )
    print(f"wrote {OUTPUT} ({FRAME_COUNT} frames, {TARGET_SIZE[0]}x{TARGET_SIZE[1]})")


if __name__ == "__main__":
    main()
