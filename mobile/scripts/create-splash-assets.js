/**
 * Square icons with the logo contained (never stretched).
 * Android adaptive icons mask the outer ~18% — logo must stay in the center 56%.
 */
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const ASSETS = path.join(__dirname, '..', 'assets');
const SOURCE = fs.existsSync(path.join(ASSETS, 'logo-source.png'))
  ? path.join(ASSETS, 'logo-source.png')
  : path.join(ASSETS, 'logo.png');
const BG = { r: 255, g: 255, b: 255, alpha: 1 };
const IOS_FILL = 0.72;
const ADAPTIVE_FILL = 0.52;
const SPLASH_FILL = 0.88;

async function makeIcon(output, size, fill) {
  const trimmed = await sharp(SOURCE).trim({ threshold: 25 }).png().toBuffer();
  const { width: tw, height: th } = await sharp(trimmed).metadata();

  const maxInner = Math.round(size * fill);
  const scale = Math.min(maxInner / tw, maxInner / th);
  const newW = Math.round(tw * scale);
  const newH = Math.round(th * scale);
  const logo = await sharp(trimmed).resize(newW, newH, { fit: 'inside' }).png().toBuffer();

  const left = Math.round((size - newW) / 2);
  const top = Math.round((size - newH) / 2);

  await sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: logo, top, left }])
    .png()
    .toFile(output);

  console.log(`Created ${path.basename(output)} (${newW}x${newH} @ ${Math.round(fill * 100)}%)`);
}

async function main() {
  await makeIcon(path.join(ASSETS, 'icon-v12.png'), 1024, IOS_FILL);
  await makeIcon(path.join(ASSETS, 'icon.png'), 1024, IOS_FILL);
  await makeIcon(path.join(ASSETS, 'app-icon.png'), 1024, IOS_FILL);
  await makeIcon(path.join(ASSETS, 'adaptive-icon.png'), 1024, ADAPTIVE_FILL);
  await makeIcon(path.join(ASSETS, 'splash-icon.png'), 1024, SPLASH_FILL);
  await makeIcon(path.join(ASSETS, 'logo-header.png'), 512, SPLASH_FILL);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
