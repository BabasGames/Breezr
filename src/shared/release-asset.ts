// Which file of a GitHub release fits this machine. The names follow what CI publishes (see build.yml):
// electron-builder's own names, except the Arch package, renamed from `.pacman`.

export interface Distro { id?: string; like?: string[] }

/** ID and ID_LIKE from the content of /etc/os-release. */
export function parseOsRelease(text: string): Distro {
  const field = (name: string) => new RegExp(`^${name}="?([^"\\n]*)"?$`, 'm').exec(text)?.[1].trim().toLowerCase();
  return { id: field('ID'), like: (field('ID_LIKE') ?? '').split(/\s+/).filter(Boolean) };
}

const ARCHES = ['x64', 'arm64'] as const;

function family(distro: Distro): 'debian' | 'fedora' | 'arch' | null {
  const names = [distro.id, ...(distro.like ?? [])];
  if (names.some((n) => n === 'debian' || n === 'ubuntu')) return 'debian';
  if (names.some((n) => n === 'fedora' || n === 'rhel' || n === 'centos')) return 'fedora';
  if (names.some((n) => n === 'arch' || n === 'archarm')) return 'arch';
  return null;
}

/** The release file for this machine, or null when there is none (the release page is opened instead). */
export function releaseAssetName(machine: { platform: string; arch: string; distro?: Distro; appImage: boolean }): string | null {
  if (!(ARCHES as readonly string[]).includes(machine.arch)) return null;
  const arm = machine.arch === 'arm64';
  if (machine.platform === 'win32') return `Breezr-win-${machine.arch}.exe`;
  if (machine.platform === 'darwin') return `Breezr-mac-${machine.arch}.dmg`;
  if (machine.platform !== 'linux') return null;
  const appImage = `Breezr-linux-${arm ? 'arm64' : 'x86_64'}.AppImage`;
  // The AppImage runtime sets APPIMAGE, so its users get an AppImage back whatever their distro.
  if (machine.appImage) return appImage;
  switch (family(machine.distro ?? {})) {
    case 'debian': return `Breezr-linux-${arm ? 'arm64' : 'amd64'}.deb`;
    case 'fedora': return `Breezr-linux-${arm ? 'aarch64' : 'x86_64'}.rpm`;
    case 'arch': return `Breezr-linux-${arm ? 'aarch64' : 'x86_64'}.pkg.tar.xz`;
    default: return appImage;
  }
}
