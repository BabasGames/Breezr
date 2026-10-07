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
}
