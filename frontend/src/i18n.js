import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ro from './locales/ro.json';

const saved = typeof localStorage !== 'undefined' && localStorage.getItem('lang');

i18n.use(initReactI18next).init({
  resources: { ro: { translation: ro } },
  lng: saved || 'ro',
  fallbackLng: false,
  keySeparator: false,
  nsSeparator: false,
  returnNull: false,
  returnEmptyString: false,
  interpolation: { escapeValue: false },
});

export default i18n;
