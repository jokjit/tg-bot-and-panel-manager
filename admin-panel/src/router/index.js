import { createRouter, createWebHistory } from 'vue-router';
import { fetchAuthState } from '../services/api';
import { adminStore, clearAuthState, setAuthState } from '../stores/admin';

const ConsoleLayout = () => import('../views/ConsoleLayout.vue');
const DashboardView = () => import('../views/DashboardView.vue');
const UsersView = () => import('../views/UsersView.vue');
const BlacklistView = () => import('../views/BlacklistView.vue');
const AdminsView = () => import('../views/AdminsView.vue');
const TrustView = () => import('../views/TrustView.vue');
const SettingsView = () => import('../views/SettingsView.vue');
const KeywordsView = () => import('../views/KeywordsView.vue');
const MessagesView = () => import('../views/MessagesView.vue');
const HistoryView = () => import('../views/HistoryView.vue');
const PasswordManageView = () => import('../views/PasswordManageView.vue');
const LoginView = () => import('../views/LoginView.vue');
const PasswordResetView = () => import('../views/PasswordResetView.vue');

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

const routerInstance = createRouter({
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

routerInstance.beforeEach(async (to) => {
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

export default routerInstance;
