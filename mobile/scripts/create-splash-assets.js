/**
 * Creates padded splash + icon assets so the logo fits Android's circular splash mask.
 */
const path = require('path');
const sharp = require('sharp');

const ASSETS = path.join(__dirname, '..', 'assets');
const SOURCE = path.join(ASSETS, 'logo.png');
const BG = { r: 245, g: 249, b: 252, alpha: 1 }; // #F5F9FC

async function createPaddedSquare({ output, size, logoScale }) {
  const logoSize = Math.round(size * logoScale);
  const offset = Math.round((size - logoSize) / 2);

  const logo = await sharp(SOURCE)
    .resize(logoSize, logoSize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BG,
    },
  })
    .composite([{ input: logo, top: offset, left: offset }])
    .png()
    .toFile(output);

  console.log(`Created ${path.basename(output)} (${size}px, logo ${logoScale * 100}%)`);
}

async function main() {
  const meta = await sharp(SOURCE).metadata();
  console.log(`Source logo: ${meta.width}x${meta.height}, ${meta.format}`);

  // ~58% fits safely inside Android's circular splash mask (2/3 diameter rule)
  await createPaddedSquare({
    output: path.join(ASSETS, 'splash-icon.png'),
    size: 1024,
    logoScale: 0.58,
  });

  await createPaddedSquare({
    output: path.join(ASSETS, 'adaptive-icon.png'),
    size: 1024,
    logoScale: 0.58,
  });

  // In-app header logo — slightly larger, still padded
  await createPaddedSquare({
    output: path.join(ASSETS, 'logo-header.png'),
    size: 512,
    logoScale: 0.72,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
