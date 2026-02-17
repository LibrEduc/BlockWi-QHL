import { app, BrowserWindow, ipcMain, webContents, clipboard, Menu, dialog, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as https from 'https';
import { spawn } from 'child_process';
import { pathToFileURL } from 'url';

type LocaleCode = string;
type TranslationMap = Record<string, string>;
type LocalePayload = {
  code: LocaleCode;
  labels: TranslationMap;
  ucBlocklyLang: string;
};

const EMPTY_CODE = '__EMPTY_CODE__';
let mainWindow: BrowserWindow | null = null;
let currentLocale: LocaleCode = 'fr';
let latestGeneratedCode = '';
let appIconPath: string | null = null;
let fileRootGuardAttached = false;
let libraryDialogWindow: BrowserWindow | null = null;

const ARDUINO_CLI_ROOT_DIR_NAME = 'arduino-cli-local';
const ARDUINO_CLI_EXE_NAME = process.platform === 'win32' ? 'arduino-cli.exe' : 'arduino-cli';
const STM32_ADDITIONAL_URL =
  'https://github.com/stm32duino/BoardManagerFiles/raw/main/package_stmicroelectronics_index.json';
const RP2040_ADDITIONAL_URL =
  'https://github.com/earlephilhower/arduino-pico/releases/download/global/package_rp2040_index.json';
const UCBLOCKLY_BUNDLE_URL = 'https://a-s-t-u-c-e.github.io/ucBlockly/dist/bundle/bundle.js';
const UCBLOCKLY_COMMIT_API_URL = 'https://api.github.com/repos/A-S-T-U-C-E/ucBlockly/commits/main';
const UCBLOCKLY_REPOSITORY_URL = 'https://github.com/A-S-T-U-C-E/ucBlockly';
const PROJECT_REPOSITORY_URL = 'https://github.com/LibrEduc/BlockWi-QHL';
const APP_RELEASES_API_URL = 'https://api.github.com/repos/LibrEduc/BlockWi-QHL/releases/latest';

function ensureDirectorySync(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function getArduinoCliRootDir() {
  return path.join(app.getPath('userData'), ARDUINO_CLI_ROOT_DIR_NAME);
}

function getArduinoCliBinDir() {
  return path.join(getArduinoCliRootDir(), 'bin');
}

function getArduinoCliExecutablePath() {
  return path.join(getArduinoCliBinDir(), ARDUINO_CLI_EXE_NAME);
}

function getArduinoCliConfigPath() {
  return path.join(getArduinoCliRootDir(), 'arduino-cli.yaml');
}

function toYamlPath(p: string) {
  return p.replaceAll('\\', '/');
}

function writeArduinoCliConfigIfMissing() {
  const configPath = getArduinoCliConfigPath();
  if (fs.existsSync(configPath)) return;

  const root = getArduinoCliRootDir();
  ensureDirectorySync(root);
  ensureDirectorySync(path.join(root, 'data'));
  ensureDirectorySync(path.join(root, 'downloads'));
  ensureDirectorySync(path.join(root, 'sketchbook'));

  const yaml = `board_manager:
  additional_urls: []
directories:
  data: "${toYamlPath(path.join(root, 'data'))}"
  downloads: "${toYamlPath(path.join(root, 'downloads'))}"
  user: "${toYamlPath(path.join(root, 'sketchbook'))}"
`;
  fs.writeFileSync(configPath, yaml, 'utf8');
}

function fetchJson(url: string): Promise<{ assets?: Array<{ name?: string; browser_download_url?: string }> }> {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            'User-Agent': 'Blockwi-Electron',
            Accept: 'application/vnd.github+json',
          },
        },
        (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            fetchJson(res.headers.location).then(resolve).catch(reject);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`${t().httpErrorPrefix} ${res.statusCode} (${url})`));
            return;
          }

          const chunks: Buffer[] = [];
          res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
          res.on('end', () => {
            try {
              const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
              resolve(payload);
            } catch (error) {
              reject(error);
            }
          });
        }
      )
      .on('error', reject);
  });
}

function downloadFile(url: string, destinationPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          'User-Agent': 'Blockwi-Electron',
          Accept: 'application/octet-stream',
        },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          downloadFile(res.headers.location, destinationPath).then(resolve).catch(reject);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`${t().downloadFailed} (${res.statusCode})`));
          return;
        }

        ensureDirectorySync(path.dirname(destinationPath));
        const file = fs.createWriteStream(destinationPath);
        res.pipe(file);
        file.on('finish', () => {
          file.close(() => resolve());
        });
        file.on('error', (error) => {
          try {
            fs.unlinkSync(destinationPath);
          } catch (_) {}
          reject(error);
        });
      }
    );
    request.on('error', reject);
  });
}

function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; onStdout?: (chunk: string) => void; onStderr?: (chunk: string) => void } = {}
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const onStdout = typeof options.onStdout === 'function' ? options.onStdout : null;
    const onStderr = typeof options.onStderr === 'function' ? options.onStderr : null;
    const spawnOptions = { ...options };
    delete spawnOptions.onStdout;
    delete spawnOptions.onStderr;
    const child = spawn(command, args, {
      windowsHide: true,
      ...spawnOptions,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      if (onStdout) onStdout(chunk);
    });
    child.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      if (onStderr) onStderr(chunk);
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error((stderr || stdout || `Code ${code}`).trim()));
    });
  });
}

function findFileRecursively(startDir: string, targetName: string): string | null {
  if (!fs.existsSync(startDir)) return null;
  const stack = [startDir];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (_) {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase() === targetName.toLowerCase()) {
        return fullPath;
      }
    }
  }
  return null;
}

async function installArduinoCliLocally() {
  const exePath = getArduinoCliExecutablePath();
  if (fs.existsSync(exePath)) {
    writeArduinoCliConfigIfMissing();
    return exePath;
  }

  const release = await fetchJson('https://api.github.com/repos/arduino/arduino-cli/releases/latest');
  const assets = Array.isArray(release?.assets) ? release.assets : [];

  let expectedPattern: RegExp | null = null;
  if (process.platform === 'win32') {
    expectedPattern = /Windows_64bit\.zip$/i;
  } else if (process.platform === 'linux') {
    expectedPattern = /Linux_64bit\.tar\.gz$/i;
  } else if (process.platform === 'darwin' && os.arch() === 'arm64') {
    expectedPattern = /macOS_ARM64\.tar\.gz$/i;
  } else if (process.platform === 'darwin') {
    expectedPattern = /macOS_64bit\.tar\.gz$/i;
  }

  if (!expectedPattern) {
    throw new Error(`${t().unsupportedPlatform}: ${process.platform}/${os.arch()}`);
  }

  const asset = assets.find((entry) => expectedPattern.test(entry.name || ''));
  if (!asset?.browser_download_url || !asset.name) {
    throw new Error(t().cliArchiveNotFound);
  }

  const root = getArduinoCliRootDir();
  const tmpDir = path.join(root, 'tmp');
  const extractDir = path.join(tmpDir, 'extract');
  const archivePath = path.join(tmpDir, asset.name);
  ensureDirectorySync(tmpDir);

  try {
    if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
    await downloadFile(asset.browser_download_url, archivePath);

    if (process.platform === 'win32') {
      await runCommand('powershell', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `Expand-Archive -LiteralPath '${archivePath.replaceAll("'", "''")}' -DestinationPath '${extractDir.replaceAll("'", "''")}' -Force`,
      ]);
    } else {
      ensureDirectorySync(extractDir);
      await runCommand('tar', ['-xzf', archivePath, '-C', extractDir]);
    }

    const discoveredExe = findFileRecursively(extractDir, ARDUINO_CLI_EXE_NAME);
    if (!discoveredExe) {
      throw new Error(t().cliExecutableNotFound);
    }

    ensureDirectorySync(getArduinoCliBinDir());
    fs.copyFileSync(discoveredExe, exePath);
    try {
      fs.chmodSync(exePath, 0o755);
    } catch (_) {}
    writeArduinoCliConfigIfMissing();
    return exePath;
  } finally {
    try {
      if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

async function runArduinoCli(args: string[]) {
  const exePath = await installArduinoCliLocally();
  writeArduinoCliConfigIfMissing();
  const allArgs = ['--config-file', getArduinoCliConfigPath(), ...args];
  appendArduinoCliConsole(`$ arduino-cli ${args.join(' ')}\n`);
  return runCommand(exePath, allArgs, {
    onStdout: (chunk) => appendArduinoCliConsole(chunk),
    onStderr: (chunk) => appendArduinoCliConsole(chunk),
  });
}

async function withArduinoAction(startMessage: string, successMessage: string, action: () => Promise<void>) {
  showArduinoCliPanel(startMessage, true);
  appendArduinoCliConsole('\n');
  try {
    await action();
    showArduinoCliPanel(successMessage, false);
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    appendArduinoCliConsole(`\n${t().arduinoActionError}: ${details}\n`);
    showArduinoCliPanel(`${t().arduinoActionError}: ${details}`, false);
    openInfoDialog(`${t().arduinoActionError}\n\n${details}`);
  }
}

async function installBoardManager() {
  await withArduinoAction(t().installBoardManagerStart, t().installBoardManagerDone, async () => {
    await installArduinoCliLocally();
  });
}

async function installArduinoAvrCompiler() {
  await withArduinoAction(t().installAvrStart, t().installAvrDone, async () => {
    await runArduinoCli(['core', 'update-index']);
    await runArduinoCli(['core', 'install', 'arduino:avr']);
  });
}

async function installStCompiler() {
  await withArduinoAction(t().installStStart, t().installStDone, async () => {
    await runArduinoCli(['core', 'update-index', '--additional-urls', STM32_ADDITIONAL_URL]);
    await runArduinoCli([
      'core',
      'install',
      'STMicroelectronics:stm32',
      '--additional-urls',
      STM32_ADDITIONAL_URL,
    ]);
  });
}

async function installPicoCompiler() {
  await withArduinoAction(t().installPicoStart, t().installPicoDone, async () => {
    await runArduinoCli(['core', 'update-index', '--additional-urls', RP2040_ADDITIONAL_URL]);
    await runArduinoCli([
      'core',
      'install',
      'rp2040:rp2040',
      '--additional-urls',
      RP2040_ADDITIONAL_URL,
    ]);
  });
}

function getUcBlocklyLocalDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'ucblockly');
  }
  return path.join(process.cwd(), 'public', 'ucblockly');
}

function getUcBlocklyBundlePath() {
  return path.join(getUcBlocklyLocalDir(), 'bundle.js');
}

function getUcBlocklyVersionPath() {
  return path.join(getUcBlocklyLocalDir(), '.ucblockly-version.json');
}

function readUcBlocklyPackageMetadata(): { name: string; version: string | null } {
  const candidates = [
    path.join(getUcBlocklyLocalDir(), 'package.json'),
    path.join(process.cwd(), 'public', 'ucblockly', 'package.json'),
    path.join(process.cwd(), 'build', 'ucblockly', 'package.json'),
  ];
  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8')) as { name?: unknown; version?: unknown };
      const name = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : 'µcBlockly';
      const version = typeof parsed.version === 'string' && parsed.version.trim() ? parsed.version.trim() : null;
      return { name, version };
    } catch (_) {}
  }
  return { name: 'µcBlockly', version: null };
}

function readAppPackageVersion(): string {
  const candidates = [
    path.join(process.cwd(), 'package.json'),
    path.join(__dirname, '..', 'package.json'),
  ];
  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8')) as { version?: unknown };
      if (parsed && typeof parsed.version === 'string' && parsed.version.trim()) {
        return parsed.version.trim();
      }
    } catch (_) {}
  }
  return app.getVersion();
}

function normalizeVersionString(raw: string): string {
  if (!raw || typeof raw !== 'string') return '0.0.0';
  const cleaned = raw.trim().replace(/^v/i, '');
  const matched = cleaned.match(/\d+(?:\.\d+){0,2}/);
  return matched ? matched[0] : '0.0.0';
}

function compareVersions(a: string, b: string): number {
  const pa = normalizeVersionString(a).split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = normalizeVersionString(b).split('.').map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

function extractReleaseVersion(release: Record<string, unknown>): string | null {
  if (!release || typeof release !== 'object') return null;
  if (typeof release.tag_name === 'string' && release.tag_name.trim()) {
    return normalizeVersionString(release.tag_name);
  }
  if (typeof release.name === 'string' && release.name.trim()) {
    return normalizeVersionString(release.name);
  }
  return null;
}

async function checkAndInstallAppUpdate() {
  const currentVersion = readAppPackageVersion();
  showArduinoCliPanel(t().appUpdateChecking, true);
  try {
    const release = (await fetchJson(APP_RELEASES_API_URL)) as Record<string, unknown>;
    const latestVersion = extractReleaseVersion(release);
    if (!latestVersion) {
      throw new Error(t().appUpdateNoVersion);
    }

    if (compareVersions(latestVersion, currentVersion) <= 0) {
      showArduinoCliPanel(t().appUpdateUpToDate, false);
      return;
    }

    showArduinoCliPanel(
      `${t().appUpdateAvailable} (${currentVersion} → ${latestVersion})`,
      false
    );
    if (!mainWindow || mainWindow.isDestroyed()) return;

    const releaseUrl =
      release && typeof release.html_url === 'string' && release.html_url
        ? release.html_url
        : `${PROJECT_REPOSITORY_URL}/releases/latest`;

    const answer = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: t().appUpdateDialogTitle,
      message: `${t().appUpdateAvailable} (${currentVersion} → ${latestVersion})`,
      detail: t().appUpdateDialogBody,
      buttons: [t().appUpdateLater, t().appUpdateOpenRelease],
      defaultId: 1,
      cancelId: 0,
    });
    if (answer.response === 1) {
      await shell.openExternal(releaseUrl);
    }
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    showArduinoCliPanel(`${t().appUpdateError}: ${details}`, false);
    openInfoDialog(`${t().appUpdateError}\n\n${details}`);
  }
}

function getUcBlocklyBlankUrl() {
  const blankPath = path.join(getUcBlocklyLocalDir(), 'blank.html');
  if (fs.existsSync(blankPath)) {
    return pathToFileURL(blankPath).toString();
  }
  return 'data:text/html,<html><body></body></html>';
}

function getUcBlocklyIndexUrl(localeCode: string) {
  const lang = typeof localeCode === 'string' && localeCode.trim()
    ? localeCode.trim().toLowerCase().slice(0, 2)
    : 'fr';

  if (!app.isPackaged && process.env.ELECTRON_USE_DEV_SERVER === '1') {
    return `http://localhost:3000/ucblockly/index.html?lang=${lang}`;
  }

  const candidates = [
    path.join(getUcBlocklyLocalDir(), 'index.html'),
    path.join(process.cwd(), 'public', 'ucblockly', 'index.html'),
    path.join(process.cwd(), 'build', 'ucblockly', 'index.html'),
  ];
  const indexPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!indexPath) {
    return 'about:blank';
  }
  const indexUrl = pathToFileURL(indexPath);
  indexUrl.searchParams.set('lang', lang);
  return indexUrl.toString();
}

function getRendererIndexPath() {
  const candidates = [
    path.join(process.cwd(), 'build', 'index.html'),
    path.join(__dirname, '../build/index.html'),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch (_) {}
  }
  return candidates[0];
}

function readUcBlocklyInstalledSha(): string | null {
  try {
    const versionPath = getUcBlocklyVersionPath();
    if (!fs.existsSync(versionPath)) return null;
    const raw = fs.readFileSync(versionPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.sha === 'string' && parsed.sha.trim()) {
      return parsed.sha.trim();
    }
  } catch (_) {}
  return null;
}

function writeUcBlocklyVersion(sha: string) {
  const versionPath = getUcBlocklyVersionPath();
  const payload = {
    sha,
    updatedAt: new Date().toISOString(),
    source: UCBLOCKLY_BUNDLE_URL,
  };
  fs.writeFileSync(versionPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function fetchLatestUcBlocklySha(): Promise<string> {
  const result = await fetchJson(UCBLOCKLY_COMMIT_API_URL);
  const sha = result && typeof (result as { sha?: unknown }).sha === 'string'
    ? ((result as { sha: string }).sha || '').trim()
    : '';
  if (!sha) throw new Error(t().ucBlocklyNoCommitSha);
  return sha;
}

async function installUcBlocklyBundle(sha: string) {
  const targetDir = getUcBlocklyLocalDir();
  ensureDirectorySync(targetDir);

  const bundlePath = getUcBlocklyBundlePath();
  const tmpPath = `${bundlePath}.tmp`;
  await downloadFile(UCBLOCKLY_BUNDLE_URL, tmpPath);
  fs.renameSync(tmpPath, bundlePath);
  writeUcBlocklyVersion(sha);
}

async function checkAndInstallUcBlocklyUpdate() {
  showArduinoCliPanel(t().ucBlocklyUpdateChecking, true);
  appendArduinoCliConsole('\n');
  try {
    const latestSha = await fetchLatestUcBlocklySha();
    const installedSha = readUcBlocklyInstalledSha();
    const hasBundle = fs.existsSync(getUcBlocklyBundlePath());

    if (hasBundle && installedSha && installedSha === latestSha) {
      showArduinoCliPanel(t().ucBlocklyUpdateUpToDate, false);
      return;
    }

    showArduinoCliPanel(t().ucBlocklyUpdateInstalling, true);
    await installUcBlocklyBundle(latestSha);
    showArduinoCliPanel(t().ucBlocklyUpdateInstalled, false);
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    appendArduinoCliConsole(`\n${t().ucBlocklyUpdateError}: ${details}\n`);
    showArduinoCliPanel(`${t().ucBlocklyUpdateError}: ${details}`, false);
    openInfoDialog(`${t().ucBlocklyUpdateError}\n\n${details}`);
  }
}

function resolveAppIconPath(): string | null {
  const candidates = app.isPackaged
    ? [
        path.join(__dirname, '../build/wokwi_logo.png'),
        path.join(process.resourcesPath, 'app.asar', 'build', 'wokwi_logo.png'),
      ]
    : [
        path.join(process.cwd(), 'public', 'wokwi_logo.png'),
        path.join(__dirname, '../public/wokwi_logo.png'),
      ];

  for (const iconPath of candidates) {
    try {
      if (fs.existsSync(iconPath)) return iconPath;
    } catch (_) {}
  }
  return null;
}

const LOCALES_DIR = path.join(__dirname, 'locales');

function loadLocaleFileFromPath(localePath: string): TranslationMap {
  const raw = fs.readFileSync(localePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid locale file format: ${localePath}`);
  }
  if (typeof parsed.code !== 'string' || !parsed.code.trim()) {
    throw new Error(`Missing "code" in locale file: ${localePath}`);
  }
  return parsed as TranslationMap;
}

function loadTranslations(): Record<string, TranslationMap> {
  const loaded: Record<string, TranslationMap> = {};
  const files = fs.existsSync(LOCALES_DIR) ? fs.readdirSync(LOCALES_DIR) : [];
  for (const file of files) {
    if (!file.toLowerCase().endsWith('.json')) continue;
    const filePath = path.join(LOCALES_DIR, file);
    try {
      const localeData = loadLocaleFileFromPath(filePath);
      const localeCode = String(localeData.code).trim().toLowerCase();
      loaded[localeCode] = localeData;
    } catch (error) {
      console.error(`[i18n] Failed to load ${file}`, error);
    }
  }
  if (Object.keys(loaded).length === 0) {
    loaded.fr = { code: 'fr', languageLabel: 'Francais' };
  }
  return loaded;
}

const translations = loadTranslations();
const fallbackLocaleCode = translations.fr ? 'fr' : Object.keys(translations)[0] || 'fr';
currentLocale = fallbackLocaleCode;

function normalizeLocaleCode(rawCode: unknown): string | null {
  if (typeof rawCode !== 'string' || !rawCode.trim()) return null;
  const normalized = rawCode.trim().toLowerCase();
  if (translations[normalized]) return normalized;
  const short = normalized.split(/[-_]/)[0];
  if (translations[short]) return short;
  return null;
}

function localeMenuEntries(): Array<{ code: string; label: string }> {
  return Object.keys(translations).map((code) => ({
    code,
    label: translations[code].languageLabel || code,
  }));
}

function getLocalePayload(): LocalePayload {
  const labels = t();
  return {
    code: currentLocale,
    labels,
    ucBlocklyLang: labels.code || currentLocale,
  };
}

function t(): TranslationMap {
  return translations[currentLocale] || translations[fallbackLocaleCode] || {};
}

async function executeScriptInWokwi<T>(script: string): Promise<T | null> {
  const wc = findWokwiWebContents();
  if (!wc) return null;
  try {
    const result = await wc.executeJavaScript(script, true);
    return result as T;
  } catch {
    return null;
  }
}

async function injectCodeIntoWokwi(code: string): Promise<boolean> {
  if (!code || typeof code !== 'string') return false;

  const script = `
    (() => {
      const value = ${JSON.stringify(code)};
      const monacoRef = window.monaco;
      if (!monacoRef || !monacoRef.editor) {
        return { ok: false, error: 'no_monaco' };
      }

      let model = null;
      try {
        if (typeof monacoRef.editor.getEditors === 'function') {
          const editors = monacoRef.editor.getEditors();
          if (editors && editors[0] && typeof editors[0].getModel === 'function') {
            model = editors[0].getModel();
          }
        }
      } catch (_) {}

      if (!model) {
        const models = monacoRef.editor.getModels();
        if (models && models.length) model = models[0];
      }
      if (!model) {
        return { ok: false, error: 'no_model' };
      }

      model.setValue(value);
      return { ok: true };
    })()
  `;

  const result = await executeScriptInWokwi<{ ok?: boolean }>(script);
  return !!result?.ok;
}

async function extractCodeFromWokwi(): Promise<string> {
  const script = `
    (() => {
      const monacoRef = window.monaco;
      if (!monacoRef || !monacoRef.editor) return ${JSON.stringify(EMPTY_CODE)};

      let model = null;
      try {
        if (typeof monacoRef.editor.getEditors === 'function') {
          const editors = monacoRef.editor.getEditors();
          if (editors && editors[0] && typeof editors[0].getModel === 'function') {
            model = editors[0].getModel();
          }
        }
      } catch (_) {}

      if (!model) {
        const models = monacoRef.editor.getModels();
        if (models && models.length) model = models[0];
      }
      if (!model || typeof model.getValue !== 'function') return ${JSON.stringify(EMPTY_CODE)};

      const value = model.getValue();
      return value && value.trim() ? value : ${JSON.stringify(EMPTY_CODE)};
    })()
  `;

  const extracted = await executeScriptInWokwi<string>(script);
  if (!extracted || extracted === EMPTY_CODE) return '';
  return extracted;
}

function findWokwiWebContents(): Electron.WebContents | null {
  for (const wc of webContents.getAllWebContents()) {
    try {
      if (wc.getURL().includes('wokwi.com')) return wc;
    } catch (_) {}
  }
  return null;
}

function showRendererNotification(message: string) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('menu-notification', message);
}

function showArduinoCliPanel(message: string, active: boolean) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('arduino-cli-status', {
    message: typeof message === 'string' ? message : '',
    active: !!active,
  });
}

function appendArduinoCliConsole(text: string) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (typeof text !== 'string' || !text) return;
  mainWindow.webContents.send('arduino-cli-log', text);
}

function broadcastLocaleChanged(_locale: LocaleCode) {
  const payload = getLocalePayload();
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win.isDestroyed()) {
        win.webContents.send('locale-changed', payload);
      }
    } catch (_) {}
  }
}

function openInstallLibraryDialog() {
  if (libraryDialogWindow && !libraryDialogWindow.isDestroyed()) {
    libraryDialogWindow.focus();
    return;
  }

  libraryDialogWindow = new BrowserWindow({
    width: 440,
    height: 230,
    resizable: false,
    minimizable: false,
    maximizable: false,
    modal: !!mainWindow,
    parent: mainWindow || undefined,
    autoHideMenuBar: true,
    title: t().installLibrary,
    icon: appIconPath || undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'library-dialog-preload.js'),
    },
  });

  libraryDialogWindow.on('closed', () => {
    libraryDialogWindow = null;
  });

  void libraryDialogWindow.loadFile(path.join(__dirname, 'library-dialog.html'));
}

function sanitizeLibraryName(rawName: string): string {
  if (!rawName || typeof rawName !== 'string') return '';
  return rawName.trim().replace(/[^\w\s.\-/:]/g, '');
}

async function installArduinoLibraryFromDialog(rawLibraryName: string, sender: Electron.WebContents) {
  const safeReply = (payload: { ok: boolean; error?: string }) => {
    try {
      if (!sender.isDestroyed()) sender.send('install-library-done', payload);
    } catch (_) {}
  };

  const libraryName = sanitizeLibraryName(rawLibraryName);
  if (!libraryName) {
    safeReply({ ok: false, error: t().installLibraryEmpty });
    return;
  }

  showArduinoCliPanel(t().installLibraryProgress, true);
  appendArduinoCliConsole('\n');
  try {
    await runArduinoCli(['lib', 'install', libraryName]);
    safeReply({ ok: true });
    showArduinoCliPanel(t().installLibrarySuccess, false);
    if (libraryDialogWindow && !libraryDialogWindow.isDestroyed()) {
      libraryDialogWindow.close();
    }
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    safeReply({ ok: false, error: details });
    appendArduinoCliConsole(`\n${t().installLibraryError}: ${details}\n`);
    showArduinoCliPanel(`${t().installLibraryError}: ${details}`, false);
  }
}

async function copyProgramToClipboard() {
  const codeFromEditor = await extractCodeFromWokwi();
  const code = codeFromEditor || latestGeneratedCode;
  if (!code.trim()) {
    showRendererNotification(t().noCode);
    return;
  }

  clipboard.writeText(code);
  showRendererNotification(t().codeCopied);
}

async function uploadCurrentCode() {
  if (!latestGeneratedCode.trim()) {
    showRendererNotification(t().noCode);
    return;
  }

  const ok = await injectCodeIntoWokwi(latestGeneratedCode);
  showRendererNotification(ok ? t().uploadOk : t().uploadError);
}

function openInfoDialog(message: string) {
  if (!mainWindow) return;
  void dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: t().appName,
    message,
  });
}

function refreshMenu() {
  const labels = t();

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: labels.file,
      submenu: [
        {
          label: labels.copyProgram,
          accelerator: 'CommandOrControl+Alt+C',
          click: () => {
            void copyProgramToClipboard();
          },
        },
        { type: 'separator' },
        {
          label: labels.language,
          submenu: localeMenuEntries().map((localeItem) => ({
            label: localeItem.label,
            type: 'radio',
            checked: currentLocale === localeItem.code,
            click: () => {
              currentLocale = localeItem.code;
              refreshMenu();
              broadcastLocaleChanged(currentLocale);
            },
          })),
        },
        { type: 'separator' },
        { role: 'quit', label: labels.quit },
      ],
    },
    {
      label: labels.arduino,
      submenu: [
        {
          label: labels.listBoards,
          submenu: [{ label: labels.noBoards, enabled: false }],
        },
        {
          label: labels.uploadProgram,
          click: () => {
            void uploadCurrentCode();
          },
        },
        { type: 'separator' },
        {
          label: labels.installLibrary,
          click: () => {
            openInstallLibraryDialog();
          },
        },
        { type: 'separator' },
        {
          label: labels.installBoardManager,
          click: () => {
            void installBoardManager();
          },
          submenu: [
            {
              label: labels.downloadBoardManager,
              click: () => {
                void installBoardManager();
              },
            },
            { type: 'separator' },
            {
              label: labels.installCompilerArduino,
              click: () => {
                void installArduinoAvrCompiler();
              },
            },
            {
              label: labels.installCompilerST,
              click: () => {
                void installStCompiler();
              },
            },
            {
              label: labels.installCompilerPico,
              click: () => {
                void installPicoCompiler();
              },
            },
          ],
        },
      ],
    },
    {
      label: labels.view,
      submenu: [
        { role: 'reload', label: labels.reload },
        { role: 'forceReload', label: labels.forceReload },
        { type: 'separator' },
        { role: 'resetZoom', label: labels.resetZoom },
        { role: 'zoomIn', label: labels.zoomIn },
        { role: 'zoomOut', label: labels.zoomOut },
        { type: 'separator' },
        { role: 'togglefullscreen', label: labels.fullscreen },
        { role: 'toggleDevTools', label: labels.devtools },
      ],
    },
    {
      label: labels.help,
      submenu: [
        {
          label: labels.about,
          click: () => {
            const version = readAppPackageVersion();
            const ucBlocklyPackage = readUcBlocklyPackageMetadata();
            const ucBlocklyVersion = ucBlocklyPackage.version || labels.aboutUcBlocklyVersionUnknown;
            openInfoDialog(
              [
                labels.appName,
                `${labels.versionLabel}: ${version}`,
                PROJECT_REPOSITORY_URL,
                '',
                ucBlocklyPackage.name || labels.aboutUcBlocklyTitle,
                `${labels.versionLabel}: ${ucBlocklyVersion}`,
                `${UCBLOCKLY_REPOSITORY_URL}`,
              ].join('\n')
            );
          },
        },
        {
          label: labels.checkUpdate,
          click: () => {
            void checkAndInstallAppUpdate();
          },
        },
        {
          label: labels.checkUcBlocklyUpdate,
          click: () => {
            void checkAndInstallUcBlocklyUpdate();
          },
        },
        {
          label: labels.learnMore,
          click: () => {
            void shell.openExternal(PROJECT_REPOSITORY_URL);
          },
        },
        { type: 'separator' },
        {
          label: labels.whoAreYou,
          click: () => {
            const windowTitle = labels.whoAreYou;
            const formWindow = new BrowserWindow({
              width: 540,
              height: 815,
              title: windowTitle,
              autoHideMenuBar: true,
              icon: appIconPath || undefined,
              webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true,
              },
            });
            formWindow.setMenuBarVisibility(false);
            formWindow.webContents.on('page-title-updated', (event) => {
              event.preventDefault();
              formWindow.setTitle(windowTitle);
            });
            formWindow.webContents.on('did-finish-load', () => {
              formWindow.setTitle(windowTitle);
            });
            void formWindow.loadURL('https://gitforms.vercel.app/');
          },
        },
        { type: 'separator' },
        {
          label: labels.makeDonation,
          click: () => {
            void shell.openExternal('https://paypal.me/sebcanet');
          },
        },
        {
          label: labels.requestInvoice,
          click: () => {
            const email = 'scanet@libreduc.cc';
            const subject = encodeURIComponent(labels.invoiceSubject);
            const body = encodeURIComponent(labels.invoiceBody);
            void shell.openExternal(`mailto:${email}?subject=${subject}&body=${body}`);
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const useDevServer = !app.isPackaged && process.env.ELECTRON_USE_DEV_SERVER === '1';
  const systemLocale = normalizeLocaleCode(app.getLocale());
  if (systemLocale) currentLocale = systemLocale;
  appIconPath = resolveAppIconPath();

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: appIconPath || undefined,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true
    }
  });

  refreshMenu();
  const ses = mainWindow.webContents.session;
  if (!fileRootGuardAttached) {
    fileRootGuardAttached = true;
    ses.webRequest.onBeforeRequest({ urls: ['file:///*'] }, (details, callback) => {
      const url = details.url || '';
      // Garde-fou Windows: certaines ressources tierces tentent parfois
      // de charger la racine "file:///X:/", ce qui ne doit jamais arriver.
      if (/^file:\/\/\/[a-zA-Z]:\/?$/.test(url)) {
        callback({ redirectURL: getUcBlocklyBlankUrl() });
        return;
      }
      callback({});
    });
  }

  ipcMain.on('generated-code-updated', (_event, code: string) => {
    latestGeneratedCode = typeof code === 'string' ? code : '';
  });

  ipcMain.removeHandler('inject-code-wokwi');
  ipcMain.handle('inject-code-wokwi', async (_event, code: string) => {
    return injectCodeIntoWokwi(code);
  });
  ipcMain.removeHandler('get-current-locale');
  ipcMain.handle('get-current-locale', async () => {
    return currentLocale;
  });
  ipcMain.removeHandler('get-current-locale-data');
  ipcMain.handle('get-current-locale-data', async () => {
    return getLocalePayload();
  });
  ipcMain.removeHandler('get-ucblockly-url');
  ipcMain.handle('get-ucblockly-url', async (_event, localeCode: string) => {
    return getUcBlocklyIndexUrl(localeCode);
  });
  ipcMain.removeAllListeners('close-library-dialog');
  ipcMain.on('close-library-dialog', () => {
    if (libraryDialogWindow && !libraryDialogWindow.isDestroyed()) {
      libraryDialogWindow.close();
    }
  });
  ipcMain.removeAllListeners('install-library');
  ipcMain.on('install-library', (event, libraryName: string) => {
    void installArduinoLibraryFromDialog(libraryName, event.sender);
  });

  if (useDevServer) {
    const devOrigin = 'http://localhost:3000';

    // Si un chargement file:// survient en dev, on reroute vers localhost
    // pour garantir le meme rendu que "npm run start".
    ses.webRequest.onBeforeRequest(
      { urls: ['file://*/*'] },
      (details, callback) => {
        try {
          const url = details.url || '';
          if (!url.startsWith('file://')) {
            callback({});
            return;
          }

          const filePath = decodeURIComponent(url.replace('file:///', '').replaceAll('\\', '/'));
          const staticIdx = filePath.lastIndexOf('/static/');
          if (staticIdx >= 0) {
            const assetPath = filePath.slice(staticIdx);
            callback({ redirectURL: `${devOrigin}${assetPath}` });
            return;
          }

          if (filePath.endsWith('/index.html') || filePath.endsWith('index.html')) {
            callback({ redirectURL: `${devOrigin}/` });
            return;
          }
        } catch (_) {}
        callback({});
      }
    );
  }

  // En mode dev explicite, charge l'URL de développement
  if (useDevServer) {
    void mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    // En production, charge le fichier HTML local avec URL explicite
    const rendererEntryUrl = pathToFileURL(getRendererIndexPath()).toString();
    void mainWindow.loadURL(rendererEntryUrl);
  }

  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      console.error(
        `[main did-fail-load] code=${errorCode} mainFrame=${isMainFrame} url=${validatedURL} desc=${errorDescription}`
      );
    }
  );
  mainWindow.webContents.on('did-finish-load', () => {
    broadcastLocaleChanged(currentLocale);
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
}); 
