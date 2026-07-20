export function randomInt(min, max) {
  const low = Math.ceil(min);
  const high = Math.floor(max);
  const range = high - low + 1;
  if (range <= 0) return low;
  const maxUint = 0xffffffff;
  const limit = maxUint - (maxUint % range);
  const value = new Uint32Array(1);
  do {
    crypto.getRandomValues(value);
  } while (value[0] >= limit);
  return low + (value[0] % range);
}

export function shuffleArray(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
