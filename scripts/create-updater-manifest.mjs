import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const repo = 'https://github.com/cat-xierluo/Folia';
const target = process.env.FOLIA_UPDATE_TARGET ?? 'darwin';
const arch = process.env.FOLIA_UPDATE_ARCH ?? 'aarch64';
const platform = `${target}-${arch}`;
const version = process.env.FOLIA_UPDATE_VERSION ?? '0.1.0';
const tag = process.env.FOLIA_UPDATE_TAG ?? `v${version}`;
const artifactName = process.env.FOLIA_UPDATE_ARTIFACT ?? 'Folia.app.tar.gz';

const signaturePath = resolve('src-tauri/target/release/bundle/macos/Folia.app.tar.gz.sig');
const outputPath = resolve(`src-tauri/target/release/bundle/updater/${platform}.json`);
const signature = (await readFile(signaturePath, 'utf8')).trim();

const manifest = {
  version,
  notes: process.env.FOLIA_UPDATE_NOTES ?? '',
  pub_date: new Date().toISOString(),
  platforms: {
    [platform]: {
      signature,
      url: `${repo}/releases/download/${tag}/${artifactName}`,
    },
  },
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${outputPath}`);
