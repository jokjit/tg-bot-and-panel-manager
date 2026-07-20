import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDisplayName,
  buildFallbackText,
  buildTopicName,
  formatMessagePreview,
  formatUserProfile,
  trimText,
} from '../worker-src/telegram/format.js';

test('Telegram formatters build stable user labels and topic names', () => {
  assert.equal(
    formatUserProfile({ first_name: 'Ada', last_name: 'Lovelace', username: 'ada' }, { id: 42 }),
    '用户：Ada Lovelace | @ada | ID:42',
  );
  assert.equal(buildTopicName({ username: 'ada' }, { id: 42 }), 'ada (42)');
  assert.equal(buildDisplayName({ firstName: 'Ada', lastName: 'Lovelace' }), 'Ada Lovelace');
  assert.equal(buildDisplayName({ username: '@ada' }), '@ada');
  assert.equal(buildDisplayName({ userId: 42 }), '用户 42');
});

test('Telegram message previews cover text, media, and fallback types', () => {
  assert.equal(trimText('abcdef', 3), 'abc...');
  assert.equal(formatMessagePreview({ text: 'hello' }), 'hello');
  assert.equal(formatMessagePreview({ caption: 'photo caption' }), '[媒体消息]\nphoto caption');
  assert.equal(formatMessagePreview({ document: { file_name: 'report.pdf' } }), '[文件消息] report.pdf');
  assert.equal(formatMessagePreview({ location: { latitude: 1.25, longitude: 2.5 } }), '[位置消息] 1.25, 2.5');
  assert.equal(formatMessagePreview({}), '[无法预览的消息类型]');
});

test('Telegram fallback text includes UID, profile, and preview', () => {
  const text = buildFallbackText(
    { chat: { id: 42 }, text: 'hello' },
    { first_name: 'Ada', username: 'ada' },
  );
  assert.match(text, /#UID:42/);
  assert.match(text, /用户：Ada \| @ada \| ID:42/);
  assert.match(text, /hello$/);
});
