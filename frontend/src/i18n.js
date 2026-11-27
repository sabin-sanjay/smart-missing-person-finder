// i18n.js: translations (English, Hindi, Tamil, Malayalam, Telugu).
//
// All the words shown on screen live in src/locales/<language>.json.
// In code we write  t('home.heroTitle')  instead of the English text, and
// i18next picks the right language.
//
// To add another language (e.g. Tamil): copy en.json to ta.json, translate
// the right-hand side of every line, then add it to "resources" below.

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import hi from './locales/hi.json'
import ta from './locales/ta.json'
import ml from './locales/ml.json'
import te from './locales/te.json'

// The languages, each written in its own script (shown in the language menu)
export const LANGUAGE_NAMES = { en: 'English', hi: 'हिंदी', ta: 'தமிழ்', ml: 'മലയാളം', te: 'తెలుగు' }
export const LANGUAGES = Object.keys(LANGUAGE_NAMES)

// For dates and times: "ta" -> "ta-IN" (Indian formats in that language)
export const dateLocale = (lang) => `${LANGUAGES.includes(lang) ? lang : 'en'}-IN`

// Language to start with: the one chosen last time, otherwise the phone's language
function startingLanguage() {
  try {
    const saved = localStorage.getItem('lang')
    if (LANGUAGES.includes(saved)) return saved
  } catch {
    // storage blocked: ignore
  }
  const phone = navigator.language?.toLowerCase().slice(0, 2)
  return LANGUAGES.includes(phone) ? phone : 'en'
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en }, hi: { translation: hi }, ta: { translation: ta },
    ml: { translation: ml }, te: { translation: te },
  },
  lng: startingLanguage(),
  fallbackLng: 'en',                 // anything not translated shows in English
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
