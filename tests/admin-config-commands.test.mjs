import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAdminConfigSummary,
  handleAdminConfigCommand,
} from '../worker-src/telegram/admin-config-commands.js';

function createHandlers(initial = {}) {
  let config = { ...initial };
  const calls = [];
  return {
    calls,
    get config() { return config; },
    handlers: {
      defaultBlockedText: 'default blocked',
      getConfig: async () => ({ ...config }),
      updateConfig: async (payload) => {
        calls.push(['update', payload]);
        config = { ...config };
        for (const [key, value] of Object.entries(payload)) {
          if (value === '') delete config[key];
          else config[key] = value;
        }
      },
      sendNotice: async (text) => { calls.push(['notice', text]); },
    },
  };
}

test('config summary reports verification, keyword, and runtime rules', () => {
  const text = buildAdminConfigSummary({
    USER_VERIFICATION: 'true',
    VERIFY_CAPTCHA_ENABLED: 'false',
    VERIFY_MATH_ENABLED: 'true',
    KEYWORD_FILTERS: 'spam\n广告',
    TOPIC_MODE: 'false',
  }, { defaultBlockedText: 'blocked' });
  assert.match(text, /数字选择验证/);
  assert.match(text, /关键词规则：2 条/);
  assert.match(text, /封禁提示：blocked/);
  assert.match(text, /话题模式：已关闭/);
});

test('verification commands update mutually exclusive flow and numeric rules', async () => {
  const setup = createHandlers();
  assert.equal(await handleAdminConfigCommand({ trimmed: '/verification off' }, setup.handlers), true);
  assert.equal(setup.config.USER_VERIFICATION, 'false');
  await handleAdminConfigCommand({ trimmed: '/verifyflow math' }, setup.handlers);
  assert.equal(setup.config.VERIFY_CAPTCHA_ENABLED, 'false');
  assert.equal(setup.config.VERIFY_MATH_ENABLED, 'true');
  await handleAdminConfigCommand({ trimmed: '/verifyexpire 30' }, setup.handlers);
  assert.equal(setup.config.VERIFY_EXPIRE_MS, '1800000');
  await handleAdminConfigCommand({ trimmed: '/verifyobserve 0' }, setup.handlers);
  assert.equal(setup.config.VERIFY_OBSERVE_MESSAGE_COUNT, '0');
});

test('keyword and blocked-text commands view, replace, and clear rules', async () => {
  const setup = createHandlers({ KEYWORD_FILTERS: 'old', BLOCKED_TEXT: 'old blocked' });
  await handleAdminConfigCommand({ trimmed: '/setkeywords spam, 广告\nspam' }, setup.handlers);
  assert.equal(setup.config.KEYWORD_FILTERS, 'spam\n广告');
  await handleAdminConfigCommand({ trimmed: '/keywords' }, setup.handlers);
  assert.match(setup.calls.at(-1)[1], /1\. spam/);
  await handleAdminConfigCommand({ trimmed: '/setblockedtext access denied' }, setup.handlers);
  assert.equal(setup.config.BLOCKED_TEXT, 'access denied');
  await handleAdminConfigCommand({ trimmed: '/clearkeywords' }, setup.handlers);
  assert.equal('KEYWORD_FILTERS' in setup.config, false);
  await handleAdminConfigCommand({ trimmed: '/resetblockedtext' }, setup.handlers);
  assert.equal('BLOCKED_TEXT' in setup.config, false);
});

test('runtime and maintenance toggles share the persisted system config', async () => {
  const setup = createHandlers();
  await handleAdminConfigCommand({ trimmed: '/topicmode off' }, setup.handlers);
  await handleAdminConfigCommand({ trimmed: '/metamode always' }, setup.handlers);
  await handleAdminConfigCommand({ trimmed: '/cleanupauto off' }, setup.handlers);
  await handleAdminConfigCommand({ trimmed: '/sweepbatch 200' }, setup.handlers);
  assert.equal(setup.config.TOPIC_MODE, 'false');
  assert.equal(setup.config.ADMIN_META_MODE, 'always');
  assert.equal(setup.config.DATA_CLEANUP_AUTO, 'false');
  assert.equal(setup.config.DELETED_ACCOUNT_SWEEP_BATCH_SIZE, '200');
});
