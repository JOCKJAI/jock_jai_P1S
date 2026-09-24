from pathlib import Path

from PIL import Image, ImageChops, ImageEnhance, ImageFilter, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "key-visual-printer-completed.png"
OUTPUT = ROOT / "public" / "printer-kv-completed.gif"

TARGET_SIZE = (946, 1024)
FRAME_DURATION_MS = 110
PULSE = (1.00, 0.92, 1.04, 0.97, 1.01, 0.86, 1.05, 0.96, 1.02, 0.90, 1.00, 0.98)
HOLOGRAM_BOX = (350, 530, 970, 1050)


def make_hologram_mask(image: Image.Image) -> Image.Image:
    mask = Image.new("L", image.size, 0)
    pixels = image.load()
    output = mask.load()
    left, top, right, bottom = HOLOGRAM_BOX

    for y in range(top, min(bottom, image.height)):
        for x in range(left, min(right, image.width)):
            red, green, blue, alpha = pixels[x, y]
            is_projection = (
                alpha > 0
                and green > 105
                and (green - red > 34 or blue - red > 22)
                and green + blue > 245
            )
            if is_projection:
                output[x, y] = 255

    glow = mask.filter(ImageFilter.GaussianBlur(5))
    return ImageChops.lighter(mask, glow.point(lambda value: min(190, value * 2)))


def to_gif_frame(frame: Image.Image, palette: Image.Image) -> Image.Image:
    alpha = frame.getchannel("A")
    paletted = frame.convert("RGB").quantize(palette=palette, dither=Image.Dither.NONE)
    transparent = Image.new("P", frame.size, 255)
    transparent.putpalette(paletted.getpalette() + [0, 0, 0])
    transparent.paste(paletted, mask=alpha.point(lambda value: 255 if value >= 128 else 0))
    transparent.info["transparency"] = 255
    return transparent


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    hologram_mask = make_hologram_mask(source)
    bright_source = ImageEnhance.Brightness(source)
    rgba_frames: list[Image.Image] = []

    left, top, right, bottom = HOLOGRAM_BOX
    scan_height = 8
    scan_range = max(1, bottom - top - scan_height)

    for index, pulse in enumerate(PULSE):
        frame = Image.composite(bright_source.enhance(pulse), source, hologram_mask)

        # A narrow brighter band travels down the projection without moving
        # the printer, the rocket, or the COMPLETED lettering.
        scan_y = top + round(scan_range * index / (len(PULSE) - 1))
        band = Image.new("L", source.size, 0)
        ImageDraw.Draw(band).rectangle((left, scan_y, right, scan_y + scan_height), fill=170)
        band = ImageChops.multiply(band, hologram_mask)
        frame = Image.composite(bright_source.enhance(1.12), frame, band)

        rgba_frames.append(frame.resize(TARGET_SIZE, Image.Resampling.NEAREST))

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
    print(f"wrote {OUTPUT} ({len(frames)} frames, {TARGET_SIZE[0]}x{TARGET_SIZE[1]})")


if __name__ == "__main__":
    main()
