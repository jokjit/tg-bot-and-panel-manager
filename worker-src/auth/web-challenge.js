import { createChallengeToken } from './crypto.js';
import { randomInt, shuffleArray } from './random.js';
import { normalizeRotationAngle } from './verification.js';

const GRID_SYMBOL_POOL = ['🍎', '🚗', '🌲', '🏀', '🎧', '📷', '⏰', '🎲', '🎯', '🛳', '🎸', '🧩', '🏷', '🎁', '🛰'];

export function createSliderChallengeForWebVerification() {
  const startAngle = randomInt(35, 325);
  return {
    type: 'rotation',
    size: 240,
    maxAngle: 360,
    startAngle,
    targetAngle: normalizeRotationAngle(360 - startAngle),
    seed: createChallengeToken(),
    submitNonce: createChallengeToken(),
    submitNonceIssuedAt: new Date().toISOString(),
    attempts: 0,
    createdAt: new Date().toISOString(),
  };
}

export function createGridChallengeForWebVerification() {
  const symbols = shuffleArray(GRID_SYMBOL_POOL).slice(0, 9);
  const targetIndices = shuffleArray([0, 1, 2, 3, 4, 5, 6, 7, 8])
    .slice(0, 2)
    .sort((left, right) => left - right);
  const targetSymbols = targetIndices.map((index) => symbols[index]);
  const cells = symbols.map((symbol, index) => ({
    index,
    symbol,
    token: createChallengeToken().slice(-8),
  }));
  return {
    attempts: 0,
    targetIndices,
    targetSymbols,
    cells,
    createdAt: new Date().toISOString(),
  };
}
