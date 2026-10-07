import type { LocaleCode, Messages } from '../shared/i18n';
import ar from './ar.json';
import de from './de.json';
import en from './en.json';
import es from './es.json';
import fr from './fr.json';
import it from './it.json';
import ja from './ja.json';
import ko from './ko.json';
import nl from './nl.json';
import pl from './pl.json';
import ptBR from './pt-BR.json';
import ru from './ru.json';
import tr from './tr.json';
import zhCN from './zh-CN.json';

export const EN: Messages = en;

export const MESSAGES: Record<LocaleCode, Messages> = {
  en, fr, es, de, it, 'pt-BR': ptBR, nl, pl, tr, ja, ko, 'zh-CN': zhCN, ar, ru,
};
