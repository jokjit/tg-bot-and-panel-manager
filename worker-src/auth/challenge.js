import { createChallengeToken } from './crypto.js';
import { randomInt, shuffleArray } from './random.js';

function mutateCode(code, pool) {
  const chars = String(code).split('');
  const index = randomInt(0, chars.length - 1);
  let next = chars[index];
  while (next === chars[index]) next = pool[randomInt(0, pool.length - 1)];
  chars[index] = next;
  return chars.join('');
}

function generateCode(length, pool) {
  let code = '';
  for (let i = 0; i < length; i += 1) code += pool[randomInt(0, pool.length - 1)];
  return code;
}

export function generateCaptchaChallenge() {
  const pool = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const correct = generateCode(4, pool);
  const options = new Set([correct]);
  while (options.size < 4) options.add(mutateCode(correct, pool));
  return {
    mode: 'captcha',
    token: createChallengeToken(),
    question: '请选择图片中正确的验证码',
    imageText: correct,
    correct,
    options: shuffleArray(Array.from(options)).slice(0, 4),
    createdAt: new Date().toISOString(),
  };
}

function createMathOperands(operator) {
  if (operator === '+') {
    const left = randomInt(0, 10);
    return [left, randomInt(0, 10 - left)];
  }
  if (operator === '-') {
    const left = randomInt(0, 10);
    return [left, randomInt(0, left)];
  }
  const factors = [];
  for (let left = 0; left <= 10; left += 1) {
    for (let right = 0; right <= 10; right += 1) {
      if (left * right <= 10) factors.push([left, right]);
    }
  }
  return factors[randomInt(0, factors.length - 1)];
}

export function generateMathChallenge() {
  const displayOperator = ['+', '-', '?'][randomInt(0, 2)];
  const operator = displayOperator === '?' ? '*' : displayOperator;
  const [left, right] = createMathOperands(operator);
  const correct = operator === '+' ? left + right : operator === '-' ? left - right : left * right;
  const options = new Set([correct]);
  while (options.size < 4) {
    const delta = randomInt(-3, 3);
    options.add(Math.max(0, correct + (delta === 0 ? 1 : delta)));
  }
  return {
    mode: 'math',
    token: createChallengeToken(),
    question: `${left} ${displayOperator} ${right} = ?（答案范围 0~10）`,
    imageText: `${left} ${displayOperator} ${right} = ?`,
    correct,
    options: shuffleArray(Array.from(options)).slice(0, 4),
    createdAt: new Date().toISOString(),
  };
}

export function generateNumericChoiceChallenge() {
  const pool = '0123456789';
  const correct = generateCode(4, pool);
  const options = new Set([correct]);
  while (options.size < 4) options.add(mutateCode(correct, pool));
  return {
    mode: 'numeric',
    token: createChallengeToken(),
    question: '请选择图片中的数字验证码',
    imageText: correct,
    correct,
    options: shuffleArray(Array.from(options)).slice(0, 4),
    attempts: 0,
    createdAt: new Date().toISOString(),
  };
}
