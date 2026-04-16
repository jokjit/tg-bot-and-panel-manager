import { reactive } from 'vue';

const LOCALE_KEY = 'tg_panel_locale';
const THEME_KEY = 'tg_panel_theme';

const defaultLocale = 'zh-CN';
const defaultTheme = 'dark';

const initialLocale = localStorage.getItem(LOCALE_KEY) || defaultLocale;
const initialTheme = localStorage.getItem(THEME_KEY) || defaultTheme;

export const uiStore = reactive({
  locale: initialLocale,
  theme: initialTheme,
});

export function setLocale(locale) {
  const next = locale === 'en-US' ? 'en-US' : 'zh-CN';
  uiStore.locale = next;
  localStorage.setItem(LOCALE_KEY, next);
}

export function setTheme(theme) {
  const next = theme === 'dark' ? 'dark' : 'light';
  uiStore.theme = next;
  localStorage.setItem(THEME_KEY, next);
  applyThemeToBody(next);
}

export function applyThemeToBody(theme = uiStore.theme) {
  if (typeof document === 'undefined') return;
  document.body.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
}

applyThemeToBody(initialTheme);
