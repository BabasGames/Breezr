import type { BreezrConfig } from './config-schema';
import type { LocaleCode, Messages } from './i18n';
import type { ThemeConfig } from './theme-model';
import type { SourceUpdate } from './palette';

export type SourceMessage = SourceUpdate & { forSource: string };

export interface SettingsSnapshot {
  config: BreezrConfig;
  locale: LocaleCode;
  dir: 'ltr' | 'rtl';
  messages: Messages;
  fallback: Messages;
  version: string;
  /** Palette and status of the saved source. */
  source: SourceMessage;
  /** Default palette paths, home shortened to ~ (placeholders of the path fields). */
  defaultPaths: { caelestia: string; pywal: string };
  /** The live link, when enabled. */
  liveUrl: string | null;
}

export interface BreezrBridge {
  settings: {
    get(): Promise<SettingsSnapshot>;
    preview(theme: ThemeConfig): void;
    save(config: BreezrConfig): Promise<SettingsSnapshot>;
    cancel(): void;
    onOpen(callback: () => void): void;
    /** Palette/status of the source currently shown (saved or previewed), whenever it changes. */
    onSource(callback: (update: SourceMessage) => void): void;
  };
  live: {
    /** Turns the live link on if needed, copies it to the clipboard, returns it. */
    share(): Promise<{ url: string }>;
    /** Turns the live link on or off right away (off deletes it); returns the link, or null when off. */
    set(on: boolean): Promise<{ url: string | null }>;
    /** How many pages follow the link right now; null when the link is off or the server unreachable. */
    viewers(): Promise<{ viewers: number | null }>;
    /** Replaces the link: the old one stops working. */
    renew(): Promise<{ url: string }>;
  };
}
