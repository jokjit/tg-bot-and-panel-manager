import assert from 'node:assert/strict';
import test from 'node:test';

import { buildVerificationSessionPayloadResponse } from '../worker-src/telegram/verification-payload.js';

function createHandlers(overrides = {}) {
  return {
    nowMs: () => 1000,
    getMaxAttempts: () => 3,
    createChoiceChallenge: () => ({ question: 'fallback', options: ['1'], attempts: 0 }),
    buildChoiceImage: (choice, baseUrl) => `${baseUrl}/choice/${choice.question}`,
    createSliderChallenge: () => ({ type: 'rotation', submitNonce: 'fallback' }),
    buildSliderProof: async (_state, slider) => ({ nonce: slider.submitNonce, signature: 'signature' }),
    buildRotationImage: (slider) => `rotation:${slider.seed || ''}`,
    buildPuzzleImage: (slider) => `puzzle:${slider.seed || ''}`,
    createGridChallenge: () => ({ targetSymbols: [], cells: [], attempts: 0 }),
    ...overrides,
  };
}

test('verification payload reports verified and blocked terminal states', async () => {
  const handlers = createHandlers();
  assert.deepEqual(await buildVerificationSessionPayloadResponse({
    state: { verified: true, verifiedAt: 'verified-at' },
  }, handlers), {
    status: 'verified',
    verifiedAt: 'verified-at',
  });
  assert.deepEqual(await buildVerificationSessionPayloadResponse({
    state: { blockedUntil: new Date(5000).toISOString() },
  }, handlers), {
    status: 'blocked',
    blockedUntil: new Date(5000).toISOString(),
    retryAfterMs: 4000,
  });
});

test('verification payload limits and stringifies numeric choice content', async () => {
  const result = await buildVerificationSessionPayloadResponse({
    state: {
      flowMode: 'numeric-choice',
      sessionExpiresAt: 'expires-at',
      choice: { question: 'pick', options: [1, 2, 3, 4, 5], attempts: 1 },
    },
    publicBaseUrl: 'https://worker.example.com',
  }, createHandlers());
  assert.deepEqual(result, {
    status: 'in_progress',
    flowMode: 'numeric-choice',
    stage: 'choice',
    sessionExpiresAt: 'expires-at',
    stageMaxAttempts: 3,
    choiceAttemptsLeft: 2,
    choice: {
      question: 'pick',
      image: 'https://worker.example.com/choice/pick',
      options: ['1', '2', '3', '4'],
      attemptsUsed: 1,
    },
  });
});

test('verification payload builds rotation slider proof and image fields', async () => {
  const result = await buildVerificationSessionPayloadResponse({
    state: {
      stage: 'slider',
      slider: {
        type: 'rotation',
        size: 260,
        maxAngle: 360,
        seed: 'seed',
        submitNonce: 'nonce',
        attempts: 1,
      },
      grid: { attempts: 2 },
    },
  }, createHandlers());
  assert.equal(result.stage, 'slider');
  assert.equal(result.sliderAttemptsLeft, 2);
  assert.equal(result.gridAttemptsLeft, 1);
  assert.deepEqual(result.slider, {
    type: 'rotation',
    size: 260,
    maxAngle: 360,
    image: 'rotation:seed',
    nonce: 'nonce',
    signature: 'signature',
    attemptsUsed: 1,
  });
});

test('verification payload preserves legacy puzzle slider fields', async () => {
  const result = await buildVerificationSessionPayloadResponse({
    state: {
      stage: 'slider',
      slider: {
        type: 'puzzle',
        width: 300,
        height: 160,
        piece: 40,
        targetY: 50,
        maxX: 220,
        seed: 'seed',
        submitNonce: 'nonce',
      },
    },
  }, createHandlers());
  assert.deepEqual(result.slider, {
    type: 'puzzle',
    width: 300,
    height: 160,
    piece: 40,
    targetY: 50,
    maxX: 220,
    background: 'puzzle:seed',
    nonce: 'nonce',
    signature: 'signature',
    attemptsUsed: 0,
  });
});

test('verification payload sanitizes grid prompts and cell metadata', async () => {
  const cells = Array.from({ length: 10 }, (_, index) => ({
    index: 99,
    symbol: index,
    token: index === 0 ? null : `token-${index}`,
  }));
  const result = await buildVerificationSessionPayloadResponse({
    state: {
      stage: 'grid',
      slider: { attempts: 1 },
      grid: { targetSymbols: ['A', 'B', 'C'], cells, attempts: 2 },
    },
  }, createHandlers());
  assert.equal(result.stage, 'grid');
  assert.deepEqual(result.grid.promptSymbols, ['A', 'B']);
  assert.equal(result.grid.requiredCount, 2);
  assert.equal(result.grid.attemptsUsed, 2);
  assert.equal(result.grid.cells.length, 9);
  assert.deepEqual(result.grid.cells[0], { index: 0, symbol: '', token: '' });
  assert.deepEqual(result.grid.cells[8], { index: 8, symbol: '8', token: 'token-8' });
});
