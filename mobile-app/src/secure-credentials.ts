import { Capacitor, registerPlugin } from '@capacitor/core';

export interface AccountCredentials {
  cfApiToken: string;
  botToken: string;
  adminChatId: string;
}

interface SecureCredentialsPlugin {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
  clear(): Promise<void>;
}

const SecureCredentials = registerPlugin<SecureCredentialsPlugin>('SecureCredentials');
const ACCOUNT_KEY_PREFIX = 'account:';
let secureOperationQueue: Promise<void> = Promise.resolve();

function queueSecureOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = secureOperationQueue.then(operation, operation);
  secureOperationQueue = result.then(() => undefined, () => undefined);
  return result;
}

function isAndroidNative(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

function accountKey(accountId: string): string {
  const id = String(accountId || '').trim();
  if (!id) throw new Error('Missing account ID for secure credentials');
  return `${ACCOUNT_KEY_PREFIX}${id}`;
}

function normalizeCredentials(input: Partial<AccountCredentials> | null | undefined): AccountCredentials {
  return {
    cfApiToken: String(input?.cfApiToken || '').trim(),
    botToken: String(input?.botToken || '').trim(),
    adminChatId: String(input?.adminChatId || '').trim(),
  };
}

export async function loadAccountCredentials(accountId: string): Promise<AccountCredentials> {
  if (!isAndroidNative()) return normalizeCredentials(null);

  const result = await queueSecureOperation(() => SecureCredentials.get({ key: accountKey(accountId) }));
  if (!result.value) return normalizeCredentials(null);

  const parsed = JSON.parse(result.value) as Partial<AccountCredentials>;
  return normalizeCredentials(parsed);
}

export async function saveAccountCredentials(
  accountId: string,
  credentials: AccountCredentials,
): Promise<void> {
  if (!isAndroidNative()) return;

  const normalized = normalizeCredentials(credentials);
  if (!normalized.cfApiToken && !normalized.botToken && !normalized.adminChatId) {
    await queueSecureOperation(() => SecureCredentials.remove({ key: accountKey(accountId) }));
    return;
  }

  await queueSecureOperation(() => SecureCredentials.set({
    key: accountKey(accountId),
    value: JSON.stringify(normalized),
  }));
}

export async function removeAccountCredentials(accountId: string): Promise<void> {
  if (!isAndroidNative()) return;
  await queueSecureOperation(() => SecureCredentials.remove({ key: accountKey(accountId) }));
}

export async function clearAccountCredentials(): Promise<void> {
  if (!isAndroidNative()) return;
  await queueSecureOperation(() => SecureCredentials.clear());
}
