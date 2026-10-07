import type { BrowserWindow } from 'electron';
import { homedir } from 'os';
import {
  defaultSourcePath, displayPath, parseCaelestiaScheme, parsePywal, publicSourceKey, type PathEnv, type SourceUpdate,
} from '../shared/palette';
import { isDeezerUrl } from '../shared/origin';
import type { ThemeConfig } from '../shared/theme-model';
import { readAccentOnce, watchAccentSource } from './accent-source';
import { loadSourceCache, saveSourceCache } from './source-cache';
import { applyTheme } from './theme';
import { ThemeState } from './theme-state';
import { readFileSourceOnce, watchFileSource } from './theme-source';

export function pathEnv(): PathEnv {
  return {
    home: homedir(),
    XDG_STATE_HOME: process.env.XDG_STATE_HOME,
    XDG_CACHE_HOME: process.env.XDG_CACHE_HOME,
    PYWAL_CACHE_DIR: process.env.PYWAL_CACHE_DIR,
  };
}

/** Default palette paths, for display in the settings (home shortened to ~). */
export function defaultPathsForDisplay(env: PathEnv = pathEnv()): { caelestia: string; pywal: string } {
  return {
    caelestia: displayPath(defaultSourcePath('caelestia', env), env.home),
    pywal: displayPath(defaultSourcePath('pywal', env), env.home),
  };
}

/** Wires the theme state to Electron: real files, the OS accent, the page, the cache in userData. */
export function createThemeState(app: Electron.App, win: BrowserWindow): ThemeState {
  const env = pathEnv();
  const fileSource = (theme: ThemeConfig) => {
    const kind = theme.source === 'pywal' ? 'pywal' : 'caelestia';
    return {
      path: theme.sourcePaths[kind] || defaultSourcePath(kind, env),
      parse: kind === 'pywal' ? parsePywal : parseCaelestiaScheme,
    };
  };
  return new ThemeState({
    env,
    readOnce: async (theme) => {
      if (theme.source === 'system') return readAccentOnce();
      const { path, parse } = fileSource(theme);
      return readFileSourceOnce(path, parse, env.home);
    },
    watch: (theme, initial, onUpdate) => {
      if (theme.source === 'system') return watchAccentSource(onUpdate, initial);
      const { path, parse } = fileSource(theme);
      return watchFileSource({ path, parse, home: env.home, onUpdate, initial });
    },
    apply: (theme, palette, opts) => applyTheme(win.webContents, theme, palette, opts),
    notify: (update: SourceUpdate & { forSource: string }) => {
      if (win.isDestroyed()) return;
      // Only a trusted Deezer page gets it (it may be read by the page's own scripts).
      // The real path contains the user name: the page only gets the ~ form.
      if (isDeezerUrl(win.webContents.getURL())) {
        win.webContents.send('breezr:settings:source', { ...update, forSource: publicSourceKey(update.forSource, env.home) });
      }
    },
    loadCache: (key) => loadSourceCache(app.getPath('userData'), key),
    saveCache: (key, palette) => saveSourceCache(app.getPath('userData'), key, palette),
    now: Date.now,
  });
}
