import { reactive } from 'vue';

export const adminStore = reactive({
  loggedIn: false,
  username: 'admin',
  statusData: null,
  loading: false,
  mustChangePassword: false,
  authResolved: false,
  passwordReady: false,
  passwordMode: 'none',
  bootstrapExpiresAt: null,
  bootstrapNotifyError: null,
});

export function setAuthState(payload = {}) {
  const authenticated = Boolean(payload.authenticated);
  adminStore.loggedIn = authenticated;
  adminStore.username = payload.username || 'admin';
  adminStore.mustChangePassword = authenticated ? Boolean(payload.mustChangePassword) : false;
  adminStore.authResolved = true;
  adminStore.passwordReady = payload.passwordReady !== false;
  adminStore.passwordMode = payload.passwordMode || (authenticated ? 'permanent' : 'none');
  adminStore.bootstrapExpiresAt = payload.bootstrapExpiresAt || null;
  adminStore.bootstrapNotifyError = payload.bootstrapNotifyError || null;

  if (!authenticated) {
    adminStore.statusData = null;
  }
}

export function clearAuthState() {
  adminStore.loggedIn = false;
  adminStore.username = 'admin';
  adminStore.statusData = null;
  adminStore.loading = false;
  adminStore.mustChangePassword = false;
  adminStore.authResolved = false;
  adminStore.passwordReady = false;
  adminStore.passwordMode = 'none';
  adminStore.bootstrapExpiresAt = null;
  adminStore.bootstrapNotifyError = null;
}

export function setLoginState(loggedIn, username = '') {
  adminStore.loggedIn = Boolean(loggedIn);
  adminStore.username = username || 'admin';
  adminStore.authResolved = true;

  if (!loggedIn) {
    adminStore.mustChangePassword = false;
    adminStore.passwordMode = 'none';
    adminStore.bootstrapExpiresAt = null;
    adminStore.bootstrapNotifyError = null;
  }
}

export function setPasswordChallenge(mustChangePassword, passwordMode = 'none', bootstrapExpiresAt = null) {
  adminStore.mustChangePassword = Boolean(mustChangePassword);
  adminStore.passwordMode = passwordMode || 'none';
  adminStore.bootstrapExpiresAt = bootstrapExpiresAt || null;
  adminStore.bootstrapNotifyError = null;
}

export function setStatusData(data) {
  adminStore.statusData = data || null;
}

export function setAdminLoading(loading) {
  adminStore.loading = Boolean(loading);
}
