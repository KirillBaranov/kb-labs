import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pngToIco from 'png-to-ico';
import sharp from 'sharp';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = join(scriptDir, '..');

const inputArg = process.argv[2] ?? 'app/icon.svg';
const outputArg = process.argv[3] ?? 'app/favicon.ico';

const inputPath = resolve(appRoot, inputArg);
const outputPath = resolve(appRoot, outputArg);
const sizes = [16, 32, 48];

async function main() {
  const svg = await readFile(inputPath);

  const pngBuffers = await Promise.all(
    sizes.map((size) =>
      sharp(svg, { density: 1200 })
        .resize(size, size, { fit: 'contain' })
        .png()
        .toBuffer(),
    ),
  );

  const icoBuffer = await pngToIco(pngBuffers);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, icoBuffer);

  console.log(`Generated favicon: ${outputPath}`);
}

main().catch((error) => {
  console.error('Failed to generate favicon:', error.message);
  process.exit(1);
});
