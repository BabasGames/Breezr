/* eslint @typescript-eslint/no-require-imports: 0 */
const { build } = require('electron-builder');
const { existsSync, rmSync } = require('fs');
const { resolve, join, basename } = require('path');
const { embedUpdateInformation } = require('./appimage');
const { repository } = require('../package.json');

// If the Electron app build folder exists, we need to delete it
if (existsSync(resolve('dist'))) {
  rmSync(resolve('dist'), { recursive: true });
  console.log('Removed "dist" directory');
}

// App build
console.log('Building setup...');
/**
 * @type {import('electron-builder').Configuration} Configuration
 */
const config = {
  appId: 'com.github.babasgames.breezr',
  productName: 'Breezr',
  mac: {
    category: 'public.app-category.music',
    target: [{ target: 'dmg', arch: ['x64', 'arm64'] }],
    icon: join(__dirname, '..', 'src', 'img', 'app.icns'),
  },
  win: {
    target: 'nsis',
    icon: join(__dirname, '..', 'src', 'img', 'app.ico'),
  },
  linux: {
    category: 'Audio;AudioVideo',
    syncDesktopName: true,
    target: ['snap', 'deb', 'AppImage', 'rpm', 'pacman'],
    // .deb/.rpm need a maintainer; package.json's author has no email on purpose.
    maintainer: 'BabasGames (https://github.com/BabasGames/Breezr)',
    publish: null,
    // A single PNG is installed at its own size only (1024, which no taskbar looks for): one per hicolor size.
    icon: join(__dirname, '..', 'src', 'img', 'icons'),
  },
  // electron-builder's default pacman dependencies are those of a system-wide Electron (one of them no longer
  // exists in Arch): Breezr ships its own Electron and needs only these.
  pacman: {
    // Arch's own package format (.pkg.tar.zst); CI renames the `.pacman` file accordingly.
    compression: 'zstd',
    depends: ['gtk3', 'nss', 'alsa-lib', 'libxss', 'libxtst', 'libsecret', 'libnotify', 'xdg-utils'],
  },
  toolsets: {
    // The legacy runtime links against the host glibc and needs libfuse2;
    // 1.0.3 ships the static type-2 runtime so the AppImage runs without them.
    appimage: '1.0.3',
  },
  artifactName: 'Breezr-${os}-${arch}.${ext}',
  files: [
    '!src/*',
    '!src/**/*',
    'build/package.json',
    'build/src/*',
    'build/src/**/*'
  ]
};

// `bun scripts/build.js [windows|macos|linux] [x64|arm64]`: without a processor, the machine's own.
const args = process.argv.slice(2);
const specifiedOS = args.find((a) => ['windows', 'macos', 'linux'].includes(a));
const specifiedArch = args.find((a) => ['x64', 'arm64'].includes(a));
// Snap is built for x64 only.
if (specifiedArch === 'arm64' && config.linux) {
  // @ts-expect-error Readonly property
  config.linux.target = config.linux.target.filter((t) => t !== 'snap');
}
if (specifiedOS) {
  console.log(`Building for ${specifiedOS}...`);
  if (specifiedOS === 'windows') {
    // @ts-expect-error Readonly property
    config.mac = undefined;
    // @ts-expect-error Readonly property
    config.linux = undefined;
  } else if (specifiedOS === 'macos') {
    // @ts-expect-error Readonly property
    config.linux = undefined;
    // @ts-expect-error Readonly property
    config.win = undefined;
  } else if (specifiedOS === 'linux') {
    // @ts-expect-error Readonly property
    config.mac = undefined;
    // @ts-expect-error Readonly property
    config.win = undefined;
  }
} else if (process.platform === 'win32') {
  // @ts-expect-error Readonly property
  config.mac = undefined;
  // @ts-expect-error Readonly property
  config.linux = undefined;
}

const [, owner, repo] = repository.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);

build({
  config,
  publish: 'never',
  ...(specifiedArch ? { [specifiedArch]: true } : {}),
}).then((artifacts) => {
  // Points AppImage update tools at the .zsync file CI publishes next to the AppImage on each release.
  for (const appImage of artifacts.filter((artifact) => artifact.endsWith('.AppImage'))) {
    embedUpdateInformation(appImage, `gh-releases-zsync|${owner}|${repo}|latest|${basename(appImage)}.zsync`);
    console.log(`Embedded update information in ${basename(appImage)}`);
  }
  console.log('\nSetup built in the "dist" folder.');
});
