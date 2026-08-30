import { getKeywordFilters } from './moderation.js';

const DEFAULT_BLOCKED_TEXT = '你已被管理员限制联系，如有需要请稍后再试。';

function isEnabled(value, defaultValue = true) {
  const raw = String(value ?? (defaultValue ? 'true' : 'false')).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(raw);
}

function enabledText(value, defaultValue = true) {
  return isEnabled(value, defaultValue) ? '已开启' : '已关闭';
}

function parseIntegerInRange(value, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function verificationModeText(config = {}) {
  const captchaEnabled = isEnabled(config.VERIFY_CAPTCHA_ENABLED, true);
  const mathEnabled = isEnabled(config.VERIFY_MATH_ENABLED, true);
  return mathEnabled && !captchaEnabled ? '数字选择验证' : '图形行为验证';
}

function millisecondsToUnit(value, divisor, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed / divisor) : fallback;
}

function normalizeMetaMode(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (['always', 'all', 'every'].includes(raw)) return 'always';
  if (['off', 'none', 'never'].includes(raw)) return 'off';
  return 'new-topic';
}

function metaModeText(value) {
  const mode = normalizeMetaMode(value);
  if (mode === 'always') return '每条消息发送';
  if (mode === 'off') return '不发送';
  return '仅新话题发送';
}

function normalizeKeywordList(value) {
  return Array.from(new Set(
    String(value || '')
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean),
  )).slice(0, 100);
}

export function buildAdminConfigSummary(config = {}, options = {}) {
  const keywords = getKeywordFilters(config);
  const blockedText = String(config.BLOCKED_TEXT || options.defaultBlockedText || DEFAULT_BLOCKED_TEXT).trim();
  return [
    '⚙️ 当前运行规则',
    '',
    `首次验证：${enabledText(config.USER_VERIFICATION, true)}`,
    `验证方式：${verificationModeText(config)}`,
    `验证有效期：${millisecondsToUnit(config.VERIFY_EXPIRE_MS, 60000, 15)} 分钟`,
    `失败冷却：${millisecondsToUnit(config.VERIFY_FAIL_BLOCK_MS, 1000, 60)} 秒`,
    `超时冷却：${millisecondsToUnit(config.VERIFY_TIMEOUT_BLOCK_MS, 1000, 60)} 秒`,
    `最大失败次数：${Number(config.VERIFY_MAX_FAILURES) || 2}`,
    `验证后观察消息数：${Number.isFinite(Number(config.VERIFY_OBSERVE_MESSAGE_COUNT)) ? Number(config.VERIFY_OBSERVE_MESSAGE_COUNT) : 5}`,
    `关键词规则：${keywords.length} 条`,
    `封禁提示：${blockedText || DEFAULT_BLOCKED_TEXT}`,
    `话题模式：${enabledText(config.TOPIC_MODE, true)}`,
    `管理员资料提示：${metaModeText(config.ADMIN_META_MODE)}`,
    `自动清理：${enabledText(config.DATA_CLEANUP_AUTO, true)}`,
    `自动巡检注销账户：${enabledText(config.DELETED_ACCOUNT_SWEEP_AUTO, true)}`,
  ].join('\n');
}

async function updateConfig(handlers, payload, successText) {
  await handlers.updateConfig(payload);
  await handlers.sendNotice(successText);
  return true;
}

function parseToggle(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (['on', 'true', '1', 'enable', 'enabled'].includes(raw)) return 'true';
  if (['off', 'false', '0', 'disable', 'disabled'].includes(raw)) return 'false';
  return null;
}

export async function handleAdminConfigCommand(context = {}, handlers = {}) {
  const trimmed = String(context.trimmed || '').trim();

  if (/^\/(?:config|rules|settings)\s*$/i.test(trimmed)) {
    const config = await handlers.getConfig();
    await handlers.sendNotice(buildAdminConfigSummary(config, {
      defaultBlockedText: handlers.defaultBlockedText,
    }));
    return true;
  }

  const verificationToggle = trimmed.match(/^\/verification\s+(on|off|true|false|1|0|enable|disable)\s*$/i);
  if (verificationToggle) {
    const value = parseToggle(verificationToggle[1]);
    return updateConfig(handlers, { USER_VERIFICATION: value }, `首次验证已${value === 'true' ? '开启' : '关闭'}。`);
  }

  const flowMatch = trimmed.match(/^\/verifyflow\s+(captcha|graphic|math|numeric)\s*$/i);
  if (flowMatch) {
    const graphic = ['captcha', 'graphic'].includes(flowMatch[1].toLowerCase());
    return updateConfig(handlers, {
      VERIFY_CAPTCHA_ENABLED: graphic ? 'true' : 'false',
      VERIFY_MATH_ENABLED: graphic ? 'false' : 'true',
    }, `验证方式已切换为：${graphic ? '图形行为验证' : '数字选择验证'}。`);
  }

  const numericRules = [
    [/^\/verifyexpire\s+(\d+)\s*$/i, 'VERIFY_EXPIRE_MS', 1, 120, 60000, '验证有效期', '分钟'],
    [/^\/verifyfailblock\s+(\d+)\s*$/i, 'VERIFY_FAIL_BLOCK_MS', 10, 3600, 1000, '失败冷却', '秒'],
    [/^\/verifytimeoutblock\s+(\d+)\s*$/i, 'VERIFY_TIMEOUT_BLOCK_MS', 10, 3600, 1000, '超时冷却', '秒'],
    [/^\/verifymaxfailures\s+(\d+)\s*$/i, 'VERIFY_MAX_FAILURES', 1, 10, 1, '最大失败次数', '次'],
    [/^\/verifyobserve\s+(\d+)\s*$/i, 'VERIFY_OBSERVE_MESSAGE_COUNT', 0, 20, 1, '验证后观察消息数', '条'],
    [/^\/cleanupbatch\s+(\d+)\s*$/i, 'DATA_CLEANUP_BATCH_SIZE', 20, 1000, 1, '自动清理批量', '条'],
    [/^\/sweepbatch\s+(\d+)\s*$/i, 'DELETED_ACCOUNT_SWEEP_BATCH_SIZE', 20, 1000, 1, '注销巡检批量', '条'],
  ];
  for (const [pattern, key, min, max, multiplier, label, unit] of numericRules) {
    const match = trimmed.match(pattern);
    if (!match) continue;
    const value = parseIntegerInRange(match[1], min, max);
    if (value === null) {
      await handlers.sendNotice(`${label}请输入 ${min}-${max} 的整数。`);
      return true;
    }
    return updateConfig(handlers, { [key]: String(value * multiplier) }, `${label}已更新为 ${value} ${unit}。`);
  }

  if (/^\/keywords\s*$/i.test(trimmed)) {
    const config = await handlers.getConfig();
    const keywords = getKeywordFilters(config);
    await handlers.sendNotice(keywords.length
      ? ['🚧 关键词屏蔽规则', '', ...keywords.slice(0, 100).map((item, index) => `${index + 1}. ${item}`)].join('\n')
      : '当前没有关键词屏蔽规则。');
    return true;
  }

  const setKeywordsMatch = trimmed.match(/^\/setkeywords\s+([\s\S]+)$/i);
  if (setKeywordsMatch) {
    const keywords = normalizeKeywordList(setKeywordsMatch[1]);
    if (keywords.length === 0) {
      await handlers.sendNotice('至少需要输入一个有效关键词。');
      return true;
    }
    return updateConfig(handlers, { KEYWORD_FILTERS: keywords.join('\n') }, `关键词屏蔽规则已保存，共 ${keywords.length} 条。`);
  }

  if (/^\/clearkeywords\s*$/i.test(trimmed)) {
    return updateConfig(handlers, { KEYWORD_FILTERS: '' }, '关键词屏蔽规则已清空。');
  }

  if (/^\/blockedtext\s*$/i.test(trimmed)) {
    const config = await handlers.getConfig();
    await handlers.sendNotice(`当前封禁提示：\n${String(config.BLOCKED_TEXT || handlers.defaultBlockedText || DEFAULT_BLOCKED_TEXT).trim()}`);
    return true;
  }

  const blockedTextMatch = trimmed.match(/^\/setblockedtext\s+([\s\S]+)$/i);
  if (blockedTextMatch) {
    const text = blockedTextMatch[1].trim().slice(0, 1000);
    return updateConfig(handlers, { BLOCKED_TEXT: text }, '封禁提示已更新。');
  }

  if (/^\/resetblockedtext\s*$/i.test(trimmed)) {
    return updateConfig(handlers, { BLOCKED_TEXT: '' }, '封禁提示已恢复为默认内容。');
  }

  const topicMatch = trimmed.match(/^\/topicmode\s+(on|off|true|false|1|0|enable|disable)\s*$/i);
  if (topicMatch) {
    const value = parseToggle(topicMatch[1]);
    return updateConfig(handlers, { TOPIC_MODE: value }, `话题模式已${value === 'true' ? '开启' : '关闭'}。`);
  }

  const metaMatch = trimmed.match(/^\/metamode\s+(new-topic|always|off)\s*$/i);
  if (metaMatch) {
    const value = normalizeMetaMode(metaMatch[1]);
    return updateConfig(handlers, { ADMIN_META_MODE: value }, `管理员资料提示已设置为：${metaModeText(value)}。`);
  }

  const autoRules = [
    [/^\/cleanupauto\s+(on|off|true|false|1|0|enable|disable)\s*$/i, 'DATA_CLEANUP_AUTO', '自动清理'],
    [/^\/sweepauto\s+(on|off|true|false|1|0|enable|disable)\s*$/i, 'DELETED_ACCOUNT_SWEEP_AUTO', '注销账户自动巡检'],
  ];
  for (const [pattern, key, label] of autoRules) {
    const match = trimmed.match(pattern);
    if (!match) continue;
    const value = parseToggle(match[1]);
    return updateConfig(handlers, { [key]: value }, `${label}已${value === 'true' ? '开启' : '关闭'}。`);
  }

  return false;
}
