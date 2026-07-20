import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearVerificationPromptMessageRequest,
  deleteVerificationPromptMessageRequest,
  sendUserVerificationPromptRequest,
  sendVerificationPromptMessageRequest,
  setVerificationPromptMessageIdState,
  updateVerificationPromptMessageRequest,
} from '../worker-src/telegram/verification-prompt.js';

function createMessageHandlers(options = {}) {
  const calls = [];
  return {
    calls,
    handlers: {
      buildImage: () => options.imageUrl ?? 'https://worker.example.com/image.png',
      buildCaption: () => 'caption',
      buildText: () => 'text prompt',
      buildKeyboard: (userId) => ({ userId }),
      editMedia: async (...args) => {
        calls.push(['editMedia', ...args]);
        if (options.editMediaError) throw new Error('edit failed');
      },
      sendPhoto: async (...args) => {
        calls.push(['sendPhoto', ...args]);
        if (options.photoError) throw new Error('photo failed');
        return { message_id: options.messageId ?? 80 };
      },
      sendMessage: async (...args) => {
        calls.push(['sendMessage', ...args]);
        return { message_id: options.messageId ?? 81 };
      },
      setPromptMessageId: async (...args) => { calls.push(['setPrompt', ...args]); },
    },
  };
}

test('verification prompt sends photos and falls back to text when media is unavailable', async () => {
  const photo = createMessageHandlers({ messageId: 80 });
  const sentPhoto = await sendVerificationPromptMessageRequest({
    userId: 7,
    state: { challenge: { token: 'challenge' } },
    publicBaseUrl: 'https://worker.example.com',
  }, photo.handlers);
  assert.equal(sentPhoto.message_id, 80);
  assert.equal(photo.calls[0][0], 'sendPhoto');
  assert.deepEqual(photo.calls[0][1].reply_markup, { userId: 7 });

  const text = createMessageHandlers({ imageUrl: '', messageId: 81 });
  const sentText = await sendVerificationPromptMessageRequest({
    userId: 7,
    state: { challenge: {} },
  }, text.handlers);
  assert.equal(sentText.message_id, 81);
  assert.equal(text.calls.some((call) => call[0] === 'sendPhoto'), false);
  assert.equal(text.calls[0][0], 'sendMessage');
  assert.equal(text.calls[0][1].text, 'text prompt');
});

test('verification prompt updates media or sends a replacement on edit failure', async () => {
  const message = { message_id: 70, chat: { id: 7 } };
  const state = { challenge: {} };
  const edited = createMessageHandlers();
  assert.deepEqual(await updateVerificationPromptMessageRequest({ message, state }, edited.handlers), {
    delivery: 'edited',
    messageId: 70,
  });
  assert.deepEqual(edited.calls.find((call) => call[0] === 'setPrompt'), ['setPrompt', 7, 70]);
  assert.equal(edited.calls.some((call) => call[0] === 'sendPhoto'), false);

  const replaced = createMessageHandlers({ editMediaError: true, messageId: 82 });
  assert.deepEqual(await updateVerificationPromptMessageRequest({ message, state }, replaced.handlers), {
    delivery: 'sent',
    messageId: 82,
  });
  assert.equal(replaced.calls.some((call) => call[0] === 'sendPhoto'), true);
  assert.deepEqual(replaced.calls.find((call) => call[0] === 'setPrompt'), ['setPrompt', 7, 82]);
});

test('user verification prompt sends and records the delivered message ID', async () => {
  const { calls, handlers } = createMessageHandlers({ messageId: 83 });
  const sent = await sendUserVerificationPromptRequest({ userId: 7, state: { challenge: {} } }, handlers);
  assert.equal(sent.message_id, 83);
  assert.deepEqual(calls.find((call) => call[0] === 'setPrompt'), ['setPrompt', 7, 83]);
});

test('verification prompt clearing falls back from caption to text and swallows stale failures', async () => {
  const calls = [];
  const result = await clearVerificationPromptMessageRequest({ chatId: 7, messageId: 70, text: 'expired' }, {
    editCaption: async (payload) => { calls.push(['caption', payload]); throw new Error('no caption'); },
    editText: async (payload) => { calls.push(['text', payload]); },
  });
  assert.equal(result, true);
  assert.deepEqual(calls.map((call) => call[0]), ['caption', 'text']);
  assert.deepEqual(calls[1][1].reply_markup, { inline_keyboard: [] });

  const failed = await clearVerificationPromptMessageRequest({ chatId: 7, messageId: 70, text: 'expired' }, {
    editCaption: async () => { throw new Error('caption failed'); },
    editText: async () => { throw new Error('text failed'); },
  });
  assert.equal(failed, false);
  assert.equal(await clearVerificationPromptMessageRequest({ messageId: 0 }, {}), false);
});

test('verification prompt deletion degrades to clearing the stale message', async () => {
  const deletedCalls = [];
  assert.equal(await deleteVerificationPromptMessageRequest({ chatId: 7, messageId: 70 }, {
    deleteMessage: async (payload) => { deletedCalls.push(payload); },
  }), true);
  assert.deepEqual(deletedCalls[0], { chat_id: 7, message_id: 70 });

  const calls = [];
  const result = await deleteVerificationPromptMessageRequest({
    chatId: 7,
    messageId: '71',
    staleText: 'stale',
  }, {
    deleteMessage: async () => { throw new Error('delete failed'); },
    editCaption: async (payload) => { calls.push(['caption', payload]); },
    editText: async () => {},
  });
  assert.equal(result, false);
  assert.equal(calls[0][1].caption, 'stale');
  assert.equal(await deleteVerificationPromptMessageRequest({ messageId: 0 }, {}), false);
});

function createStateHandlers(state, options = {}) {
  const calls = [];
  return {
    calls,
    handlers: {
      getState: async () => state,
      getProfile: async () => options.profile || { passed: false },
      isStateActive: async () => options.active === true,
      isProfilePassed: (profile) => profile?.passed === true,
      markProfilePassed: async (...args) => { calls.push(['mark', ...args]); },
      resetAfterRevocation: async (...args) => {
        calls.push(['reset', ...args]);
        return { ...args[1], verified: false };
      },
      repairFromProfile: async () => options.repaired || null,
      clearPrompt: async (...args) => { calls.push(['clear', ...args]); },
      nowIso: () => '2026-07-20T00:00:00.000Z',
      saveState: async (...args) => { calls.push(['save', ...args]); },
    },
  };
}

test('prompt ID state keeps active verification and invalidates profile-repaired prompts', async () => {
  const active = createStateHandlers({ verified: true, verifiedAt: 'passed-at' }, { active: true });
  const activeResult = await setVerificationPromptMessageIdState({ userId: 7, messageId: 70 }, active.handlers);
  assert.equal(activeResult.status, 'verified-active');
  assert.deepEqual(active.calls.find((call) => call[0] === 'mark'), ['mark', 7, 'passed-at']);
  assert.equal(active.calls.some((call) => call[0] === 'save'), false);

  const repairedState = { verified: true, verifiedAt: 'repaired-at' };
  const repaired = createStateHandlers({ verified: false }, { repaired: repairedState });
  const repairedResult = await setVerificationPromptMessageIdState({ userId: 7, messageId: 71 }, repaired.handlers);
  assert.equal(repairedResult.status, 'verified-repaired');
  assert.equal(repairedResult.state, repairedState);
  assert.deepEqual(repaired.calls.find((call) => call[0] === 'clear').slice(0, 3), ['clear', 7, 71]);
});

test('prompt ID state saves the delivered message against the previous state', async () => {
  const state = { verified: false, challenge: { token: 'challenge' } };
  const { calls, handlers } = createStateHandlers(state);
  const result = await setVerificationPromptMessageIdState({ userId: 7, messageId: '72' }, handlers);
  assert.equal(result.status, 'saved');
  assert.equal(result.state.promptMessageId, 72);
  assert.equal(result.state.updatedAt, '2026-07-20T00:00:00.000Z');
  const saved = calls.find((call) => call[0] === 'save');
  assert.equal(saved[1], 7);
  assert.equal(saved[2], result.state);
  assert.equal(saved[3], state);
});
