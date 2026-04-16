import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import { i18n } from './i18n';
import './style.css';

if (typeof window !== 'undefined') {
  const host = window.location.hostname.toLowerCase();
  const canonicalHost = String(import.meta.env.VITE_CANONICAL_HOST || '').trim().toLowerCase();
  const isPagesDomain = host.endsWith('.pages.dev');
  if (canonicalHost && isPagesDomain && host !== canonicalHost) {
    const target = new URL(window.location.href);
    target.protocol = 'https:';
    target.host = canonicalHost;
    window.location.replace(target.toString());
  }
}

createApp(App).use(router).use(i18n).mount('#app');
