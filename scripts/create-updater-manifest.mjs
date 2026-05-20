import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { arch, platform } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

const githubRepo = process.env.FOLIA_UPDATE_REPO ?? 'https://github.com/cat-xierluo/Folia';
const giteeRepo = process.env.FOLIA_UPDATE_GITEE_REPO ?? 'https://gitee.com/cat-xierluo/Folia';
const version = process.env.FOLIA_UPDATE_VERSION ?? await readConfiguredVersion();
const tag = process.env.FOLIA_UPDATE_TAG ?? `v${version}`;
const notes = process.env.FOLIA_UPDATE_NOTES ?? `Folia ${version}`;
const signatureRoot = resolve(process.env.FOLIA_SIGNATURE_DIR ?? 'src-tauri/target/release/bundle');
const outputPath = resolve(process.env.FOLIA_MANIFEST_OUTPUT ?? 'src-tauri/target/release/bundle/updater/latest.json');
const giteeOutputPath = resolve(
  process.env.FOLIA_GITEE_MANIFEST_OUTPUT ?? 'src-tauri/target/release/bundle/updater/latest-gitee.json',
);
const requiredPlatforms = (process.env.FOLIA_REQUIRE_PLATFORMS ?? '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

async function readConfiguredVersion() {
  const raw = await readFile(resolve('src-tauri/tauri.conf.json'), 'utf8');
  return JSON.parse(raw).version;
}

async function findSignatureFiles(dir) {
  const result = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...await findSignatureFiles(path));
    } else if (entry.isFile() && entry.name.endsWith('.sig')) {
      result.push(path);
    }
  }
  return result;
}

function defaultMacPlatform() {
  if (process.env.FOLIA_UPDATE_TARGET) return process.env.FOLIA_UPDATE_TARGET;
  if (platform() !== 'darwin') return undefined;
  return arch() === 'arm64' ? 'darwin-aarch64' : 'darwin-x86_64';
}

function platformForAsset(assetName) {
  const name = assetName.toLowerCase();
  const isMacUpdater = name.includes('.app.tar.gz');
  const isWindowsUpdater = name.includes('nsis')
    || name.includes('msi')
    || name.includes('setup')
    || name.endsWith('.exe')
    || name.endsWith('.exe.zip');

  if (isMacUpdater && (name.includes('aarch64') || name.includes('arm64'))) return 'darwin-aarch64';
  if (isMacUpdater && (name.includes('x86_64') || name.includes('x64'))) return 'darwin-x86_64';
  if (isMacUpdater) return defaultMacPlatform();

  if (isWindowsUpdater && (name.includes('x86_64') || name.includes('x64') || name.includes('setup'))) {
    return 'windows-x86_64';
  }

  return undefined;
}

function priorityForAsset(assetName) {
  const name = assetName.toLowerCase();
  if (name.includes('nsis')) return 30;
  if (name.endsWith('.exe') || name.endsWith('.exe.zip')) return 20;
  if (name.includes('msi')) return 10;
  return 1;
}

async function collectPlatforms() {
  const signatureFiles = await findSignatureFiles(signatureRoot);
  if (signatureFiles.length === 0) {
    throw new Error(`No updater signature files found under ${signatureRoot}`);
  }

  const selected = {};
  for (const signaturePath of signatureFiles) {
    const signatureName = basename(signaturePath);
    const assetName = signatureName.replace(/\.sig$/, '');
    const platformName = platformForAsset(assetName);
    if (!platformName) continue;

    const priority = priorityForAsset(assetName);
    if (selected[platformName] && selected[platformName].priority >= priority) continue;

    selected[platformName] = {
      assetName,
      priority,
      signature: (await readFile(signaturePath, 'utf8')).trim(),
    };
  }

  const missing = requiredPlatforms.filter((item) => !selected[item]);
  if (missing.length > 0) {
    throw new Error(`Missing updater signatures for required platforms: ${missing.join(', ')}`);
  }

  if (Object.keys(selected).length === 0) {
    throw new Error('No supported updater platforms could be inferred from signature file names');
  }

  return selected;
}

function createManifest(repo, platforms) {
  const result = {};
  for (const [platformName, entry] of Object.entries(platforms)) {
    result[platformName] = {
      signature: entry.signature,
      url: `${repo}/releases/download/${tag}/${entry.assetName}`,
    };
  }

  return {
    version,
    notes,
    pub_date: new Date().toISOString(),
    platforms: result,
  };
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
  console.log(`Wrote ${path}`);
}

const platforms = await collectPlatforms();
await writeJson(outputPath, createManifest(githubRepo, platforms));
await writeJson(giteeOutputPath, createManifest(giteeRepo, platforms));
console.log(`Platforms: ${Object.keys(platforms).join(', ')}`);
