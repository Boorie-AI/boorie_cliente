import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import es from './locales/es.json'
import ca from './locales/ca.json'
import en from './locales/en.json'
import { IDIOMA_POR_DEFECTO } from './utils/idioma'

const resources = {
  es: { translation: es },
  ca: { translation: ca },
  en: { translation: en },
}

/**
 * Sin detector de idioma: el idioma lo decide `usePreferencesStore`, que es lo
 * que enseña el combobox de Configuración (#265). Con el detector, i18next
 * guardaba su propia elección en `i18nextLng` y combobox e interfaz podían no
 * coincidir.
 */
i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: IDIOMA_POR_DEFECTO,
    fallbackLng: IDIOMA_POR_DEFECTO,
    debug: false,

    interpolation: {
      escapeValue: false, // not needed for react as it escapes by default
    },
  })

// Los lectores de pantalla y la partición de palabras leen el idioma de <html>,
// que se quedaba en «en» aunque la aplicación estuviera en castellano.
document.documentElement.lang = i18n.language
i18n.on('languageChanged', idioma => { document.documentElement.lang = idioma })

export default i18n
