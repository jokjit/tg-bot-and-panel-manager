import assert from 'node:assert/strict';
import test from 'node:test';

import {
  banUserForVerificationFailuresState,
  buildVerificationAutoBanReason,
  buildVerificationAutoBanReportText,
  reportVerificationAutoBan,
} from '../worker-src/telegram/verification-auto-ban.js';

test('verification auto-ban reason and report include audit details', () => {
  assert.equal(
    buildVerificationAutoBanReason({ failureCount: 3 }, 3),
    '首次私聊验证连续失败 3/3 次，系统自动拉黑',
  );
  const text = buildVerificationAutoBanReportText({
    userId: 7,
    failedState: { failureCount: 3, selectedAnswer: '2', correctAnswer: '4' },
    maxFailures: 3,
    entry: { reason: 'reason' },
    profile: { displayName: 'User', username: 'name' },
  });
  assert.match(text, /User @name/);
  assert.match(text, /失败次数：3\/3/);
  assert.match(text, /最后选择：2/);
  assert.match(text, /正确答案：4/);
  assert.match(text, /原因：reason/);
});

test('verification auto-ban persists before sending the admin report', async () => {
  const calls = [];
  const entry = await banUserForVerificationFailuresState({
    userId: 7,
    failedState: { failureCount: 4, selectedAnswer: '' },
    maxFailures: 4,
  }, {
    nowIso: async () => '2026-07-20T00:00:00.000Z',
    setBlacklist: async (...args) => {
      calls.push(['blacklist', ...args]);
      return { ...args[1], userId: args[0] };
    },
    getProfile: async () => ({ displayName: 'User' }),
    getAdminChatId: () => -100,
    sendMessage: async (...args) => calls.push(['notify', ...args]),
  });

  assert.equal(entry.userId, 7);
  assert.equal(entry.createdBy, 'verification-guard');
  assert.equal(entry.createdAt, '2026-07-20T00:00:00.000Z');
  assert.match(entry.reason, /4\/4/);
  assert.deepEqual(calls.map((call) => call[0]), ['blacklist', 'notify']);
  assert.equal(calls[1][1].chat_id, -100);
});

test('verification auto-ban reporting does not reject when Telegram fails', async () => {
  await assert.doesNotReject(reportVerificationAutoBan({
    userId: 8,
    failedState: { failureCount: 3 },
    maxFailures: 3,
    entry: { reason: 'reason' },
  }, {
    getProfile: async () => ({ displayName: 'User' }),
    getAdminChatId: () => -100,
    sendMessage: async () => { throw new Error('Telegram unavailable'); },
  }));
});
