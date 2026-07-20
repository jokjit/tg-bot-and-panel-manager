import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildVerificationFailureAdminKeyboard,
  buildVerificationFailureReportText,
  formatVerificationReasonText,
  formatVerificationStageText,
  lockVerificationAndReportState,
  reportVerificationFailureToAdmin,
} from '../worker-src/telegram/verification-lock.js';

const nowMs = Date.parse('2026-07-20T00:00:00.000Z');

test('verification lock persists state before notifications and clears the session', async () => {
  const calls = [];
  const existing = { stage: 'slider', slider: { attempts: 3 }, sessionExpiresAt: 'old' };
  const detail = { stage: 'slider', reason: 'trace_too_fast', traceLength: 3 };
  const result = await lockVerificationAndReportState({ userId: 7, state: existing, detail }, {
    nowMs: () => nowMs,
    getRetryBlockMs: () => 60 * 60 * 1000,
    saveState: async (...args) => { calls.push(['save', ...args]); },
    clearLatest: async (...args) => { calls.push(['clearLatest', ...args]); },
    notifyUser: async (...args) => { calls.push(['notify', ...args]); throw new Error('blocked by user'); },
    reportFailure: async (...args) => { calls.push(['report', ...args]); },
  });

  assert.equal(result.stage, 'blocked');
  assert.equal(result.verified, false);
  assert.equal(result.verifiedAt, null);
  assert.equal(result.sessionExpiresAt, null);
  assert.equal(result.blockedUntil, '2026-07-20T01:00:00.000Z');
  assert.equal(result.lastLockAt, '2026-07-20T00:00:00.000Z');
  assert.equal(result.lastLockReason, 'trace_too_fast');
  assert.equal(result.lastLockStage, 'slider');
  assert.equal(result.lastLockDetail, detail);
  assert.deepEqual(calls.map((call) => call[0]), ['save', 'clearLatest', 'notify', 'report']);
  assert.equal(calls[0][1], 7);
  assert.equal(calls[0][2], result);
  assert.equal(calls[0][3], existing);
  assert.equal(calls[3][2], result);
});

test('verification lock supplies defaults when failure detail is absent', async () => {
  const result = await lockVerificationAndReportState({ userId: '8', state: null }, {
    nowMs: () => nowMs,
    getRetryBlockMs: () => 1000,
    saveState: async () => {},
    clearLatest: async () => {},
    notifyUser: async () => {},
    reportFailure: async () => {},
  });
  assert.equal(result.userId, 8);
  assert.equal(result.lastLockReason, 'verification_failed');
  assert.equal(result.lastLockStage, null);
  assert.deepEqual(result.lastLockDetail, {});
});

test('verification failure report formats stage, reason, attempts, and admin actions', () => {
  assert.equal(formatVerificationStageText('grid'), '九宫格点选');
  assert.equal(formatVerificationStageText('other'), '未知阶段');
  assert.equal(formatVerificationReasonText('proof_expired'), 'proof expired');
  assert.equal(formatVerificationReasonText('other'), '未知原因');

  const text = buildVerificationFailureReportText({
    userId: 7,
    profile: { displayName: 'User', username: 'name' },
    maxAttempts: 3,
    state: {
      lastLockStage: 'grid',
      lastLockReason: 'grid_selection_mismatch',
      blockedUntil: 'later',
      slider: { attempts: 1 },
      grid: { attempts: 3 },
      choice: { attempts: 0 },
    },
  });
  assert.match(text, /用户：User @name/);
  assert.match(text, /阶段：九宫格点选 \(grid\)/);
  assert.match(text, /原因：九宫格选择错误 \(grid_selection_mismatch\)/);
  assert.match(text, /旋转尝试：1\/3/);
  assert.match(text, /九宫格尝试：3\/3/);

  const keyboard = buildVerificationFailureAdminKeyboard(7);
  assert.equal(keyboard.inline_keyboard[0][0].callback_data, 'adm:verifypass:7');
  assert.equal(keyboard.inline_keyboard[1][0].callback_data, 'adm:restart:7');
  assert.equal(keyboard.inline_keyboard[1][1].callback_data, 'adm:ban:7');
});

test('verification failure reporting targets the configured topic and swallows delivery errors', async () => {
  const calls = [];
  const handlers = {
    getProfile: async () => ({ displayName: 'User' }),
    getAdminChatId: () => -100,
    getTopicId: () => 55,
    getMaxAttempts: () => 3,
    sendMessage: async (payload) => { calls.push(payload); },
  };
  await reportVerificationFailureToAdmin({
    userId: 7,
    state: { lastLockStage: 'choice', lastLockReason: 'choice_selection_mismatch' },
  }, handlers);
  assert.equal(calls[0].chat_id, -100);
  assert.equal(calls[0].message_thread_id, 55);
  assert.match(calls[0].text, /数字选择错误/);

  await assert.doesNotReject(reportVerificationFailureToAdmin({ userId: 7, state: {} }, {
    ...handlers,
    sendMessage: async () => { throw new Error('Telegram unavailable'); },
  }));
});
