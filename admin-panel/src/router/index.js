import { createRouter, createWebHistory } from 'vue-router';
import ConsoleLayout from '../views/ConsoleLayout.vue';
import DashboardView from '../views/DashboardView.vue';
import UsersView from '../views/UsersView.vue';
import BlacklistView from '../views/BlacklistView.vue';
import AdminsView from '../views/AdminsView.vue';
import TrustView from '../views/TrustView.vue';
import SettingsView from '../views/SettingsView.vue';
import KeywordsView from '../views/KeywordsView.vue';
import MessagesView from '../views/MessagesView.vue';
import HistoryView from '../views/HistoryView.vue';
import PasswordManageView from '../views/PasswordManageView.vue';
import LoginView from '../views/LoginView.vue';
import PasswordResetView from '../views/PasswordResetView.vue';
import { fetchAuthState } from '../services/api';
import { adminStore, clearAuthState, setAuthState } from '../stores/admin';

const routes = [
  {
    path: '/login',
    name: 'login',
    component: LoginView,
    meta: { public: true },
  },
  {
    path: '/password-reset',
    name: 'password-reset',
    component: PasswordResetView,
    meta: { public: true },
  },
  {
    path: '/',
    component: ConsoleLayout,
    children: [
      { path: '', redirect: '/dashboard' },
      { path: 'dashboard', name: 'dashboard', component: DashboardView, meta: { titleKey: 'app.dashboard' } },
      { path: 'users', name: 'users', component: UsersView, meta: { titleKey: 'app.users' } },
      { path: 'blacklist', name: 'blacklist', component: BlacklistView, meta: { titleKey: 'app.blacklist' } },
      { path: 'trust', name: 'trust', component: TrustView, meta: { titleKey: 'app.trust' } },
      { path: 'admins', name: 'admins', component: AdminsView, meta: { titleKey: 'app.admins' } },
      { path: 'keywords', name: 'keywords', component: KeywordsView, meta: { titleKey: 'app.keywords' } },
      { path: 'messages', name: 'messages', component: MessagesView, meta: { titleKey: 'app.messages' } },
      { path: 'history', name: 'history', component: HistoryView, meta: { titleKey: 'app.history' } },
      { path: 'password', name: 'password', component: PasswordManageView, meta: { titleKey: 'app.password' } },
      { path: 'settings', name: 'settings', component: SettingsView, meta: { titleKey: 'app.settings' } },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

async function ensureAuthState() {
  if (adminStore.authResolved) return;

  try {
    const data = await fetchAuthState();
    setAuthState(data);
  } catch (error) {
    clearAuthState();
  }
}

router.beforeEach(async (to) => {
  await ensureAuthState();

  if (to.name === 'login') {
    if (!adminStore.loggedIn) return true;
    return adminStore.mustChangePassword ? '/password-reset' : '/dashboard';
  }

  if (to.name === 'password-reset') {
    if (!adminStore.loggedIn) return '/login';
    if (!adminStore.mustChangePassword) return '/dashboard';
    return true;
  }

  if (!adminStore.loggedIn) {
    return '/login';
  }

  if (adminStore.mustChangePassword) {
    return '/password-reset';
  }

  return true;
});

export default router;
