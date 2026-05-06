import { reactive } from 'vue';

const LOCALE_KEY = 'tg_panel_locale';
const THEME_KEY = 'tg_panel_theme';
const MOTION_KEY = 'tg_panel_motion';

const defaultLocale = 'zh-CN';
const defaultTheme = 'dark';
const defaultMotion = 'standard';

const initialLocale = localStorage.getItem(LOCALE_KEY) || defaultLocale;
const initialTheme = localStorage.getItem(THEME_KEY) || defaultTheme;
const initialMotionRaw = localStorage.getItem(MOTION_KEY) || defaultMotion;
const initialMotion = ['standard', 'light', 'off'].includes(initialMotionRaw) ? initialMotionRaw : defaultMotion;

export const uiStore = reactive({
  locale: initialLocale,
  theme: initialTheme,
  motion: initialMotion,
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

export function setMotion(motion) {
  const next = ['standard', 'light', 'off'].includes(motion) ? motion : defaultMotion;
  uiStore.motion = next;
  localStorage.setItem(MOTION_KEY, next);
  applyMotionToBody(next);
}

export function applyThemeToBody(theme = uiStore.theme) {
  if (typeof document === 'undefined') return;
  document.body.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
}

export function applyMotionToBody(motion = uiStore.motion) {
  if (typeof document === 'undefined') return;
  const next = ['standard', 'light', 'off'].includes(motion) ? motion : defaultMotion;
  document.body.setAttribute('data-motion', next);
}

applyThemeToBody(initialTheme);
applyMotionToBody(initialMotion);
