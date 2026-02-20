import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const INPUT_SVG = path.join(repoRoot, "assets", "lagalaga.xml");
const PRIMARY_FONT = path.join(
  repoRoot,
  "assets",
  "fonts",
  "BitcountSingle-Bold.ttf",
);
const FALLBACK_FONT = path.join(
  repoRoot,
  "assets",
  "fonts",
  "BitcountSingle-Regular.ttf",
);

const OUT_DIR = path.join(repoRoot, "assets", "generated");

const OUT = {
  icon: path.join(OUT_DIR, "icon.png"),
  favicon: path.join(OUT_DIR, "favicon.png"),
  adaptiveFg: path.join(OUT_DIR, "adaptive-icon-foreground.png"),
  adaptiveBg: path.join(OUT_DIR, "adaptive-icon-background.png"),
  splash: path.join(OUT_DIR, "splash.png"),
};

const ICON_SIZES = [1024, 512, 256, 192, 180, 167, 152, 144, 120, 96, 72, 64, 48];
const FAVICON_SIZES = [64, 48, 32, 16];
const ADAPTIVE_ICON_SIZES = [1024, 512, 432, 192];
const SPLASH_SIZES = [
  { width: 1284, height: 2778 },
  { width: 1179, height: 2556 },
  { width: 1125, height: 2436 },
  { width: 1242, height: 2208 },
  { width: 1080, height: 1920 },
];

function assertPng(buffer, label) {
  const sig = buffer.subarray(0, 8);
  const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!sig.equals(pngSig)) {
    throw new Error(`${label} is not a valid PNG (bad signature)`);
  }
}

function parseViewBox(svg) {
  const m = svg.match(/viewBox="([^"]+)"/);
  if (!m) return null;
  const parts = m[1].trim().split(/\s+/).map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [, , w, h] = parts;
  return { w, h };
}

function stripBackgroundRect(svg) {
  // Remove one "background" <rect> (if present) and capture its fill color.
  // This SVG is the source of truth for brand color; the rest of the pipeline keys off it.
  const vb = parseViewBox(svg);
  const toNum = (v) => {
    if (!v) return null;
    const n = Number(String(v).replace(/px$/i, ""));
    return Number.isFinite(n) ? n : null;
  };
  const attr = (tag, name) => {
    const m = tag.match(new RegExp(`\\b${name}="([^"]+)"`));
    return m ? m[1] : null;
  };

  const rectElRe = /<rect\b[^>]*\/>|<rect\b[^>]*>[\s\S]*?<\/rect>/g;
  const rectTags = [...svg.matchAll(rectElRe)].map((m) => m[0]);
  if (!vb || rectTags.length === 0) return { svg, backgroundColor: "#FFFFFF" };

  const candidates = rectTags
    .map((tag) => {
      const fill = attr(tag, "fill");
      const w = toNum(attr(tag, "width"));
      const h = toNum(attr(tag, "height"));
      const x = toNum(attr(tag, "x")) ?? 0;
      const y = toNum(attr(tag, "y")) ?? 0;
      const coversViewBox = w === vb.w && h === vb.h && x === 0 && y === 0;
      return { tag, fill, coversViewBox };
    })
    .filter((c) => c.fill);

  // Prefer a rect that covers the entire viewBox; otherwise fall back to the first filled rect.
  const picked = candidates.find((c) => c.coversViewBox) ?? candidates[0];
  if (!picked) return { svg, backgroundColor: "#FFFFFF" };

  return {
    svg: svg.replace(picked.tag, ""),
    backgroundColor: picked.fill,
  };
}

async function pickFontFile() {
  try {
    await fs.access(PRIMARY_FONT);
    return PRIMARY_FONT;
  } catch {}
  try {
    await fs.access(FALLBACK_FONT);
    return FALLBACK_FONT;
  } catch {}
  return null;
}

function resvgRender(svg, width, fontFile) {
  // Resvg renders at viewBox scale; we then ensure exact output size via sharp.
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    font: {
      loadSystemFonts: false,
      fontFiles: fontFile ? [fontFile] : [],
    },
  });
  const png = Buffer.from(resvg.render().asPng());
  assertPng(png, "resvg output");
  return png;
}

async function writePng(filePath, buffer, label) {
  assertPng(buffer, label);
  await fs.writeFile(filePath, buffer);
}

function withSizeSuffix(filePath, suffix) {
  const parsed = path.parse(filePath);
  return path.join(parsed.dir, `${parsed.name}-${suffix}${parsed.ext}`);
}

async function writeSquareVariants(sourcePng, baseOutPath, sizes, labelPrefix) {
  const outputs = {};
  for (const size of sizes) {
    const filePath = withSizeSuffix(baseOutPath, String(size));
    const png = await sharp(sourcePng)
      .resize(size, size, { fit: "cover", kernel: "lanczos3" })
      .png()
      .toBuffer();
    await writePng(filePath, png, `${labelPrefix}-${size}.png`);
    outputs[String(size)] = path.relative(repoRoot, filePath);
  }
  return outputs;
}

async function makeSplash(width, height, backgroundColor, logoPng) {
  const logo = await sharp(logoPng)
    .resize(Math.round(width * 0.35), Math.round(width * 0.35), {
      fit: "contain",
      kernel: "lanczos3",
    })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: backgroundColor,
    },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toBuffer();
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const svgRaw = await fs.readFile(INPUT_SVG, "utf8");
  const { svg: svgNoBg, backgroundColor } = stripBackgroundRect(svgRaw);
  const fontFile = await pickFontFile();

  // 1) App icon (1024x1024) from original SVG.
  const iconRaw = resvgRender(svgRaw, 1024, fontFile);
  const iconPng = await sharp(iconRaw)
    .resize(1024, 1024, { fit: "cover", kernel: "lanczos3" })
    .png()
    .toBuffer();
  await writePng(OUT.icon, iconPng, "icon.png");
  const iconVariants = await writeSquareVariants(iconPng, OUT.icon, ICON_SIZES, "icon");

  // 2) Favicon (48x48) derived from icon for consistency.
  const faviconPng = await sharp(iconPng)
    .resize(48, 48, { fit: "cover", kernel: "lanczos3" })
    .png()
    .toBuffer();
  await writePng(OUT.favicon, faviconPng, "favicon.png");
  const faviconVariants = await writeSquareVariants(iconPng, OUT.favicon, FAVICON_SIZES, "favicon");

  // 3) Adaptive icon background (1024x1024) as a solid color.
  const adaptiveBgPng = await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: backgroundColor,
    },
  })
    .png()
    .toBuffer();
  await writePng(OUT.adaptiveBg, adaptiveBgPng, "adaptive-icon-background.png");
  const adaptiveBgVariants = await writeSquareVariants(
    adaptiveBgPng,
    OUT.adaptiveBg,
    ADAPTIVE_ICON_SIZES,
    "adaptive-icon-background",
  );

  // 4) Adaptive icon foreground (1024x1024, transparent) with padding for safe zone.
  const fgRaw = resvgRender(svgNoBg, 1024, fontFile);
  const fgSized = await sharp(fgRaw)
    .resize(820, 820, { fit: "contain", kernel: "lanczos3" })
    .png()
    .toBuffer();
  const adaptiveFgPng = await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: fgSized, gravity: "center" }])
    .png()
    .toBuffer();
  await writePng(OUT.adaptiveFg, adaptiveFgPng, "adaptive-icon-foreground.png");
  const adaptiveFgVariants = await writeSquareVariants(
    adaptiveFgPng,
    OUT.adaptiveFg,
    ADAPTIVE_ICON_SIZES,
    "adaptive-icon-foreground",
  );

  // 5) Splash (1284x2778) with centered logo and generous padding.
  const splashPng = await makeSplash(1284, 2778, backgroundColor, fgRaw);
  await writePng(OUT.splash, splashPng, "splash.png");
  const splashVariants = {};
  for (const { width, height } of SPLASH_SIZES) {
    const variant = await makeSplash(width, height, backgroundColor, fgRaw);
    const filePath = withSizeSuffix(OUT.splash, `${width}x${height}`);
    await writePng(filePath, variant, `splash-${width}x${height}.png`);
    splashVariants[`${width}x${height}`] = path.relative(repoRoot, filePath);
  }

  // Print backgroundColor for config parity.
  process.stdout.write(
    JSON.stringify(
      {
        outDir: path.relative(repoRoot, OUT_DIR),
        backgroundColor,
        fontFile: fontFile ? path.relative(repoRoot, fontFile) : null,
        outputs: Object.fromEntries(Object.entries(OUT).map(([k, v]) => [k, path.relative(repoRoot, v)])),
        variants: {
          icon: iconVariants,
          favicon: faviconVariants,
          adaptiveIconBackground: adaptiveBgVariants,
          adaptiveIconForeground: adaptiveFgVariants,
          splash: splashVariants,
        },
      },
      null,
      2,
    ) + "\n",
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
