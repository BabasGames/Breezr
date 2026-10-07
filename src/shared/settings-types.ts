import type { BreezrConfig } from './config-schema';
import type { LocaleCode, Messages } from './i18n';
import type { ThemeConfig } from './theme-model';

export interface SettingsSnapshot {
  config: BreezrConfig;
  locale: LocaleCode;
  dir: 'ltr' | 'rtl';
  messages: Messages;
  fallback: Messages;
  version: string;
}

export interface BreezrBridge {
  settings: {
    get(): Promise<SettingsSnapshot>;
    preview(theme: ThemeConfig): void;
    save(config: BreezrConfig): Promise<SettingsSnapshot>;
    cancel(): void;
    onOpen(callback: () => void): void;
  };
}
