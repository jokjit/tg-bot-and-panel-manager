import { clamp } from '../config/values.js';
import { createChallengeToken } from './crypto.js';
import {
  createSeededRandom,
  drawCircleOutline,
  drawFilledCircle,
  encodePngRgb,
  setPixel,
} from './image-codec.js';
import { normalizeRotationAngle } from './verification.js';

export function rotatePoint(x, y, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos,
  };
}

export function mixColor(left, right, amount) {
  const ratio = clamp(Number(amount), 0, 1);
  return [
    Math.round(left[0] * (1 - ratio) + right[0] * ratio),
    Math.round(left[1] * (1 - ratio) + right[1] * ratio),
    Math.round(left[2] * (1 - ratio) + right[2] * ratio),
  ];
}

export function hslToRgb(hue, saturation, lightness) {
  const h = ((((Number(hue) || 0) % 360) + 360) % 360) / 360;
  const s = clamp(Number(saturation), 0, 1);
  const l = clamp(Number(lightness), 0, 1);
  if (s === 0) {
    const value = Math.round(l * 255);
    return [value, value, value];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channels = [h + 1 / 3, h, h - 1 / 3].map((channel) => {
    let value = channel;
    if (value < 0) value += 1;
    if (value > 1) value -= 1;
    if (value < 1 / 6) return p + (q - p) * 6 * value;
    if (value < 1 / 2) return q;
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
    return p;
  });
  return channels.map((value) => Math.round(value * 255));
}

export function distanceToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const lenSq = vx * vx + vy * vy;
  const ratio = lenSq > 0 ? clamp((wx * vx + wy * vy) / lenSq, 0, 1) : 0;
  const x = ax + vx * ratio;
  const y = ay + vy * ratio;
  const dx = px - x;
  const dy = py - y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function distanceToArrow(x, y, radius) {
  const shaft = distanceToSegment(x, y, 0, -radius + 68, 0, radius - 40);
  const leftHead = distanceToSegment(x, y, 0, -radius + 30, -18, -radius + 74);
  const rightHead = distanceToSegment(x, y, 0, -radius + 30, 18, -radius + 74);
  return Math.min(shaft, leftHead, rightHead);
}

export function nearestCompassMark(x, y, radius) {
  const distance = Math.sqrt(x * x + y * y);
  if (distance < radius - 22 || distance > radius - 6) return Infinity;
  const angle = Math.atan2(y, x);
  const step = (Math.PI * 2) / 24;
  const nearest = Math.round(angle / step) * step;
  const angular = Math.abs(Math.atan2(Math.sin(angle - nearest), Math.cos(angle - nearest)));
  return angular * distance;
}

export function buildRotationCaptchaDataUrl(slider, handlers = {}) {
  const png = renderRotationCaptchaPng(slider, handlers);
  return `data:image/png;base64,${base64EncodeBytes(png)}`;
}

export function renderRotationCaptchaPng(slider, handlers = {}) {
  const size = clamp(Math.round(Number(slider?.size || 240)), 160, 360);
  const center = size / 2;
  const radius = Math.round(size * 0.42);
  const seed = String(slider?.seed || createChallengeToken());
  const random = createSeededRandom(seed);
  const startAngle = normalizeRotationAngle(slider?.startAngle || 0);
  const pixels = new Uint8Array(size * size * 3);
  const baseHue = 175 + Math.floor(random() * 100);
  const accentHue = 18 + Math.floor(random() * 60);
  const rotation = (startAngle * Math.PI) / 180;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - center;
      const dy = y - center;
      const distance = Math.sqrt(dx * dx + dy * dy);
      let color = [232, 243, 251];

      if (distance <= radius) {
        const local = rotatePoint(dx, dy, -rotation);
        const radial = Math.min(1, distance / radius);
        const sweep = (Math.atan2(local.y, local.x) + Math.PI) / (Math.PI * 2);
        const warm = hslToRgb(accentHue, 0.86, 0.72);
        const cool = hslToRgb(baseHue + sweep * 28, 0.78, 0.68 + (1 - radial) * 0.16);
        color = mixColor(cool, warm, Math.max(0, radial - 0.45) * 0.9);

        const wave1 = Math.abs(local.y - Math.sin(local.x / 28) * 20 - 24);
        if (wave1 < 10) color = mixColor(color, [255, 255, 255], 0.32 * (1 - wave1 / 10));

        const wave2 = Math.abs(local.y + Math.cos(local.x / 34) * 17 + 24);
        if (wave2 < 8) color = mixColor(color, [24, 76, 101], 0.15 * (1 - wave2 / 8));

        const arrowDistance = distanceToArrow(local.x, local.y, radius);
        if (arrowDistance < 5.2) color = mixColor([20, 50, 75], [255, 255, 255], arrowDistance / 8.5);

        const centerDot = Math.sqrt(local.x * local.x + local.y * local.y);
        if (centerDot < 16) color = mixColor(color, [255, 255, 255], 0.76 * (1 - centerDot / 16));

        const mark = nearestCompassMark(local.x, local.y, radius);
        if (mark < 3.2) color = mixColor(color, [24, 54, 82], 0.5 * (1 - mark / 3.2));

        const grain = random() * 10 - 5;
        color = color.map((value) => clamp(Math.round(value + grain), 0, 255));
      } else if (distance <= radius + 3) {
        color = [64, 96, 120];
      }

      setPixel(pixels, size, size, x, y, color);
    }
  }

  for (let index = 0; index < 34; index += 1) {
    const angle = random() * Math.PI * 2;
    const distance = random() * radius * 0.78;
    const local = { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
    const rotated = rotatePoint(local.x, local.y, rotation);
    drawFilledCircle(
      pixels,
      size,
      size,
      Math.round(center + rotated.x),
      Math.round(center + rotated.y),
      1 + Math.floor(random() * 3),
      [238 + Math.floor(random() * 17), 244 + Math.floor(random() * 10), 255],
      0.34,
    );
  }

  const north = rotatePoint(0, -radius + 25, rotation);
  handlers.drawChar?.(
    pixels,
    size,
    size,
    'N',
    Math.round(center + north.x - 10),
    Math.round(center + north.y - 13),
    4,
    [24, 54, 82],
  );
  drawCircleOutline(pixels, size, size, Math.round(center), Math.round(center), radius, [48, 84, 112]);
  return encodePngRgb(size, size, pixels);
}

export function buildSliderBackgroundDataUrl(slider) {
  const width = Number(slider?.width || 320);
  const height = Number(slider?.height || 180);
  const piece = Number(slider?.piece || 46);
  const targetX = Number(slider?.targetX || 120);
  const targetY = Number(slider?.targetY || 64);
  const random = createSeededRandom(String(slider?.seed || createChallengeToken()));
  const shapes = [];

  for (let index = 0; index < 24; index += 1) {
    const cx = Math.floor(random() * width);
    const cy = Math.floor(random() * height);
    const radius = 6 + Math.floor(random() * 18);
    const hue = 180 + Math.floor(random() * 120);
    const alpha = (0.14 + random() * 0.18).toFixed(3);
    shapes.push(`<circle cx="${cx}" cy="${cy}" r="${radius}" fill="hsla(${hue},78%,70%,${alpha})" />`);
  }

  for (let index = 0; index < 12; index += 1) {
    const x = Math.floor(random() * (width - 64));
    const y = Math.floor(random() * (height - 20));
    const shapeWidth = 24 + Math.floor(random() * 66);
    const shapeHeight = 8 + Math.floor(random() * 22);
    const alpha = (0.08 + random() * 0.15).toFixed(3);
    shapes.push(`<rect x="${x}" y="${y}" width="${shapeWidth}" height="${shapeHeight}" rx="8" fill="rgba(255,255,255,${alpha})" />`);
  }

  const path = [
    `M ${targetX} ${targetY + piece * 0.2}`,
    `Q ${targetX + piece * 0.1} ${targetY} ${targetX + piece * 0.25} ${targetY + piece * 0.12}`,
    `Q ${targetX + piece * 0.5} ${targetY - piece * 0.18} ${targetX + piece * 0.74} ${targetY + piece * 0.12}`,
    `Q ${targetX + piece * 0.9} ${targetY} ${targetX + piece} ${targetY + piece * 0.2}`,
    `L ${targetX + piece} ${targetY + piece * 0.82}`,
    `Q ${targetX + piece * 0.86} ${targetY + piece} ${targetX + piece * 0.68} ${targetY + piece * 0.92}`,
    `Q ${targetX + piece * 0.5} ${targetY + piece * 1.1} ${targetX + piece * 0.32} ${targetY + piece * 0.92}`,
    `Q ${targetX + piece * 0.14} ${targetY + piece} ${targetX} ${targetY + piece * 0.82}`,
    'Z',
  ].join(' ');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#e3f4ff" />
        <stop offset="50%" stop-color="#d5ffe8" />
        <stop offset="100%" stop-color="#ffecc7" />
      </linearGradient>
      <filter id="softNoise" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${Math.floor(random() * 1000)}" />
        <feColorMatrix type="saturate" values="0.05"/>
        <feComponentTransfer>
          <feFuncA type="table" tableValues="0 0.07"/>
        </feComponentTransfer>
      </filter>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#bg)" />
    ${shapes.join('')}
    <rect width="${width}" height="${height}" filter="url(#softNoise)" />
    <path d="${path}" fill="rgba(255,255,255,0.16)" stroke="rgba(25,35,50,0.65)" stroke-width="2" stroke-dasharray="3 2"/>
  </svg>`;

  return `data:image/svg+xml;base64,${base64Encode(svg)}`;
}

export function base64Encode(input) {
  const text = String(input || '');
  return base64EncodeBytes(new TextEncoder().encode(text));
}

export function base64EncodeBytes(bytes) {
  let binary = '';
  for (const byte of bytes || []) binary += String.fromCharCode(byte);
  return btoa(binary);
}
