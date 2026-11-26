// i18n.js: translations (English + Hindi).
//
// All the words shown on screen live in src/locales/en.json and hi.json.
// In code we write  t('home.heroTitle')  instead of the English text, and
// i18next picks the right language.
//
// To add another language (e.g. Tamil): copy en.json to ta.json, translate
// the right-hand side of every line, then add it to "resources" below.

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import hi from './locales/hi.json'

export const LANGUAGES = ['en', 'hi']

// Language to start with: the one chosen last time, otherwise the phone's language
function startingLanguage() {
  try {
    const saved = localStorage.getItem('lang')
    if (LANGUAGES.includes(saved)) return saved
  } catch {
    // storage blocked: ignore
  }
  return navigator.language?.toLowerCase().startsWith('hi') ? 'hi' : 'en'
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, hi: { translation: hi } },
  lng: startingLanguage(),
  fallbackLng: 'en',                 // anything missing in Hindi shows in English
  interpolation: { escapeValue: false }, // React already protects against harmful text
})

// Remember the choice, and tell the browser which language the page is in
function onLanguage(lang) {
  document.documentElement.lang = lang
  try {
    localStorage.setItem('lang', lang)
  } catch {
    // ignore
  }
}
onLanguage(i18n.language)
i18n.on('languageChanged', onLanguage)

export default i18n
