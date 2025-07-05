import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import es from './locales/es.json'
import ca from './locales/ca.json'
import en from './locales/en.json'

const resources = {
  es: { translation: es },
  ca: { translation: ca },
  en: { translation: en },
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'es', // Default to Spanish as requested
    debug: false,
    returnEmptyString: false,
    
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
    },

    interpolation: {
      escapeValue: false, // not needed for react as it escapes by default
    },
    
    // Prevent returning objects as strings
    returnObjects: false,
    
    // Add missing key handler to prevent errors from showing in UI
    missingKeyHandler: false,
  })

export default i18n