import { describe, expect, test } from 'bun:test';
import { parseOsRelease, releaseAssetName } from '../src/shared/release-asset';

const linux = (arch: string, distro: { id?: string; like?: string[] } = {}, appImage = false) =>
  releaseAssetName({ platform: 'linux', arch, distro, appImage });

describe('releaseAssetName', () => {
  test('Windows and macOS, both processors', () => {
    expect(releaseAssetName({ platform: 'win32', arch: 'x64', appImage: false })).toBe('Breezr-win-x64.exe');
    expect(releaseAssetName({ platform: 'win32', arch: 'arm64', appImage: false })).toBe('Breezr-win-arm64.exe');
    expect(releaseAssetName({ platform: 'darwin', arch: 'arm64', appImage: false })).toBe('Breezr-mac-arm64.dmg');
    expect(releaseAssetName({ platform: 'darwin', arch: 'x64', appImage: false })).toBe('Breezr-mac-x64.dmg');
  });

  test('an AppImage user gets an AppImage, whatever the distro', () => {
    expect(linux('x64', { id: 'ubuntu' }, true)).toBe('Breezr-linux-x86_64.AppImage');
    expect(linux('arm64', { id: 'fedora' }, true)).toBe('Breezr-linux-arm64.AppImage');
  });

  test('Debian family: .deb', () => {
    expect(linux('x64', { id: 'ubuntu' })).toBe('Breezr-linux-amd64.deb');
    expect(linux('arm64', { id: 'debian' })).toBe('Breezr-linux-arm64.deb');
    expect(linux('x64', { id: 'linuxmint', like: ['ubuntu', 'debian'] })).toBe('Breezr-linux-amd64.deb');
  });

  test('Fedora family: .rpm', () => {
    expect(linux('x64', { id: 'fedora' })).toBe('Breezr-linux-x86_64.rpm');
    expect(linux('arm64', { id: 'rocky', like: ['rhel', 'centos', 'fedora'] })).toBe('Breezr-linux-aarch64.rpm');
  });

  test('Arch family: the pacman package', () => {
    expect(linux('x64', { id: 'arch' })).toBe('Breezr-linux-x86_64.pkg.tar.zst');
    expect(linux('x64', { id: 'cachyos', like: ['arch'] })).toBe('Breezr-linux-x86_64.pkg.tar.zst');
    expect(linux('arm64', { id: 'archarm', like: ['arch'] })).toBe('Breezr-linux-aarch64.pkg.tar.zst');
  });

  test('anything else on Linux: the AppImage', () => {
    expect(linux('x64', { id: 'nixos' })).toBe('Breezr-linux-x86_64.AppImage');
    expect(linux('x64')).toBe('Breezr-linux-x86_64.AppImage');
  });

  test('an unknown system or processor: nothing (the release page opens instead)', () => {
    expect(releaseAssetName({ platform: 'freebsd', arch: 'x64', appImage: false })).toBeNull();
    expect(linux('ia32', { id: 'ubuntu' })).toBeNull();
  });
});

describe('parseOsRelease', () => {
  test('reads ID and ID_LIKE, quoted or not', () => {
    expect(parseOsRelease('NAME="Linux Mint"\nID=linuxmint\nID_LIKE="ubuntu debian"\n')).toEqual({ id: 'linuxmint', like: ['ubuntu', 'debian'] });
    expect(parseOsRelease('ID="arch"\n')).toEqual({ id: 'arch', like: [] });
  });
});
