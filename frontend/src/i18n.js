// i18n setup. We use natural-language keys: the English text *is* the key, and
// ro.json provides the Romanian translations. This keeps English working with no
// second file and avoids inventing hundreds of key names. A missing key simply
// falls back to itself (the English source string).
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ro from './locales/ro.json';

const saved = typeof localStorage !== 'undefined' && localStorage.getItem('lang');

i18n.use(initReactI18next).init({
  resources: { ro: { translation: ro } },
  lng: saved || 'ro',          // Romanian by default; switchable from the UI
  fallbackLng: false,          // missing key -> return the key itself (English)
  keySeparator: false,         // keys are whole sentences (may contain "." or ":")
  nsSeparator: false,
  returnNull: false,
  returnEmptyString: false,
  interpolation: { escapeValue: false },
});

export default i18n;
