import { collectKvKeys } from './worker-src/storage/kv.js';
import { pruneTimedCache, readTimedCacheValue, writeTimedCacheValue } from './worker-src/storage/cache.js';
import {
  areJsonStorageValuesEqual,
  getJsonChangedKeys,
  serializeJsonForStorage,
  shouldThrottleUserProfileWrite,
} from './worker-src/storage/json.js';
import {
  isSameD1VerificationMeaning,
  normalizeD1VerificationStatusRecord,
} from './worker-src/storage/d1.js';
import { createVerificationD1Repository } from './worker-src/storage/verification.js';
import {
  getVerificationPassedAtFromD1,
  writeVerificationStatusCleared,
  writeVerificationStatusPassed,
} from './worker-src/storage/verification-status.js';
import {
  clearLatestVerificationSessionState,
  getLatestVerificationSession,
  persistLatestVerificationSessionState,
  readVerificationSessionFromD1,
  writeVerificationSessionToD1,
} from './worker-src/storage/verification-session.js';
import { createVerificationCache } from './worker-src/auth/verification-cache.js';
import { normalizeIsoTime, parseIsoTimeMs } from './worker-src/utils/time.js';
import {
  buildStructuredLogRecord,
  getRequestId,
  getTelegramUpdateContext,
  writeStructuredLog,
} from './worker-src/observability/logging.js';
import {
  buildDeploymentHealthRecord,
  buildWebhookErrorStats,
} from './worker-src/observability/health.js';
import {
  buildD1ModerationIndexRecord,
  buildD1UserDirectoryRecord,
  deleteD1DirectoryEntries,
  ensureDirectoryD1Schema,
  writeD1ModerationIndex,
  writeD1UserDirectory,
} from './worker-src/storage/directory.js';
import {
  DIRECTORY_INDEX_BACKFILL_KEY,
  runDirectoryIndexBackfill,
} from './worker-src/maintenance/directory-backfill.js';
import {
  DATA_CLEANUP_CHECK_MIN_INTERVAL_MS,
  DATA_CLEANUP_MAX_BATCH,
  DATA_CLEANUP_MIN_BATCH,
  DATA_RETENTION_MAX_DAYS,
  DATA_RETENTION_MIN_DAYS,
  DELETED_ACCOUNT_SWEEP_CHECK_MIN_INTERVAL_MS,
  DELETED_ACCOUNT_SWEEP_MAX_BATCH,
  DELETED_ACCOUNT_SWEEP_MIN_BATCH,
  getDataCleanupBatchSize,
  getDataRetentionDays,
  getDeletedAccountSweepBatchSize,
  parsePositiveInt,
} from './worker-src/maintenance/config.js';
import {
  createIntervalGate,
  runMaintenanceIfDue,
  runScheduledMaintenance as runScheduledMaintenanceCore,
} from './worker-src/maintenance/schedule.js';
import { probeDeletedTelegramUser } from './worker-src/maintenance/deleted-account.js';
import { executeDataCleanup } from './worker-src/maintenance/data-cleanup.js';
import { executeDeletedAccountSweep } from './worker-src/maintenance/deleted-account-sweep.js';
import { purgeDeletedUserRecords } from './worker-src/maintenance/purge.js';
import { dispatchAdminRoutes } from './worker-src/routes/admin.js';
import { handleAdminUserRoute } from './worker-src/routes/admin-users.js';
import {
  handleAdminBlacklistRoute,
  handleAdminTrustRoute,
} from './worker-src/routes/admin-moderation.js';
import { handleAuthorizedAdminRoute } from './worker-src/routes/admin-access.js';
import { handleAdminReplyRoute } from './worker-src/routes/admin-reply.js';
import { handleAdminSystemRoute } from './worker-src/routes/admin-system.js';
import { handleAdminImageRoute } from './worker-src/routes/admin-images.js';
import { handlePublicMediaRoute } from './worker-src/routes/media.js';
import { handleDeployBootstrapRequest } from './worker-src/routes/deploy-bootstrap.js';
import { handleWebhookRequest as handleWebhookRequestCore } from './worker-src/routes/webhook.js';
import { TOP_LEVEL_ROUTES, classifyTopLevelRoute } from './worker-src/routes/top-level.js';
import {
  classifyVerificationApiRoute,
  dispatchVerificationApiRoute,
} from './worker-src/routes/verification.js';
import { buildDeployBootstrapConsumptionKey } from './worker-src/auth/bootstrap.js';
import {
  ensureAdminPasswordState as ensureAdminPasswordStateCore,
  resetAdminBootstrapPassword,
} from './worker-src/auth/password-state.js';
import {
  IMAGE_MAX_BYTES,
  buildImageAssetView,
  isSafeImageObjectKey,
  listImageAssetsPage,
  normalizeImagePublicBaseUrl,
  removeImageAsset,
  storeImageAsset,
} from './worker-src/storage/images.js';
import { normalizeRotationAngle, normalizeSliderTrace } from './worker-src/auth/verification.js';
import {
  buildEffectiveSystemConfig,
  mergeRuntimeEnv,
} from './worker-src/config/runtime.js';
import {
  buildSliderSubmitProof,
  validateSliderSubmitProof,
} from './worker-src/auth/slider-proof.js';
import { validateSliderAttemptHuman } from './worker-src/auth/slider-human.js';
import {
  buildRotationCaptchaDataUrl,
  buildSliderBackgroundDataUrl,
} from './worker-src/auth/web-image.js';
import {
  createGridChallengeForWebVerification,
  createSliderChallengeForWebVerification,
} from './worker-src/auth/web-challenge.js';
import { createOrRefreshVerificationWebSessionState } from './worker-src/auth/web-session.js';
import {
  repairVerificationStateFromProfileState,
  resetVerificationStateAfterProfileRevocationState,
} from './worker-src/auth/profile-state.js';
import {
  clearProfileVerificationPassedState,
  markProfileVerificationPassedState,
} from './worker-src/auth/profile-status.js';
import {
  applyResolvedVerificationStatusToProfileState,
  isVerificationStateActiveState,
  isVerificationStateInvalidatedByD1State,
  resolveVerificationPassedAtState,
} from './worker-src/auth/verification-resolution.js';
import {
  extractMessageText,
  extractPrimaryMediaFileId,
  extractTargetUserId,
  detectMessageType,
  isIgnoredAdminServiceMessage,
  isUserPrivateCommand,
  normalizeBotCommandText,
  parseReplyCommand,
} from './worker-src/telegram/message.js';
import { matchKeywordFilter } from './worker-src/telegram/moderation.js';
import {
  telegram,
  telegramMultipart,
  telegramWithThreadFallback,
} from './worker-src/telegram/api.js';
import { relayAdminMessageToUser, relayUserMessageToAdmins } from './worker-src/telegram/relay.js';
import { syncTelegramCommandMenu } from './worker-src/telegram/commands.js';
import { handleAdminModerationCommand } from './worker-src/telegram/admin-moderation-commands.js';
import { handleAdminMaintenanceCommand } from './worker-src/telegram/admin-maintenance-commands.js';
import { handleAdminAccessCommand } from './worker-src/telegram/admin-access-commands.js';
import { handleAdminUserCommand } from './worker-src/telegram/admin-user-commands.js';
import { handleAdminSystemCommand } from './worker-src/telegram/admin-system-commands.js';
import { handleAdminConfigCommand } from './worker-src/telegram/admin-config-commands.js';
import { handleAdminActionCallbackCommand } from './worker-src/telegram/admin-action-callback.js';
import {
  buildHierarchicalAdminCommandPanelKeyboard,
  buildAdminCommandPanelText,
  handleAdminCommandPanelCallback,
  isAdminCommandPanelCallback,
} from './worker-src/telegram/admin-command-panel.js';
import { handleAuthorizedAdminMessage } from './worker-src/telegram/admin-message.js';
import {
  ADMIN_IMAGE_UPLOAD_TTL_SECONDS,
  tryHandleAdminImageUploadMessage,
} from './worker-src/telegram/admin-image-upload.js';
import {
  ADMIN_PANEL_INPUT_TTL_SECONDS,
  beginAdminPanelInput,
  getAdminPanelInputScopeKey,
  tryHandleAdminPanelInputMessage,
} from './worker-src/telegram/admin-panel-input.js';
import { handleVerificationSessionApiRequest } from './worker-src/telegram/verification-session-api.js';
import { loadVerificationApiContext } from './worker-src/telegram/verification-api-context.js';
import { handleVerificationChoiceApiRequest } from './worker-src/telegram/verification-choice-api.js';
import { handleVerificationGridApiRequest } from './worker-src/telegram/verification-grid-api.js';
import { handleVerificationSliderApiRequest } from './worker-src/telegram/verification-slider-api.js';
import { buildVerificationSessionPayloadResponse } from './worker-src/telegram/verification-payload.js';
import {
  normalizeVerificationBaseUrl,
  sendVerificationWebPromptRequest,
} from './worker-src/telegram/verification-web-prompt.js';
import {
  clearVerificationPromptMessageRequest,
  deleteVerificationPromptMessageRequest,
  setVerificationPromptMessageIdState,
} from './worker-src/telegram/verification-prompt.js';
import {
  lockVerificationAndReportState,
  reportVerificationFailureToAdmin,
} from './worker-src/telegram/verification-lock.js';
import { approveUserVerificationState } from './worker-src/telegram/verification-approval.js';
import { restartUserVerificationState } from './worker-src/telegram/verification-restart.js';
import {
  buildDisplayName,
  buildFallbackText,
  buildTopicName,
  formatMessagePreview,
  formatUserProfile,
  trimText,
} from './worker-src/telegram/format.js';
import {
  createChallengeToken,
  createRandomToken,
  createSessionToken,
  sha256Hex,
  timingSafeEqualText,
} from './worker-src/auth/crypto.js';
import {
  hashPassword,
  passwordHashNeedsUpgrade,
  verifyPassword,
} from './worker-src/auth/password.js';
import {
  ADMIN_LOGIN_BLOCK_MS,
  isLoginRateBlocked,
  recordLoginFailure,
} from './worker-src/auth/login-rate-limit.js';
import {
  createSeededRandom,
  drawLine,
  encodePngRgb,
  setPixel,
} from './worker-src/auth/image-codec.js';
import {
  generateNumericChoiceChallenge as createNumericChoiceChallenge,
} from './worker-src/auth/challenge.js';
import {
  getProfileVerificationPassedAt,
  isProfileVerificationPassed,
  isVerificationPassedAtCleared as isPassedAtCleared,
  isVerificationSessionExpired,
  isVerificationSessionUsable,
  isVerificationStateInvalidatedByProfile,
  sanitizeVerificationSessionState,
} from './worker-src/auth/verification-status.js';
import {
  adminKey,
  blacklistKey,
  buildGroupAdminMemberCacheKey,
  buildMessageHistoryDedupeKey,
  topicThreadKey,
  topicUserKey,
  trustKey,
  userKey,
  verificationCacheKey,
  verifyKey,
} from './worker-src/storage/keys.js';
import {
  getAdminMetaMode,
  getRootAdminIds,
  isRootAdmin,
  shouldSendUserMetaMessage,
} from './worker-src/auth/admin.js';
import {
  isDataCleanupAutoEnabled,
  isDeletedAccountSweepAutoEnabled,
  isTopicModeEnabled,
  isUserVerificationEnabled,
} from './worker-src/config/features.js';
import {
  ADMIN_SESSION_TTL_SECONDS,
  buildExpiredSessionCookie,
  buildSessionCookie,
  parseCookies,
} from './worker-src/auth/session.js';
import {
  MAX_LIST_LIMIT,
  clamp,
  normalizeWebhookPath,
  parseIdList,
  parseLimit,
  parseOffset,
} from './worker-src/config/values.js';

const DEFAULT_WELCOME = [
  '你好，欢迎使用私聊中转机器人。',
  '直接给我发送消息，我会转发给管理员；管理员回复后，我会继续把消息转发给你。',
].join('\n');

const DEFAULT_BLOCKED_TEXT = '你已被管理员限制联系，如有需要请稍后再试。';
const ADMIN_PANEL_PATH = '/admin';
const ADMIN_API_PREFIX = '/admin/api';
const MAX_SCAN_KEYS = 500;
const SYSTEM_CONFIG_KEY = 'sys:config';
const ADMIN_SESSION_PREFIX = 'admin:session:';
const ADMIN_LOGIN_RATE_PREFIX = 'admin:login-rate:';
const ADMIN_BOOTSTRAP_TTL_MS = 1 * 60 * 60 * 1000;
const PROFILE_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_ADMIN_PANEL_EXTERNAL_URL = '';
const LAST_WEBHOOK_ERROR_KEY = 'sys:last_webhook_error';
const WEBHOOK_ERROR_STATS_KEY = 'sys:webhook_error_stats';
const DEPLOYMENT_HEALTH_KEY = 'sys:deployment_health';
const VERIFY_IMAGE_PATH = '/verify-image';
const VERIFY_WEB_PATH = '/verify';
const VERIFY_API_PREFIX = '/verify/api';
const MEDIA_PREFIX = '/media/';
const VERIFY_WEB_SESSION_EXPIRE_MS = 15 * 60 * 1000;
const VERIFY_RETRY_BLOCK_MS = 60 * 60 * 1000;
const VERIFY_STAGE_MAX_ATTEMPTS = 3;
const VERIFY_MIN_SLIDER_TIME_MS = 250;
const VERIFY_SLIDER_TOLERANCE = 18;
const VERIFY_ROTATION_TOLERANCE = 12;
const VERIFY_OBSERVE_MESSAGE_COUNT = 5;
const DATA_CLEANUP_INTERVAL_MS = 12 * 60 * 60 * 1000;
const LAST_DATA_CLEANUP_KEY = 'sys:last_cleanup';
const LAST_DELETED_ACCOUNT_SWEEP_KEY = 'sys:last_deleted_account_sweep';
const DEFAULT_DELETED_ACCOUNT_SWEEP_INTERVAL_DAYS = 7;
const DELETED_ACCOUNT_SWEEP_INTERVAL_MS = DEFAULT_DELETED_ACCOUNT_SWEEP_INTERVAL_DAYS * 24 * 60 * 60 * 1000;
const WELCOME_TYPE_TEXT = 'text';
const WELCOME_TYPE_PHOTO = 'photo';
const WELCOME_TYPE_VIDEO = 'video';
const WELCOME_TYPE_ANIMATION = 'animation';
const WELCOME_TYPE_AUDIO = 'audio';
const WELCOME_TYPE_VOICE = 'voice';
const WELCOME_TYPE_STICKER = 'sticker';
const WELCOME_TYPE_DOCUMENT = 'document';
const BOT_DESCRIPTION_MAX_LENGTH = 512;
const BOT_SHORT_DESCRIPTION_MAX_LENGTH = 120;
const WELCOME_SETUP_PENDING_PREFIX = 'sys:welcome_setup:';
const WELCOME_SETUP_PENDING_TTL_SECONDS = 10 * 60;
const ADMIN_IMAGE_UPLOAD_PENDING_PREFIX = 'sys:admin_image_upload:';
const ADMIN_PANEL_INPUT_PENDING_PREFIX = 'sys:admin_panel_input:';
const SYSTEM_CONFIG_CACHE_TTL_MS = 5 * 1000;
const GROUP_ADMIN_MEMBER_CACHE_TTL_MS = 90 * 1000;
const GROUP_ADMIN_LIST_CACHE_TTL_MS = 60 * 1000;
const HOT_KV_JSON_CACHE_TTL_MS = 30 * 1000;
const USER_PROFILE_CACHE_TTL_MS = 60 * 1000;
const VERIFY_STATE_CACHE_TTL_MS = 15 * 1000;
const TOPIC_MAPPING_CACHE_TTL_MS = 5 * 60 * 1000;
const AUTHORIZED_ADMIN_CACHE_TTL_MS = 30 * 1000;
const USER_LIST_SNAPSHOT_CACHE_TTL_MS = 60 * 1000;
const D1_VERIFICATION_STATUS_CACHE_TTL_MS = 60 * 1000;
const MESSAGE_HISTORY_DEDUPE_TTL_MS = 10 * 60 * 1000;
const MESSAGE_HISTORY_CONVERSATION_CACHE_TTL_MS = 10 * 60 * 1000;
const VERIFICATION_PASS_CACHE_TTL_MS = 10 * 60 * 1000;
const VERIFICATION_D1_SCHEMA_RETRY_MS = 60 * 1000;
const VERIFICATION_SESSION_CACHE_TTL_MS = 20 * 60 * 1000;
const VERIFICATION_SESSION_D1_SCHEMA_RETRY_MS = 60 * 1000;
const KV_JSON_NULL = Symbol('kv-json-null');
const USER_LIST_SNAPSHOT_CACHE_KEY = 'all';

const groupAdminMembershipCache = new Map();
const groupAdminListCache = new Map();
const kvJsonCache = new Map();
const userListSnapshotCache = new Map();
const messageHistoryDedupeCache = new Map();
const messageHistoryConversationCache = new Map();
let systemConfigCache = { value: null, expiresAt: 0 };
const shouldScheduleAutoCleanupCheck = createIntervalGate(DATA_CLEANUP_CHECK_MIN_INTERVAL_MS);
const shouldScheduleDeletedAccountSweepCheck = createIntervalGate(DELETED_ACCOUNT_SWEEP_CHECK_MIN_INTERVAL_MS);
const verificationD1Repository = createVerificationD1Repository({
  retryMs: Math.max(VERIFICATION_D1_SCHEMA_RETRY_MS, VERIFICATION_SESSION_D1_SCHEMA_RETRY_MS),
});
const verificationCache = createVerificationCache({
  statusTtlMs: D1_VERIFICATION_STATUS_CACHE_TTL_MS,
  passedTtlMs: VERIFICATION_PASS_CACHE_TTL_MS,
  sessionTtlMs: VERIFICATION_SESSION_CACHE_TTL_MS,
});

export default {
  async fetch(request, env, ctx) {
    const startedAt = Date.now();
    const requestId = getRequestId(request);
    let runtimeEnv = env;
    try {
      const url = new URL(request.url);
      runtimeEnv = await getRuntimeEnv(env);
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: corsHeaders(request, runtimeEnv),
        });
      }

      const webhookPath = normalizeWebhookPath(runtimeEnv.WEBHOOK_PATH);
      const publicBaseUrl = getPublicBaseUrl(url, runtimeEnv);
      if (ctx?.waitUntil && isDataCleanupAutoEnabled(runtimeEnv) && shouldScheduleAutoCleanupCheck()) {
        ctx.waitUntil(runDataCleanupIfDue(runtimeEnv).catch(() => {}));
      }
      if (ctx?.waitUntil && isDeletedAccountSweepAutoEnabled(runtimeEnv) && shouldScheduleDeletedAccountSweepCheck()) {
        ctx.waitUntil(runDeletedAccountSweepIfDue(runtimeEnv).catch(() => {}));
      }

      const topLevelResponse = await handleTopLevelRequest(request, url, runtimeEnv, webhookPath, publicBaseUrl);
      if (topLevelResponse) return topLevelResponse;

      const adminResponse = await dispatchAdminRoutes(
        { request, url, env: runtimeEnv, webhookPath, publicBaseUrl },
        {
          auth: handleAdminAuthRequest,
          system: handleAdminSystemRequest,
          users: handleAdminUserRequest,
          reply: handleAdminReplyRequest,
          blacklist: handleAdminBlacklistRequest,
          trust: handleAdminTrustRequest,
          images: handleAdminImageRequest,
          authorizedAdmins: handleAuthorizedAdminRequest,
          webhookManagement: handleWebhookManagementRequest,
        },
      );
      if (adminResponse) return adminResponse;

      if (request.method === 'POST' && url.pathname === webhookPath) {
        return await handleWebhookRequest(request, runtimeEnv, publicBaseUrl, ctx);
      }

      return new Response('Not Found', { status: 404, headers: corsHeaders(request, runtimeEnv) });
    } catch (error) {
      const status = error instanceof AppError ? error.status : 500;
      writeStructuredLog('error', 'http_request_failed', {
        requestId,
        stage: 'fetch',
      }, {
        method: request.method,
        path: new URL(request.url).pathname,
        status,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      return json(
        {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        },
        status,
        {},
        request,
        runtimeEnv,
      );
    }
  },

  async scheduled(event, env, ctx) {
    const startedAt = Date.now();
    const requestId = `scheduled_${Number(event?.scheduledTime || startedAt)}`;
    const runtimeEnv = await getRuntimeEnv(env);
    const task = runScheduledMaintenance(runtimeEnv)
      .then((result) => {
        writeStructuredLog('info', 'scheduled_maintenance_completed', {
          requestId,
          stage: 'maintenance',
        }, {
          durationMs: Date.now() - startedAt,
          status: 'ok',
        });
        return result;
      })
      .catch((error) => {
        writeStructuredLog('error', 'scheduled_maintenance_failed', {
          requestId,
          stage: 'maintenance',
        }, {
          durationMs: Date.now() - startedAt,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      });
    if (ctx?.waitUntil) {
      ctx.waitUntil(task.catch(() => {}));
      return;
    }
    await task.catch(() => {});
  },
};

class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function handleTopLevelRequest(request, url, env, webhookPath, publicBaseUrl) {
  const route = classifyTopLevelRoute(request.method, url.pathname, {
    verifyImage: VERIFY_IMAGE_PATH,
    verifyWeb: VERIFY_WEB_PATH,
    verifyApiPrefix: VERIFY_API_PREFIX,
    mediaPrefix: MEDIA_PREFIX,
    adminPanel: ADMIN_PANEL_PATH,
  });

  switch (route) {
    case TOP_LEVEL_ROUTES.STATUS:
      return json(await getAdminStatus(url, env, webhookPath, publicBaseUrl), 200, {}, request, env);
    case TOP_LEVEL_ROUTES.HEALTH:
      return json({ ok: true, now: new Date().toISOString() }, 200, {}, request, env);
    case TOP_LEVEL_ROUTES.VERIFY_IMAGE:
      return serveVerificationImage(url, request);
    case TOP_LEVEL_ROUTES.VERIFY_WEB:
      return html(renderVerificationWebPage(), 200, request, {
        'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
        pragma: 'no-cache',
        expires: '0',
      });
    case TOP_LEVEL_ROUTES.VERIFY_API:
      return handleVerificationApiRequest(request, url, env, publicBaseUrl);
    case TOP_LEVEL_ROUTES.MEDIA:
      return handlePublicMediaRoute({ request, url }, {
        getMediaPrefix: () => MEDIA_PREFIX,
        ensureBucket: () => ensureEnv(env, ['IMAGE_BUCKET']),
        isSafeKey: isSafeImageObjectKey,
        getObject: (objectKey) => env.IMAGE_BUCKET.get(objectKey),
      });
    case TOP_LEVEL_ROUTES.DEPLOY_BOOTSTRAP:
      return handleDeployBootstrap(request, env, webhookPath, publicBaseUrl);
    case TOP_LEVEL_ROUTES.ADMIN_ENTRY: {
      const panelUrl = buildAdminPanelRedirectUrl(env, publicBaseUrl, request);
      if (isAbsoluteHttpUrl(panelUrl)) return Response.redirect(panelUrl, 302);
      return html(renderAdminPage(url, env, webhookPath, publicBaseUrl), 200, request);
    }
    default:
      return null;
  }
}

async function handleWebhookRequest(request, env, publicBaseUrl = '', ctx = null) {
  return handleWebhookRequestCore(
    { request, env, publicBaseUrl, ctx },
    {
      ensureEnv,
      getRequestId,
      getTelegramUpdateContext,
      handleUpdate,
      writeStructuredLog,
      runNonCriticalTask,
      recordWebhookError,
      notifyWebhookError,
      corsHeaders,
    },
  );
}

async function handleAdminAuthRequest(request, url, env) {
  if (request.method === 'GET' && url.pathname === `${ADMIN_API_PREFIX}/auth/me`) {
    return await handleAdminAuthMe(request, env);
  }

  if (request.method === 'POST' && url.pathname === '/admin/login') {
    return await handleAdminLogin(request, env);
  }

  if (request.method === 'POST' && url.pathname === '/admin/logout') {
    await requireHttpAdmin(request, env);
    return await handleAdminLogout(request, env);
  }

  if (request.method === 'POST' && url.pathname === `${ADMIN_API_PREFIX}/auth/change-password`) {
    await requireHttpAdmin(request, env);
    return await handleAdminChangePassword(request, env);
  }

  return null;
}

async function handleAdminSystemRequest(request, url, env, webhookPath, publicBaseUrl) {
  return handleAdminSystemRoute({ request, url, webhookPath, publicBaseUrl }, {
    getAdminApiPrefix: () => ADMIN_API_PREFIX,
    requireAdmin: (value) => requireHttpAdmin(value, env),
    getStatus: (value, hookPath, baseUrl) => getAdminStatus(value, env, hookPath, baseUrl),
    getEffectiveSystemConfig: () => getEffectiveSystemConfig(env),
    buildSystemConfigView,
    readJsonBody,
    updateSystemConfig: (body) => updateSystemConfig(env, body),
    runDataCleanup: (options) => runDataCleanup(env, options),
    runDeletedAccountSweep: (options) => runDeletedAccountSweep(env, options),
    runDirectoryIndexBackfill: (options) => runDirectoryIndexBackfill(env, options),
    json: (data, status, headers, value) => json(data, status, headers, value, env),
  });
}

async function handleAdminUserRequest(request, url, env) {
  return handleAdminUserRoute({ request, url }, {
    getAdminApiPrefix: () => ADMIN_API_PREFIX,
    requireAdmin: (value) => requireHttpAdmin(value, env),
    parseLimit,
    parseOffset,
    parsePositiveInt,
    toChatId,
    listUsersPage: (options) => listUsersPage(env, options),
    listMessageHistory: (options) => listMessageHistory(env, options),
    handleAvatarProxy: (value) => handleTelegramAvatarProxy(value, env),
    ensureUploadEnvironment: () => ensureEnv(env, ['BOT_TOKEN', 'ADMIN_CHAT_ID']),
    uploadWelcomeMedia: (type, file) => uploadWelcomeMediaToTelegram(env, type, file),
    readJsonBody,
    getOperator: getHttpAdminOperator,
    nowIso: () => new Date().toISOString(),
    setBlacklist: (userId, entry) => setBlacklistEntry(env, userId, entry),
    deleteBlacklist: (userId) => deleteBlacklistEntry(env, userId),
    setTrust: (userId, entry) => setTrustEntry(env, userId, entry),
    deleteTrust: (userId) => deleteTrustEntry(env, userId),
    restartVerification: (userId, operator) => restartUserVerification(env, userId, operator),
    approveVerification: (userId, operator, options) => adminApproveUserVerification(env, userId, operator, options),
    purgeUser: (userId) => purgeDeletedUserData(env, userId),
    createError: (status, message) => new AppError(status, message),
    json: (data, status, headers, value) => json(data, status, headers, value, env),
  });
}

async function handleAdminReplyRequest(request, url, env) {
  return handleAdminReplyRoute({ request, url }, {
    getAdminApiPrefix: () => ADMIN_API_PREFIX,
    requireAdmin: (value) => requireHttpAdmin(value, env),
    ensureBotToken: () => ensureEnv(env, ['BOT_TOKEN']),
    readJsonBody,
    toChatId,
    sendMessage: (userId, text) => telegram(env, 'sendMessage', { chat_id: userId, text }),
    saveMessageHistory: (entry) => saveMessageHistory(env, entry),
    getOperator: getHttpAdminOperator,
    createError: (status, message) => new AppError(status, message),
    json: (data, status, headers, value) => json(data, status, headers, value, env),
  });
}

async function handleAdminBlacklistRequest(request, url, env) {
  return handleAdminBlacklistRoute({ request, url }, {
    getAdminApiPrefix: () => ADMIN_API_PREFIX,
    requireAdmin: (value) => requireHttpAdmin(value, env),
    parseLimit,
    parseOffset,
    listPage: (options) => listBlacklistPage(env, options),
    readJsonBody,
    toChatId,
    getOperator: getHttpAdminOperator,
    nowIso: () => new Date().toISOString(),
    addEntry: (userId, entry) => setBlacklistEntry(env, userId, entry),
    deleteEntry: (userId) => deleteBlacklistEntry(env, userId),
    createError: (status, message) => new AppError(status, message),
    json: (data, status, headers, value) => json(data, status, headers, value, env),
  });
}

async function handleAdminTrustRequest(request, url, env) {
  return handleAdminTrustRoute({ request, url }, {
    getAdminApiPrefix: () => ADMIN_API_PREFIX,
    requireAdmin: (value) => requireHttpAdmin(value, env),
    parseLimit,
    parseOffset,
    listPage: (options) => listTrustPage(env, options),
    readJsonBody,
    toChatId,
    getOperator: getHttpAdminOperator,
    nowIso: () => new Date().toISOString(),
    addEntry: (userId, entry) => setTrustEntry(env, userId, entry),
    deleteEntry: (userId) => deleteTrustEntry(env, userId),
    createError: (status, message) => new AppError(status, message),
    json: (data, status, headers, value) => json(data, status, headers, value, env),
  });
}

function mapImageUploadError(error) {
  if (error instanceof AppError) return error;
  const code = error instanceof Error ? error.message : String(error);
  const messages = {
    image_file_required: [400, '请先选择要上传的图片'],
    image_type_not_allowed: [400, '仅支持 JPG、PNG、WebP 和 GIF 图片'],
    image_file_empty: [400, '图片文件为空'],
    image_file_too_large: [413, '图片大小不能超过 10 MB'],
    image_signature_mismatch: [400, '图片内容与文件类型不匹配'],
    image_id_invalid: [500, '图片标识生成失败'],
  };
  const mapped = messages[code];
  return mapped ? new AppError(mapped[0], mapped[1]) : error;
}

async function handleAdminImageRequest(request, url, env, publicBaseUrl) {
  return handleAdminImageRoute({ request, url, publicBaseUrl }, {
    getAdminApiPrefix: () => ADMIN_API_PREFIX,
    requireAdmin: (value) => requireHttpAdmin(value, env),
    ensureBindings: () => ensureEnv(env, ['DB', 'IMAGE_BUCKET']),
    parseLimit,
    parseOffset,
    listPage: (options) => listImageAssetsPage(env.DB, options),
    store: (file, createdBy) => storeImageAsset({
      file,
      createdBy,
      db: env.DB,
      bucket: env.IMAGE_BUCKET,
    }),
    remove: (id) => removeImageAsset({ id, db: env.DB, bucket: env.IMAGE_BUCKET }),
    buildView: (asset, baseUrl) => buildImageAssetView(asset, baseUrl, {
      imagePublicBaseUrl: env.IMAGE_PUBLIC_BASE_URL,
    }),
    getOperator: getHttpAdminOperator,
    isValidId: (id) => /^[a-f0-9-]{20,64}$/i.test(String(id || '')),
    mapUploadError: mapImageUploadError,
    createError: (status, message) => new AppError(status, message),
    json: (data, status, headers, value) => json(data, status, headers, value, env),
  });
}

async function handleAuthorizedAdminRequest(request, url, env) {
  return handleAuthorizedAdminRoute({ request, url }, {
    getAdminApiPrefix: () => ADMIN_API_PREFIX,
    requireAdmin: (value) => requireHttpAdmin(value, env),
    parseLimit,
    listAdmins: (limit) => listAuthorizedAdmins(env, limit),
    readJsonBody,
    toChatId,
    getOperator: getHttpAdminOperator,
    nowIso: () => new Date().toISOString(),
    setAdmin: (userId, entry) => setAuthorizedAdmin(env, userId, entry),
    deleteAdmin: (userId) => deleteAuthorizedAdmin(env, userId),
    createError: (status, message) => new AppError(status, message),
    json: (data, status, headers, value) => json(data, status, headers, value, env),
  });
}

async function handleWebhookManagementRequest(request, url, env, webhookPath, publicBaseUrl) {
  if (request.method === 'POST' && url.pathname === '/setWebhook') {
    await requireHttpAdmin(request, env);
    ensureEnv(env, ['BOT_TOKEN']);
    const webhookUrl = `${publicBaseUrl}${webhookPath}`;
    const payload = { url: webhookUrl };
    if (env.WEBHOOK_SECRET) payload.secret_token = env.WEBHOOK_SECRET;
    const result = await telegram(env, 'setWebhook', payload);
    return json({ ok: true, webhookUrl, telegram: result }, 200, {}, request, env);
  }

  if (request.method === 'POST' && url.pathname === '/deleteWebhook') {
    await requireHttpAdmin(request, env);
    ensureEnv(env, ['BOT_TOKEN']);
    const result = await telegram(env, 'deleteWebhook', { drop_pending_updates: false });
    return json({ ok: true, telegram: result }, 200, {}, request, env);
  }

  if (request.method === 'GET' && url.pathname === '/getWebhookInfo') {
    await requireHttpAdmin(request, env);
    ensureEnv(env, ['BOT_TOKEN']);
    const result = await telegram(env, 'getWebhookInfo', {});
    return json({ ok: true, telegram: result }, 200, {}, request, env);
  }

  if (request.method === 'POST' && url.pathname === '/setCommands') {
    await requireHttpAdmin(request, env);
    ensureEnv(env, ['BOT_TOKEN']);
    const result = await syncTelegramCommands(env);
    return json({ ok: true, ...result }, 200, {}, request, env);
  }

  return null;
}

function readKvJsonCacheEntry(key, nowMs = Date.now()) {
  const cacheKey = String(key);
  const hit = kvJsonCache.get(cacheKey);
  if (!hit) {
    return { hit: false, value: null };
  }
  if (!Number.isFinite(hit.expiresAt) || hit.expiresAt <= nowMs) {
    kvJsonCache.delete(cacheKey);
    return { hit: false, value: null };
  }
  return {
    hit: true,
    value: hit.value === KV_JSON_NULL ? null : hit.value,
  };
}

function writeKvJsonCache(key, value, ttlMs = HOT_KV_JSON_CACHE_TTL_MS) {
  writeTimedCacheValue(kvJsonCache, String(key), value === null ? KV_JSON_NULL : value, ttlMs);
}

function invalidateKvJsonCache(key) {
  kvJsonCache.delete(String(key));
}

function isUserListSnapshotKey(key) {
  const cacheKey = String(key || '');
  return (
    cacheKey.startsWith('user:') ||
    cacheKey.startsWith('blacklist:') ||
    cacheKey.startsWith('trust:') ||
    cacheKey.startsWith('verify:')
  );
}

function invalidateUserListSnapshotCache(key = '') {
  if (!key || isUserListSnapshotKey(key)) {
    userListSnapshotCache.clear();
  }
}

function noteKvJsonWrite(key, value, ttlMs = HOT_KV_JSON_CACHE_TTL_MS) {
  writeKvJsonCache(key, value, ttlMs);
  invalidateUserListSnapshotCache(key);
}

function noteKvJsonDelete(key) {
  invalidateKvJsonCache(key);
  invalidateUserListSnapshotCache(key);
}

async function getCachedJson(env, key, ttlMs = HOT_KV_JSON_CACHE_TTL_MS) {
  if (!env?.BOT_KV) return null;
  const cacheKey = String(key);
  const cached = readKvJsonCacheEntry(cacheKey);
  if (cached.hit) {
    return cached.value;
  }
  const value = await getJson(env.BOT_KV, cacheKey);
  writeKvJsonCache(cacheKey, value, ttlMs);
  return value;
}

async function putJsonIfChanged(env, key, value, options = {}) {
  if (!env?.BOT_KV) return false;
  const cacheKey = String(key);
  const ttlMs = options.ttlMs || HOT_KV_JSON_CACHE_TTL_MS;
  const hasExplicitExisting = Object.prototype.hasOwnProperty.call(options, 'existing');
  const cached = hasExplicitExisting ? { hit: false, value: null } : readKvJsonCacheEntry(cacheKey);
  const hasComparableExisting = hasExplicitExisting || cached.hit;
  const existing = hasExplicitExisting ? options.existing : cached.value;

  if (hasComparableExisting && areJsonStorageValuesEqual(existing, value)) {
    writeKvJsonCache(cacheKey, value, ttlMs);
    return false;
  }

  await env.BOT_KV.put(cacheKey, serializeJsonForStorage(value));
  noteKvJsonWrite(cacheKey, value, ttlMs);
  return true;
}

async function putUserProfileIfChanged(env, userId, record, options = {}) {
  if (!env?.BOT_KV) return false;
  const key = userKey(userId);
  const hasExplicitExisting = Object.prototype.hasOwnProperty.call(options, 'existing');
  const cached = hasExplicitExisting ? { hit: false, value: null } : readKvJsonCacheEntry(key);
  const hasComparableExisting = hasExplicitExisting || cached.hit;
  const existing = hasExplicitExisting ? options.existing : cached.value;

  if (hasComparableExisting && shouldThrottleUserProfileWrite(existing, record)) {
    return false;
  }

  const putOptions = { ttlMs: USER_PROFILE_CACHE_TTL_MS };
  if (hasComparableExisting) {
    putOptions.existing = existing;
  }
  const changed = await putJsonIfChanged(env, key, record, putOptions);
  if (changed) await writeD1UserDirectory(env, record);
  return changed;
}

async function putVerificationState(env, userId, state, options = {}) {
  const putOptions = { ttlMs: VERIFY_STATE_CACHE_TTL_MS };
  if (Object.prototype.hasOwnProperty.call(options, 'existing')) {
    putOptions.existing = options.existing;
  }
  return putJsonIfChanged(env, verifyKey(userId), state, putOptions);
}

function readD1VerificationStatusCache(userId) {
  return verificationCache.readD1Status(userId);
}

function writeD1VerificationStatusCache(userId, value) {
  verificationCache.writeD1Status(userId, value);
}

function invalidateD1VerificationStatusCache(userId) {
  verificationCache.invalidateD1Status(userId);
}

function shouldSkipDuplicateMessageHistory(entry, userId) {
  const key = buildMessageHistoryDedupeKey(entry, userId);
  if (!key) return false;
  if (readTimedCacheValue(messageHistoryDedupeCache, key)) {
    return true;
  }
  writeTimedCacheValue(messageHistoryDedupeCache, key, true, MESSAGE_HISTORY_DEDUPE_TTL_MS);
  return false;
}

function readMessageHistoryConversationId(userId) {
  const id = Number(readTimedCacheValue(messageHistoryConversationCache, String(Number(userId))));
  return Number.isFinite(id) && id > 0 ? id : null;
}

function writeMessageHistoryConversationId(userId, conversationId) {
  const id = Number(conversationId);
  if (!(Number.isFinite(id) && id > 0)) return;
  writeTimedCacheValue(
    messageHistoryConversationCache,
    String(Number(userId)),
    id,
    MESSAGE_HISTORY_CONVERSATION_CACHE_TTL_MS,
  );
}

function clearMessageHistoryConversationId(userId) {
  messageHistoryConversationCache.delete(String(Number(userId)));
}

function readSystemConfigCache(nowMs = Date.now()) {
  if (!systemConfigCache?.value) {
    return null;
  }
  if (!Number.isFinite(systemConfigCache.expiresAt) || systemConfigCache.expiresAt <= nowMs) {
    systemConfigCache = { value: null, expiresAt: 0 };
    return null;
  }
  return systemConfigCache.value;
}

function writeSystemConfigCache(config, nowMs = Date.now()) {
  const normalized = config && typeof config === 'object' ? { ...config } : {};
  systemConfigCache = {
    value: normalized,
    expiresAt: nowMs + SYSTEM_CONFIG_CACHE_TTL_MS,
  };
}

async function setSystemConfig(env, config) {
  ensureKv(env);
  const normalized = config && typeof config === 'object' ? { ...config } : {};
  await env.BOT_KV.put(SYSTEM_CONFIG_KEY, JSON.stringify(normalized));
  writeSystemConfigCache(normalized);
}

async function runScheduledMaintenance(env) {
  return runScheduledMaintenanceCore(env, {
    isDataCleanupAutoEnabled,
    isDeletedAccountSweepAutoEnabled,
    runDataCleanupIfDue,
    runDeletedAccountSweepIfDue,
    runDirectoryIndexBackfill,
  });
}

async function runNonCriticalTask(ctx, task) {
  const promise = Promise.resolve()
    .then(task)
    .catch((error) => {
      console.error('Non-critical background task failed', formatErrorMessage(error));
    });

  if (ctx?.waitUntil) {
    ctx.waitUntil(promise);
    return;
  }

  await promise;
}

function getGroupAdminStatusFromCachedList(chatId, userId) {
  const cachedMembers = readTimedCacheValue(groupAdminListCache, String(Number(chatId)));
  if (!Array.isArray(cachedMembers)) return null;
  const match = cachedMembers.find((item) => Number(item?.user?.id) === Number(userId));
  if (!match) return false;
  const status = String(match?.status || '').toLowerCase();
  return status === 'creator' || status === 'administrator';
}

async function getAdminChatMembers(env, chatId) {
  const numericChatId = Number(chatId);
  if (!(Number.isFinite(numericChatId) && numericChatId < 0) || !env.BOT_TOKEN) {
    return [];
  }

  const cacheKey = String(numericChatId);
  const cached = readTimedCacheValue(groupAdminListCache, cacheKey);
  if (Array.isArray(cached)) {
    return cached;
  }

  const members = await telegram(env, 'getChatAdministrators', {
    chat_id: numericChatId,
  });
  const normalized = Array.isArray(members) ? members : [];
  writeTimedCacheValue(groupAdminListCache, cacheKey, normalized, GROUP_ADMIN_LIST_CACHE_TTL_MS);

  for (const item of normalized) {
    const memberUserId = Number(item?.user?.id);
    if (!(Number.isFinite(memberUserId) && memberUserId > 0)) continue;
    const status = String(item?.status || '').toLowerCase();
    const isAdmin = status === 'creator' || status === 'administrator';
    writeTimedCacheValue(
      groupAdminMembershipCache,
      buildGroupAdminMemberCacheKey(numericChatId, memberUserId),
      isAdmin,
      GROUP_ADMIN_MEMBER_CACHE_TTL_MS,
    );
  }

  return normalized;
}

async function handleUpdate(update, env, publicBaseUrl = '', ctx = null) {
  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query, env, publicBaseUrl, ctx);
    return;
  }

  const message = update.message || update.edited_message;
  if (!message || !message.chat) return;

  const adminChatId = toChatId(env.ADMIN_CHAT_ID);
  const senderId = message.from?.id ? Number(message.from.id) : null;
  const authorizedAdmin = senderId ? await isAuthorizedAdmin(env, senderId) : false;
  const isAdminChat = Number(message.chat.id) === adminChatId;
  const privateRelayAdminIds = isTopicModeEnabled(env) ? [] : await getPrivateRelayAdminUserIds(env);
  const isPrivateRelayAdminChat = !isTopicModeEnabled(env) && privateRelayAdminIds.includes(Number(message.chat.id));

  if (authorizedAdmin || isAdminChat || isPrivateRelayAdminChat) {
    await handleAdminMessage(message, env, adminChatId, authorizedAdmin, publicBaseUrl, ctx);
    return;
  }

  if (message.chat.type !== 'private') {
    return;
  }

  if (isTopicModeEnabled(env) || isUserVerificationEnabled(env)) {
    ensureKv(env);
  }

  const verificationEnabled = isUserVerificationEnabled(env);
  await upsertUserProfile(env, message, {
    recordMessageActivity: !verificationEnabled,
  });

  const blacklistEntry = await getBlacklistEntry(env, message.chat.id);
  if (blacklistEntry) {
    await telegram(env, 'sendMessage', {
      chat_id: message.chat.id,
      text: env.BLOCKED_TEXT || DEFAULT_BLOCKED_TEXT,
    });
    return;
  }

  if (isUserPrivateCommand(message)) {
    await handleUserPrivateCommand(message, env, publicBaseUrl);
    return;
  }

  const verificationStateRef = { value: null };
  const verified = await ensureUserVerifiedOrPrompt(message, env, publicBaseUrl, {
    stateRef: verificationStateRef,
  });
  if (!verified) {
    return;
  }

  if (verificationEnabled) {
    await upsertUserProfile(env, message);
  }

  const observationAllowed = await applyPostVerifyObservationLayer(
    message,
    env,
    adminChatId,
    verificationStateRef.value,
  );
  if (!observationAllowed) {
    return;
  }

  await handleUserMessage(message, env, adminChatId, ctx);
}

async function handleCallbackQuery(callbackQuery, env, publicBaseUrl = '', ctx = null) {
  const data = String(callbackQuery.data || '');
  if (!data) {
    await answerCallback(env, callbackQuery.id, '未识别的操作');
    return;
  }

  if (data.startsWith('verify:')) {
    await answerCallback(env, callbackQuery.id, '旧版验证已下线，请重新打开新的网页验证入口。', true);
    return;
  }

  if (data.startsWith('adm:') || isAdminCommandPanelCallback(data)) {
    await handleAdminActionCallback(callbackQuery, env, publicBaseUrl, ctx);
    return;
  }

  await answerCallback(env, callbackQuery.id, '未识别的操作');
}

async function handleUserMessage(message, env, adminChatId, ctx = null) {
  const sender = message.from || {};
  const topicModeEnabled = isTopicModeEnabled(env);
  const relayChatIds = topicModeEnabled ? [adminChatId] : await getPrivateRelayAdminUserIds(env);
  if (!topicModeEnabled && relayChatIds.length === 0) {
    await notifyUserAdminDeliveryFailed(
      env,
      message,
      new Error('未找到可用的管理员私聊转发目标，请配置 ADMIN_IDS 或 ADMIN_ID（管理员用户 ID）。'),
    );
    return;
  }

  const profileLine = formatUserProfile(sender, message.chat);
  let topicRecord = null;
  let topicError = '';
  if (topicModeEnabled) {
    try {
      topicRecord = await ensureUserTopic(env, message, adminChatId);
    } catch (error) {
      topicError = formatErrorMessage(error);
    }
  }
  const messageThreadId = topicRecord?.threadId;
  const topicModeActive = Boolean(messageThreadId);
  const shouldSendMeta = shouldSendUserMetaMessage(env, topicModeEnabled, topicRecord, topicModeActive);
  const metaText = [
    '用户新消息',
    `#UID:${message.chat.id}`,
    profileLine,
    topicModeActive
      ? '当前为话题模式。请在该用户专属话题内直接回复，后续用户消息将只转发原消息。也可使用下方操作按钮。'
      : topicModeEnabled && topicError
        ? `创建话题失败，已回退到私聊转发模式。\n错误：${topicError}`
        : relayChatIds.length > 1
          ? `当前为私聊转发模式（TOPIC_MODE 已关闭）。消息已发送给 ${relayChatIds.length} 位管理员，请在机器人私聊中回复，或使用 /reply userId 内容。`
          : '当前为私聊转发模式（TOPIC_MODE 已关闭）。消息已发送到管理员私聊，请在机器人私聊中回复，或使用 /reply userId 内容。',
    '可使用下方操作按钮查看资料、封禁/解封和信任管理。',
  ]
    .filter(Boolean)
    .join('\n');

  const { delivered, lastError } = await relayUserMessageToAdmins({
    env,
    message,
    relayChatIds,
    messageThreadId,
    fallbackText: buildFallbackText(message, sender),
    metaText,
    replyMarkup: buildAdminActionKeyboard(message.chat.id),
    shouldSendMeta,
    topicModeActive,
    markTopicMeta: (sentMeta) => markUserTopicMetaSent(env, topicRecord, sentMeta),
  });
  if (!delivered) {
    await notifyUserAdminDeliveryFailed(env, message, lastError || new Error('消息转发失败'));
    await runNonCriticalTask(ctx, () => saveMessageHistory(env, {
      userId: Number(message.chat.id),
      chatType: message.chat?.type || 'private',
      topicId: messageThreadId || null,
      telegramMessageId: Number(message.message_id) || null,
      direction: 'user_to_admin',
      senderRole: 'user',
      messageType: detectMessageType(message),
      textContent: extractMessageText(message),
      mediaFileId: extractPrimaryMediaFileId(message),
      rawPayload: message,
    }));
    return;
  }

  if (typeof message.text === 'string' && message.text.startsWith('/start')) {
    await sendWelcomeMessage(env, Number(message.chat.id));
  }

  await runNonCriticalTask(ctx, () => saveMessageHistory(env, {
    userId: Number(message.chat.id),
    chatType: message.chat?.type || 'private',
    topicId: messageThreadId || null,
    telegramMessageId: Number(message.message_id) || null,
    direction: 'user_to_admin',
    senderRole: 'user',
    messageType: detectMessageType(message),
    textContent: extractMessageText(message),
    mediaFileId: extractPrimaryMediaFileId(message),
    rawPayload: message,
  }));
}

async function getPrivateRelayAdminUserIds(env) {
  const configured = parseIdList(env.ADMIN_IDS || env.ADMIN_ID).filter((id) => Number.isFinite(id) && id > 0);
  if (configured.length > 0) {
    return Array.from(new Set(configured));
  }

  const adminChatId = Number(env.ADMIN_CHAT_ID);
  if (Number.isFinite(adminChatId) && adminChatId > 0) {
    return [adminChatId];
  }

  if (Number.isFinite(adminChatId) && adminChatId < 0 && env.BOT_TOKEN) {
    try {
      const members = await getAdminChatMembers(env, adminChatId);
      const memberIds = members
        .filter((item) => !item?.user?.is_bot)
        .map((item) => Number(item?.user?.id))
        .filter((id) => Number.isFinite(id) && id > 0);
      return Array.from(new Set(memberIds));
    } catch (error) {
      return [];
    }
  }

  return [];
}


async function handleAdminMessage(message, env, adminChatId, preAuthorized = null, publicBaseUrl = '', ctx = null) {
  return handleAuthorizedAdminMessage({
    message,
    adminChatId,
    preAuthorized,
    publicBaseUrl,
    ctx,
  }, {
    isAuthorizedAdmin: (senderId) => isAuthorizedAdmin(env, senderId),
    isAnonymousAdminMessage,
    isTelegramGroupAdmin: (chatId, senderId) => isTelegramGroupAdmin(env, chatId, senderId),
    sendAdminNotice: (value, text) => sendAdminNotice(env, value, text),
    runNonCriticalTask,
    syncTelegramProfile: (senderId, details) => syncTelegramProfile(env, senderId, details),
    isTopicModeEnabled: () => isTopicModeEnabled(env),
    getPrivateRelayAdminUserIds: () => getPrivateRelayAdminUserIds(env),
    tryConsumePendingWelcomeSetup: (value) => tryConsumePendingWelcomeSetup(value, env),
    tryConsumePendingImageUpload: (value) => tryConsumePendingAdminImageUpload(value, env, publicBaseUrl),
    tryConsumePendingPanelInput: (value) => tryConsumePendingAdminPanelInput(value, env, publicBaseUrl),
    resolveAdminTargetUserId: (value, chatId) => resolveAdminTargetUserId(value, env, chatId),
    handleAdminCommand: (value, targetUserId, baseUrl) => handleAdminCommand(value, env, targetUserId, baseUrl),
    sendUserMessage: (targetUserId, text) => telegram(env, 'sendMessage', {
      chat_id: targetUserId,
      text,
    }),
    saveMessageHistory: (entry) => saveMessageHistory(env, entry),
    relayAdminMessageToUser: (value, targetUserId) => relayAdminMessageToUser(value, env, targetUserId),
    formatError: formatErrorMessage,
  });
}

async function handleAdminCommand(message, env, defaultTargetUserId, publicBaseUrl = '') {
  if (typeof message.text !== 'string') return false;

  const trimmed = normalizeBotCommandText(message.text);
  if (trimmed === '/start') {
    await sendAdminCommandPanel(env, message);
    return true;
  }

  const senderId = message.from?.id ? Number(message.from.id) : null;
  const adminChatId = toChatId(env.ADMIN_CHAT_ID);
  const isAdminGroupOwner = Boolean(
    senderId
    && message.chat?.type !== 'private'
    && Number(message.chat?.id) === adminChatId
    && await isTelegramGroupOwner(env, adminChatId, senderId),
  );
  const rootAdmin = Boolean(senderId && isRootAdmin(env, senderId)) || isAdminGroupOwner;
  const pendingScope = getWelcomeSetupScopeKey(message);

  const systemHandled = await handleAdminSystemCommand(
    {
      trimmed,
      topicModeEnabled: isTopicModeEnabled(env),
      pendingScope,
      operator: formatAdminOperator(message.from),
      chatId: message.chat?.id,
      threadId: message.message_thread_id,
    },
    {
      syncCommands: () => syncTelegramCommands(env),
      clearWelcomeSetup: (scope) => clearPendingWelcomeSetup(env, scope),
      setWelcomeSetup: (scope, payload) => setPendingWelcomeSetup(env, scope, payload),
      normalizeWelcomeType: normalizeWelcomeTypeForSetup,
      resolvePanelUrl: () => getAdminPanelEntryUrl(env, publicBaseUrl) || resolveAdminPanelUrl(env, publicBaseUrl),
      resendPanelPassword: () => resendBootstrapPassword(env),
      resetPanelPassword: () => resetBootstrapPassword(env),
      sendNotice: (text) => sendAdminNotice(env, message, text),
    },
  );
  if (systemHandled) return true;

  const configHandled = await handleAdminConfigCommand(
    { trimmed },
    {
      getConfig: () => getEffectiveSystemConfig(env),
      updateConfig: (payload) => updateSystemConfig(env, payload),
      defaultBlockedText: env.BLOCKED_TEXT || DEFAULT_BLOCKED_TEXT,
      sendNotice: (text) => sendAdminNotice(env, message, text),
    },
  );
  if (configHandled) return true;

  const accessHandled = await handleAdminAccessCommand(
    { trimmed, rootAdmin, operator: formatAdminOperator(message.from) },
    {
      setAuthorizedAdmin: (userId, payload) => setAuthorizedAdmin(env, userId, payload),
      deleteAuthorizedAdmin: (userId) => deleteAuthorizedAdmin(env, userId),
      listAuthorizedAdmins: (limit) => listAuthorizedAdmins(env, limit),
      parseLimit,
      sendNotice: (text) => sendAdminNotice(env, message, text),
    },
  );
  if (accessHandled) return true;

  const moderationHandled = await handleAdminModerationCommand(
    { trimmed, defaultTargetUserId, message, blockedText: env.BLOCKED_TEXT || DEFAULT_BLOCKED_TEXT, operator: formatAdminOperator(message.from) },
    {
      sendNotice: (text) => sendAdminNotice(env, message, text),
      setTrust: (userId, payload) => setTrustEntry(env, userId, payload),
      deleteTrust: (userId) => deleteTrustEntry(env, userId),
      setBlacklist: (userId, payload) => setBlacklistEntry(env, userId, payload),
      deleteBlacklist: (userId) => deleteBlacklistEntry(env, userId),
      sendBlockedMessage: (userId, text) => telegram(env, 'sendMessage', { chat_id: userId, text }),
      listBlacklist: (limit) => listBlacklist(env, limit),
      listTrust: (limit) => listTrust(env, limit),
      parseLimit,
    },
  );
  if (moderationHandled) return true;

  const maintenanceHandled = await handleAdminMaintenanceCommand(
    { trimmed, defaultTargetUserId },
    {
      runDataCleanup: (options) => runDataCleanup(env, options),
      runDeletedAccountSweep: (options) => runDeletedAccountSweep(env, options),
      purgeDeletedUser: (userId) => purgeDeletedUserData(env, userId),
      sendNotice: (text) => sendAdminNotice(env, message, text),
    },
  );
  if (maintenanceHandled) return true;

  const userCommandHandled = await handleAdminUserCommand(
    { trimmed, defaultTargetUserId, operator: formatAdminOperator(message.from) },
    {
      restartVerification: (userId, operator) => restartUserVerification(env, userId, operator),
      approveVerification: (userId, operator, options) => adminApproveUserVerification(env, userId, operator, options),
      getUserProfile: (userId) => getUserProfile(env, userId),
      getBlacklist: (userId) => getBlacklistEntry(env, userId),
      getTrust: (userId) => getTrustEntry(env, userId),
      getTopic: (userId) => getTopicByUser(env, userId),
      getVerificationState: (userId) => getUserVerificationState(env, userId),
      formatUserDetail: formatUserDetailText,
      sendUserActions: (userId) => sendUserActionCard(env, message, userId),
      listUsers: (limit) => listUsers(env, limit),
      parseLimit,
      sendNotice: (text) => sendAdminNotice(env, message, text),
    },
  );
  if (userCommandHandled) return true;

  return false;
}

async function handleAdminActionCallback(callbackQuery, env, publicBaseUrl = '', ctx = null) {
  const senderId = callbackQuery.from?.id ? Number(callbackQuery.from.id) : null;
  const sourceChatId = callbackQuery.message?.chat?.id ? Number(callbackQuery.message.chat.id) : null;
  const adminChatId = toChatId(env.ADMIN_CHAT_ID);
  let allowed = senderId ? await isAuthorizedAdmin(env, senderId) : false;

  if (!allowed && senderId && sourceChatId === adminChatId && callbackQuery.message?.chat?.type !== 'private') {
    allowed = await isTelegramGroupAdmin(env, adminChatId, senderId);
  }

  if (!senderId || !allowed) {
    await answerCallback(env, callbackQuery.id, '你还没有被授权为管理员。', true);
    return;
  }

  await runNonCriticalTask(ctx, () => syncTelegramProfile(env, senderId, {
    user: callbackQuery.from || {},
    adminChatId,
  }));

  if (isAdminCommandPanelCallback(callbackQuery.data)) {
    const sourceMessage = callbackQuery.message || { chat: { id: senderId } };
    const commandMessage = {
      ...sourceMessage,
      from: callbackQuery.from || sourceMessage.from,
    };
    await handleAdminCommandPanelCallback(
      { data: callbackQuery.data },
      {
        answer: (text, showAlert = false) => answerCallback(env, callbackQuery.id, text, showAlert),
        startUpload: () => tryConsumePendingAdminImageUpload({ ...commandMessage, text: '/upload' }, env, publicBaseUrl),
        runAdminCommand: (text) => handleAdminCommand({ ...commandMessage, text }, env, null, publicBaseUrl),
        startInput: (action) => beginPendingAdminPanelInput(commandMessage, env, action),
        confirmDeleteInput: () => confirmPendingAdminPanelDelete(commandMessage, env, publicBaseUrl),
        editPanel: (payload) => editAdminCommandPanel(env, sourceMessage, payload),
      },
    );
    return;
  }

  await handleAdminActionCallbackCommand(
    {
      data: callbackQuery.data,
      sourceMessage: callbackQuery.message || { chat: { id: senderId } },
      senderId,
      operator: formatAdminOperator(callbackQuery.from),
      topicModeEnabled: isTopicModeEnabled(env),
      blockedText: env.BLOCKED_TEXT || DEFAULT_BLOCKED_TEXT,
    },
    {
      answer: (text, showAlert = false) => answerCallback(env, callbackQuery.id, text, showAlert),
      sendNotice: (sourceMessage, text) => sendAdminNotice(env, sourceMessage, text),
      getUserProfile: (userId) => getUserProfile(env, userId),
      getBlacklist: (userId) => getBlacklistEntry(env, userId),
      getTrust: (userId) => getTrustEntry(env, userId),
      getTopic: (userId) => getTopicByUser(env, userId),
      getVerificationState: (userId) => getUserVerificationState(env, userId),
      formatUserDetail: formatUserDetailText,
      setBlacklist: (userId, payload) => setBlacklistEntry(env, userId, payload),
      deleteBlacklist: (userId) => deleteBlacklistEntry(env, userId),
      setTrust: (userId, payload) => setTrustEntry(env, userId, payload),
      deleteTrust: (userId) => deleteTrustEntry(env, userId),
      restartVerification: (userId, operator) => restartUserVerification(env, userId, operator),
      approveVerification: (userId, operator, options) => adminApproveUserVerification(env, userId, operator, options),
      sendBlockedMessage: (userId, text) => telegram(env, 'sendMessage', { chat_id: userId, text }),
    },
  );
}

async function sendAdminCommandPanel(env, message) {
  const payload = {
    chat_id: message.chat.id,
    text: buildAdminCommandPanelText(),
    reply_markup: buildHierarchicalAdminCommandPanelKeyboard(),
  };

  if (message.message_thread_id) {
    payload.message_thread_id = message.message_thread_id;
  }

  await telegramWithThreadFallback(env, 'sendMessage', payload);
}

async function editAdminCommandPanel(env, message, payload = {}) {
  const chatId = Number(message?.chat?.id || 0);
  const messageId = Number(message?.message_id || 0);
  if (!chatId || !messageId) return false;
  await telegram(env, 'editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    ...payload,
  });
  return true;
}

function getWelcomeType(env) {
  const raw = String(env?.WELCOME_TYPE || WELCOME_TYPE_TEXT).trim().toLowerCase();
  if (raw === WELCOME_TYPE_PHOTO) return WELCOME_TYPE_PHOTO;
  if (raw === WELCOME_TYPE_VIDEO) return WELCOME_TYPE_VIDEO;
  if (raw === WELCOME_TYPE_ANIMATION) return WELCOME_TYPE_ANIMATION;
  if (raw === WELCOME_TYPE_AUDIO) return WELCOME_TYPE_AUDIO;
  if (raw === WELCOME_TYPE_VOICE) return WELCOME_TYPE_VOICE;
  if (raw === WELCOME_TYPE_STICKER) return WELCOME_TYPE_STICKER;
  if (raw === WELCOME_TYPE_DOCUMENT) return WELCOME_TYPE_DOCUMENT;
  return WELCOME_TYPE_TEXT;
}

function buildWelcomeText(env, extraText = '') {
  const base = String(env?.WELCOME_TEXT || DEFAULT_WELCOME).trim() || DEFAULT_WELCOME;
  const extra = String(extraText || '').trim();
  if (!extra) return base;
  return `${base}\n\n${extra}`;
}

async function sendWelcomeMessage(env, chatId, options = {}) {
  const userId = Number(chatId);
  if (!Number.isFinite(userId)) return;
  const welcomeType = getWelcomeType(env);
  const media = String(env?.WELCOME_MEDIA || '').trim();
  const text = buildWelcomeText(env, options.extraText || '');

  if (welcomeType === WELCOME_TYPE_PHOTO && media) {
    await telegram(env, 'sendPhoto', {
      chat_id: userId,
      photo: media,
      caption: trimText(text, 1024),
    });
    return;
  }

  if (welcomeType === WELCOME_TYPE_VIDEO && media) {
    await telegram(env, 'sendVideo', {
      chat_id: userId,
      video: media,
      caption: trimText(text, 1024),
    });
    return;
  }

  if (welcomeType === WELCOME_TYPE_DOCUMENT && media) {
    await telegram(env, 'sendDocument', {
      chat_id: userId,
      document: media,
      caption: trimText(text, 1024),
    });
    return;
  }

  if (welcomeType === WELCOME_TYPE_ANIMATION && media) {
    await telegram(env, 'sendAnimation', {
      chat_id: userId,
      animation: media,
      caption: trimText(text, 1024),
    });
    return;
  }

  if (welcomeType === WELCOME_TYPE_AUDIO && media) {
    await telegram(env, 'sendAudio', {
      chat_id: userId,
      audio: media,
      caption: trimText(text, 1024),
    });
    return;
  }

  if (welcomeType === WELCOME_TYPE_VOICE && media) {
    await telegram(env, 'sendVoice', {
      chat_id: userId,
      voice: media,
      caption: trimText(text, 1024),
    });
    return;
  }

  if (welcomeType === WELCOME_TYPE_STICKER && media) {
    await telegram(env, 'sendSticker', {
      chat_id: userId,
      sticker: media,
    });

    if (text.trim()) {
      await telegram(env, 'sendMessage', {
        chat_id: userId,
        text,
      });
    }
    return;
  }

  await telegram(env, 'sendMessage', {
    chat_id: userId,
    text,
  });
}

async function handleUserPrivateCommand(message, env, publicBaseUrl = '') {
  const raw = String(message.text || '').trim();
  const command = raw.split(/\s+/)[0].split('@')[0].toLowerCase();

  if (command === '/start') {
    const verified = await ensureUserVerifiedOrPrompt(message, env, publicBaseUrl);
    if (!verified) return;

    await sendWelcomeMessage(env, Number(message.chat.id));
    return;
  }

  await telegram(env, 'sendMessage', {
    chat_id: message.chat.id,
    text: '该命令仅管理员可用，请直接发送你要咨询的内容。',
  });
}

async function ensureUserVerifiedOrPrompt(message, env, publicBaseUrl = '', options = {}) {
  const stateRef = options?.stateRef && typeof options.stateRef === 'object' ? options.stateRef : null;
  if (!isUserVerificationEnabled(env)) {
    if (stateRef) stateRef.value = null;
    return true;
  }

  ensureKv(env);
  const userId = Number(message.chat.id);
  let state = await getUserVerificationState(env, userId);
  if (stateRef) stateRef.value = state || null;
  if (state?.verified) {
    const profile = await getUserProfile(env, userId);
    if (await isVerificationStateActive(env, userId, state, profile)) {
      if (!isProfileVerificationPassed(profile)) {
        await markUserProfileVerificationPassed(env, userId, state.verifiedAt || state.answeredAt || state.updatedAt);
      }
      return true;
    }

    state = await resetVerificationStateAfterProfileRevocation(env, userId, state);
    if (stateRef) stateRef.value = state || null;
  }

  const profile = await getUserProfile(env, userId);
  const repairedState = await repairVerificationStateFromProfile(env, userId, state, profile);
  if (repairedState?.verified) {
    if (stateRef) stateRef.value = repairedState;
    return true;
  }

  const blockedUntilMs = state?.blockedUntil ? new Date(state.blockedUntil).getTime() : 0;
  if (blockedUntilMs && blockedUntilMs > Date.now()) {
    const leftSec = Math.max(1, Math.ceil((blockedUntilMs - Date.now()) / 1000));
    await telegram(env, 'sendMessage', {
      chat_id: userId,
      text: `验证冷却中，请 ${leftSec} 秒后再试。`,
    });
    return false;
  }

  const nextState = await createOrRefreshVerificationWebSession(env, userId, {
    // 一次一码：每次触发验证入口都强制刷新会话令牌，避免旧链接/缓存复用
    forceNew: true,
  });
  if (stateRef) stateRef.value = nextState;
  await sendVerificationWebPrompt(env, userId, nextState, publicBaseUrl, true);
  return false;
}

async function syncTelegramCommands(env) {
  return syncTelegramCommandMenu({
    env,
    adminChatIds: getCommandAdminChatIds(env),
    legacyGroupChatIds: getCommandGroupChatIdsForCleanup(env),
    adminUserIds: await getCommandAdminUserIds(env),
  });
}

async function resolveAdminTargetUserId(message, env, adminChatId) {
  const byReply = extractTargetUserId(message.reply_to_message);
  if (byReply) {
    return byReply;
  }

  if (isTopicModeEnabled(env) && Number(message.chat.id) === adminChatId && message.message_thread_id) {
    return getUserIdByThread(env, message.message_thread_id);
  }

  const textPool = [message?.text, message?.caption].filter(Boolean).join('\n');
  const selfMetaMatch = textPool.match(/#UID:(-?\d+)/);
  if (selfMetaMatch) {
    return Number(selfMetaMatch[1]);
  }

  return null;
}

function formatUserDetailText(userId, profile, blacklist, trust, topic, verifyState) {
  if (!profile && !blacklist && !trust && !topic && !verifyState) {
    return `未找到用户 ${userId} 的资料记录。`;
  }

  const lines = [`用户详情：${userId}`];
  if (profile) {
    lines.push(`昵称：${profile.displayName || '未知'}`);
    lines.push(`用户名：${profile.username ? `@${profile.username}` : '无'}`);
    lines.push(`First Name：${profile.firstName || '无'}`);
    lines.push(`Last Name：${profile.lastName || '无'}`);
    lines.push(`头像：${profile.hasAvatar ? '已同步' : '暂无'}`);
    lines.push(`资料状态：${formatProfileStatusText(profile.profileStatus)}`);
    lines.push(`资料更新时间：${profile.lastProfileSyncAt || '未知'}`);
    lines.push(`首次出现：${profile.firstSeenAt || '未知'}`);
    lines.push(`最近活跃：${profile.lastSeenAt || '未知'}`);
    lines.push(`最后消息：${profile.lastMessagePreview || '无'}`);
  }
  if (topic) {
    lines.push('话题模式：已分配');
    lines.push(`话题线程 ID：${topic.threadId || '未知'}`);
    lines.push(`话题名称：${topic.topicName || '未命名'}`);
  } else {
    lines.push('话题模式：未分配');
  }
  if (verifyState?.verified) {
    lines.push(`首次私聊验证：已通过（${verifyState.verifiedAt || '未知时间'}）`);
  } else if (verifyState?.challenge) {
    lines.push('首次私聊验证：待完成');
  } else {
    lines.push('首次私聊验证：未记录');
  }
  if (trust) {
    lines.push('白名单：是');
    lines.push(`白名单备注：${trust.note || '未填写'}`);
    lines.push(`白名单时间：${trust.createdAt || '未知'}`);
  } else {
    lines.push('白名单：否');
  }
  if (blacklist) {
    lines.push('黑名单：是');
    lines.push(`封禁原因：${blacklist.reason || '未填写'}`);
    lines.push(`封禁时间：${blacklist.createdAt || '未知'}`);
  } else {
    lines.push('黑名单：否');
  }
  return lines.join('\n');
}

function formatProfileStatusText(status) {
  if (status === 'complete') return '头像与资料已同步';
  if (status === 'partial') return '基础资料已同步';
  if (status === 'message-only') return '仅基于消息资料';
  if (status === 'error') return '资料同步异常';
  return '未知';
}

function buildAdminActionKeyboard(userId) {
  return {
    inline_keyboard: [
      [
        { text: '💬 回复', callback_data: `adm:reply:${userId}` },
        { text: '👤 用户资料', callback_data: `adm:user:${userId}` },
      ],
      [
        { text: '🚫 拉黑', callback_data: `adm:ban:${userId}` },
        { text: '✅ 解封', callback_data: `adm:unban:${userId}` },
      ],
      [
        { text: '🤝 信任', callback_data: `adm:trust:${userId}` },
        { text: '♻️ 重验', callback_data: `adm:restart:${userId}` },
      ],
      [{ text: '🧹 取消信任', callback_data: `adm:untrust:${userId}` }],
    ],
  };
}

function buildVerificationImageUrl(challenge, publicBaseUrl = '') {
  const base = String(publicBaseUrl || '').trim().replace(/\/$/, '');
  if (!base) return '';
  const text = getVerificationImageText(challenge);
  const params = new URLSearchParams({
    text,
    token: String(challenge?.token || ''),
    mode: String(challenge?.mode || 'captcha'),
  });
  return `${base}${VERIFY_IMAGE_PATH}?${params.toString()}`;
}

function getVerificationImageText(challenge) {
  const raw = String(challenge?.imageText || challenge?.question || challenge?.correct || 'VERIFY').trim();
  return raw.replace(/[^\w+\-*/=? ]/g, ' ').replace(/\s+/g, ' ').slice(0, 24) || 'VERIFY';
}

function serveVerificationImage(url, request) {
  const text = String(url.searchParams.get('text') || 'VERIFY')
    .replace(/[^\w+\-*/=? ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24)
    .toUpperCase() || 'VERIFY';
  const token = String(url.searchParams.get('token') || '').slice(0, 80);
  const png = renderVerificationPng(text, token);
  return new Response(png, {
    headers: {
      'content-type': 'image/png',
      'cache-control': 'no-store, max-age=0',
      ...corsHeaders(request),
    },
  });
}

function renderVerificationPng(text, token = '') {
  const width = 420;
  const height = 140;
  const pixels = new Uint8Array(width * height * 3);
  const rand = createSeededRandom(`${text}:${token}`);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 3;
      const shade = 242 + Math.floor(rand() * 10);
      pixels[idx] = shade;
      pixels[idx + 1] = Math.min(255, shade + 2);
      pixels[idx + 2] = 255;
    }
  }

  for (let i = 0; i < 900; i += 1) {
    const x = Math.floor(rand() * width);
    const y = Math.floor(rand() * height);
    const idx = (y * width + x) * 3;
    const v = 160 + Math.floor(rand() * 70);
    pixels[idx] = v;
    pixels[idx + 1] = v;
    pixels[idx + 2] = v + 15;
  }

  for (let i = 0; i < 8; i += 1) {
    drawLine(
      pixels,
      width,
      height,
      Math.floor(rand() * width),
      Math.floor(rand() * height),
      Math.floor(rand() * width),
      Math.floor(rand() * height),
      [120 + Math.floor(rand() * 80), 130 + Math.floor(rand() * 70), 170 + Math.floor(rand() * 60)],
    );
  }

  const chars = text.split('');
  const scale = chars.length > 14 ? 6 : chars.length > 9 ? 7 : 8;
  const gap = Math.max(3, Math.floor(scale * 0.75));
  const totalWidth = chars.reduce((sum, ch) => sum + getFontWidth(ch, scale) + gap, -gap);
  let x = Math.max(16, Math.floor((width - totalWidth) / 2));
  const y = Math.floor((height - 7 * scale) / 2);
  for (const ch of chars) {
    const jitterY = Math.floor(rand() * 7) - 3;
    const color = [20 + Math.floor(rand() * 40), 45 + Math.floor(rand() * 45), 90 + Math.floor(rand() * 70)];
    drawChar(pixels, width, height, ch, x, y + jitterY, scale, color);
    x += getFontWidth(ch, scale) + gap;
  }

  return encodePngRgb(width, height, pixels);
}

const FONT_5X7 = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10011', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00001', '00001', '00001', '00001', '10001', '10001', '01110'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '*': ['00000', '10101', '01110', '11111', '01110', '10101', '00000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '=': ['00000', '00000', '11111', '00000', '11111', '00000', '00000'],
  '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

function getFontWidth(ch, scale) {
  return (ch === ' ' ? 3 : 5) * scale;
}

function drawChar(pixels, width, height, ch, x, y, scale, color) {
  const glyph = FONT_5X7[ch] || FONT_5X7['?'];
  for (let gy = 0; gy < glyph.length; gy += 1) {
    const row = glyph[gy];
    for (let gx = 0; gx < row.length; gx += 1) {
      if (row[gx] !== '1') continue;
      for (let py = 0; py < scale; py += 1) {
        for (let px = 0; px < scale; px += 1) {
          setPixel(pixels, width, height, x + gx * scale + px, y + gy * scale + py, color);
        }
      }
    }
  }
}

async function answerCallback(env, callbackQueryId, text, showAlert = false) {
  try {
    await telegram(env, 'answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert,
    });
  } catch (error) {
    // ignore
  }
}

async function clearVerificationPromptMessage(env, chatId, messageId, text) {
  return clearVerificationPromptMessageRequest(
    { chatId, messageId, text },
    {
      editCaption: (payload) => telegram(env, 'editMessageCaption', payload),
      editText: (payload) => telegram(env, 'editMessageText', payload),
    },
  );
}

async function deleteVerificationPromptMessage(env, chatId, messageId) {
  return deleteVerificationPromptMessageRequest(
    {
      chatId,
      messageId,
      staleText: '此验证入口已失效，请使用最新验证消息。',
    },
    {
      deleteMessage: (payload) => telegram(env, 'deleteMessage', payload),
      editCaption: (payload) => telegram(env, 'editMessageCaption', payload),
      editText: (payload) => telegram(env, 'editMessageText', payload),
    },
  );
}

async function getAdminStatus(url, env, webhookPath, publicBaseUrl) {
  const topicModeEnabled = isTopicModeEnabled(env);
  const userVerificationEnabled = isUserVerificationEnabled(env);
  let webhookInfo = null;
  let webhookError = null;
  let lastWebhookError = null;
  let webhookErrorStats = null;
  let deploymentHealth = null;
  let directoryIndexBackfill = null;

  if (env.BOT_TOKEN) {
    try {
      webhookInfo = await telegram(env, 'getWebhookInfo', {});
    } catch (error) {
      webhookError = error instanceof Error ? error.message : String(error);
    }
  }

  if (env.BOT_KV) {
    [lastWebhookError, webhookErrorStats, deploymentHealth, directoryIndexBackfill] = await Promise.all([
      getJson(env.BOT_KV, LAST_WEBHOOK_ERROR_KEY),
      getJson(env.BOT_KV, WEBHOOK_ERROR_STATS_KEY),
      getJson(env.BOT_KV, DEPLOYMENT_HEALTH_KEY),
      getJson(env.BOT_KV, DIRECTORY_INDEX_BACKFILL_KEY),
    ]);
  }

  return {
    ok: true,
    service: 'telegram-private-chatbot',
    currentHost: url.host,
    publicBaseUrl,
    usingCustomDomain: !new URL(publicBaseUrl).hostname.endsWith('.workers.dev'),
    webhookPath,
    webhookUrl: `${publicBaseUrl}${webhookPath}`,
    adminPanel: getAdminPanelEntryUrl(env, publicBaseUrl) || buildAdminPanelUrl(env, publicBaseUrl),
    adminPanelTarget: buildAdminPanelUrl(env, publicBaseUrl),
    botConfigReady: Boolean(env.BOT_TOKEN && env.ADMIN_CHAT_ID),
    adminMode: topicModeEnabled ? 'forum-topic' : 'reply-chain',
    topicModeEnabled,
    topicModeReady: topicModeEnabled ? Boolean(env.BOT_KV) : true,
    userVerificationEnabled,
    userVerificationReady: userVerificationEnabled ? Boolean(env.BOT_KV) : true,
    hasToken: Boolean(env.BOT_TOKEN),
    hasKv: Boolean(env.BOT_KV),
    hasD1: Boolean(env.DB),
    hasR2: Boolean(env.IMAGE_BUCKET),
    imagePublicBaseUrl: normalizeImagePublicBaseUrl(env.IMAGE_PUBLIC_BASE_URL) || null,
    imageDeliveryMode: normalizeImagePublicBaseUrl(env.IMAGE_PUBLIC_BASE_URL) ? 'r2-custom-domain' : 'worker-fallback',
    hasAdminApiKey: Boolean(env.ADMIN_API_KEY),
    adminChatId: env.ADMIN_CHAT_ID || null,
    rootAdminIds: getRootAdminIds(env),
    webhookInfo,
    webhookError,
    lastWebhookError,
    webhookErrorStats,
    deploymentHealth,
    directoryIndexBackfill,
  };
}

async function recordWebhookError(env, error, update, context = {}) {
  const message = update?.message || update?.edited_message || update?.callback_query?.message || null;
  const record = {
    at: new Date().toISOString(),
    error: formatErrorMessage(error),
    updateId: update?.update_id || null,
    chatId: message?.chat?.id || null,
    messageId: message?.message_id || null,
    senderId: update?.callback_query?.from?.id || message?.from?.id || null,
    messageType: message ? detectMessageType(message) : update?.callback_query ? 'callback_query' : 'unknown',
    requestId: context.requestId || null,
    stage: context.stage || 'handle_update',
    durationMs: Number(context.durationMs || 0),
  };
  writeStructuredLog('error', 'telegram_update_failed', {
    requestId: record.requestId,
    updateId: record.updateId,
    userId: record.senderId,
    chatId: record.chatId,
    stage: record.stage,
  }, {
    messageId: record.messageId,
    messageType: record.messageType,
    durationMs: record.durationMs,
    error: record.error,
  });
  if (env.BOT_KV) {
    try {
      const existingStats = await getJson(env.BOT_KV, WEBHOOK_ERROR_STATS_KEY);
      const nextStats = buildWebhookErrorStats(existingStats, record);
      await Promise.all([
        env.BOT_KV.put(LAST_WEBHOOK_ERROR_KEY, JSON.stringify(record)),
        env.BOT_KV.put(WEBHOOK_ERROR_STATS_KEY, JSON.stringify(nextStats)),
      ]);
    } catch (kvError) {
      console.error('Failed to persist webhook error', formatErrorMessage(kvError));
    }
  }
}

async function notifyWebhookError(env, error, update) {
  try {
    if (!env.BOT_TOKEN || !env.ADMIN_CHAT_ID) return;
    const adminChatId = toChatId(env.ADMIN_CHAT_ID);
    const message = update?.message || update?.edited_message || update?.callback_query?.message || null;
    await telegram(env, 'sendMessage', {
      chat_id: adminChatId,
      text: [
        '⚠️ Webhook 入站处理异常，已自动吞掉 500，避免 Telegram 持续重试。',
        `错误：${trimText(formatErrorMessage(error), 500)}`,
        `Update：${update?.update_id || '未知'}`,
        message?.chat?.id ? `来源会话：${message.chat.id}` : '',
        message?.from?.id ? `发送者：${message.from.id}` : '',
      ].filter(Boolean).join('\n'),
    });
  } catch (notifyError) {
    console.error('Failed to notify webhook error', formatErrorMessage(notifyError));
  }
}

function buildIncomingUserProfileBaseRecord(existing, message, now, options = {}) {
  const recordMessageActivity = options.recordMessageActivity !== false;
  const sender = message.from || {};
  return {
    userId: Number(message.chat.id),
    username: sender.username || existing?.username || null,
    firstName: sender.first_name || existing?.firstName || null,
    lastName: sender.last_name || existing?.lastName || null,
    displayName:
      [sender.first_name, sender.last_name].filter(Boolean).join(' ').trim() || existing?.displayName || null,
    chatType: message.chat.type || existing?.chatType || null,
    firstSeenAt: existing?.firstSeenAt || now,
    lastSeenAt: recordMessageActivity ? now : existing?.lastSeenAt || null,
    lastMessageType: recordMessageActivity ? detectMessageType(message) : existing?.lastMessageType || null,
    lastMessagePreview: recordMessageActivity ? formatMessagePreview(message) : existing?.lastMessagePreview || null,
    hasAvatar: existing?.hasAvatar || false,
    avatarFileId: existing?.avatarFileId || null,
    avatarFileUniqueId: existing?.avatarFileUniqueId || null,
    avatarFilePath: existing?.avatarFilePath || null,
    avatarUpdatedAt: existing?.avatarUpdatedAt || null,
    avatarUrl: existing?.avatarUrl || null,
    profileStatus: existing?.profileStatus || 'message-only',
    lastProfileSyncAt: existing?.lastProfileSyncAt || null,
    profileSyncError: existing?.profileSyncError || null,
    profileSource: existing?.profileSource || 'message',
    verificationStatus: existing?.verificationStatus || null,
    verificationPassedAt: existing?.verificationPassedAt || null,
    verificationClearedAt: existing?.verificationClearedAt || null,
    verificationUpdatedAt: existing?.verificationUpdatedAt || null,
  };
}

async function upsertUserProfile(env, message, options = {}) {
  if (!env.BOT_KV) return null;

  const userId = Number(message.chat.id);
  const existing = await getUserProfile(env, userId);
  const now = new Date().toISOString();
  const baseRecord = buildIncomingUserProfileBaseRecord(existing, message, now, options);

  const record = await syncTelegramProfile(env, userId, {
    existing: baseRecord,
    user: message.from || {},
    chat: message.chat,
    persist: false,
  });
  await applyResolvedVerificationStatusToProfile(env, userId, record);

  await putUserProfileIfChanged(env, userId, record, { existing });
  return record;
}

async function getUserProfile(env, userId) {
  if (!env.BOT_KV) return null;
  return getCachedJson(env, userKey(userId), USER_PROFILE_CACHE_TTL_MS);
}

function writeLocalVerificationSession(userId, state) {
  return verificationCache.writeSession(userId, state);
}

function readLocalVerificationSession(userId, token = '') {
  return verificationCache.readSession(userId, token);
}

function clearLocalVerificationSession(userId) {
  verificationCache.clearSession(userId);
}

function getLocalVerificationClearedAt(userId) {
  return verificationCache.getClearedAt(userId);
}

function getLocalVerificationPassedAt(userId, profile = null) {
  const passedAt = verificationCache.getPassedAt(userId);
  if (!passedAt) return null;
  if (isVerificationPassedAtCleared(userId, passedAt, profile)) return null;
  return passedAt;
}

function writeLocalVerificationPassed(userId, passedAt = null) {
  return verificationCache.writePassed(userId, passedAt);
}

function writeLocalVerificationCleared(userId, clearedAt = null) {
  return verificationCache.writeCleared(userId, clearedAt);
}

function isVerificationPassedAtCleared(userId, passedAt, profile = null) {
  return isPassedAtCleared(passedAt, {
    profileClearedAt: profile?.verificationClearedAt,
    localClearedAt: getLocalVerificationClearedAt(userId),
  });
}

async function markUserProfileVerificationPassed(env, userId, verifiedAt = null) {
  return markProfileVerificationPassedState({ userId, verifiedAt }, {
    hasKv: () => Boolean(env.BOT_KV),
    nowIso: () => new Date().toISOString(),
    writeLocalPassed: (id, passedAt) => writeLocalVerificationPassed(id, passedAt),
    writeD1Passed: (id, passedAt, updatedAt) => writeD1VerificationStatusPassed(env, id, passedAt, updatedAt),
    getProfile: (id) => getUserProfile(env, id),
    saveProfile: (id, profile, existing) => putUserProfileIfChanged(env, id, profile, { existing }),
  });
}

async function clearUserProfileVerificationPassed(env, userId) {
  return clearProfileVerificationPassedState({ userId }, {
    hasKv: () => Boolean(env.BOT_KV),
    nowIso: () => new Date().toISOString(),
    writeLocalCleared: (id, clearedAt) => writeLocalVerificationCleared(id, clearedAt),
    writeD1Cleared: (id, clearedAt) => writeD1VerificationStatusCleared(env, id, clearedAt),
    getProfile: (id) => getUserProfile(env, id),
    saveProfile: (id, profile, existing) => putUserProfileIfChanged(env, id, profile, { existing }),
  });
}

async function ensureVerificationStatusD1Schema(env) {
  return verificationD1Repository.ensureStatusSchema(env?.DB);
}

async function writeD1VerificationStatusPassed(env, userId, passedAt, updatedAt = null) {
  return writeVerificationStatusPassed({ userId, passedAt, updatedAt }, {
    ensureSchema: () => ensureVerificationStatusD1Schema(env),
    nowIso: () => new Date().toISOString(),
    readCache: (id) => readD1VerificationStatusCache(id),
    writeRecord: (record) => verificationD1Repository.writeStatusPassed(env.DB, record),
    writeCache: (id, record) => writeD1VerificationStatusCache(id, record),
  });
}

async function writeD1VerificationStatusCleared(env, userId, clearedAt = null) {
  return writeVerificationStatusCleared({ userId, clearedAt }, {
    ensureSchema: () => ensureVerificationStatusD1Schema(env),
    nowIso: () => new Date().toISOString(),
    readCache: (id) => readD1VerificationStatusCache(id),
    writeRecord: (record) => verificationD1Repository.writeStatusCleared(env.DB, record),
    writeCache: (id, record) => writeD1VerificationStatusCache(id, record),
  });
}

async function getD1VerificationStatus(env, userId) {
  if (!env?.DB) return null;
  const cached = readD1VerificationStatusCache(userId);
  if (cached.hit) return cached.value;
  const normalizedRecord = await verificationD1Repository.readStatus(env.DB, userId);
  if (normalizedRecord === undefined) return null;
  writeD1VerificationStatusCache(userId, normalizedRecord);
  return normalizedRecord;
}

async function getD1VerificationPassedAt(env, userId, profile = null) {
  return getVerificationPassedAtFromD1({ userId, profile }, {
    getStatus: (id) => getD1VerificationStatus(env, id),
    writeLocalCleared: (id, clearedAt) => writeLocalVerificationCleared(id, clearedAt),
    isPassedAtCleared: (id, passedAt, value) => isVerificationPassedAtCleared(id, passedAt, value),
    writeLocalPassed: (id, passedAt) => writeLocalVerificationPassed(id, passedAt),
  });
}

async function ensureVerificationSessionD1Schema(env) {
  return verificationD1Repository.ensureSessionSchema(env?.DB);
}

async function writeD1VerificationSession(env, userId, state) {
  return writeVerificationSessionToD1({ userId, state }, {
    sanitizeState: sanitizeVerificationSessionState,
    ensureSchema: () => ensureVerificationSessionD1Schema(env),
    nowMs: () => Date.now(),
    getSessionExpireMs: () => getVerifyWebSessionExpireMs(env),
    writeRecord: (record) => verificationD1Repository.writeSession(env.DB, record),
  });
}

async function getD1VerificationSession(env, userId, token = '') {
  return readVerificationSessionFromD1({ userId, token }, {
    readRecord: (id) => verificationD1Repository.readSession(env?.DB, id),
    tokensEqual: timingSafeEqualText,
    isSessionUsable: isVerificationSessionUsable,
    writeLocal: (id, state) => writeLocalVerificationSession(id, state),
    onParseError: (error) => console.warn('Failed to parse D1 verification session', formatErrorMessage(error)),
  });
}

async function clearD1VerificationSession(env, userId) {
  return (await verificationD1Repository.deleteSession(env?.DB, userId)).ok;
}

async function persistLatestVerificationSession(env, userId, state) {
  return persistLatestVerificationSessionState({ userId, state }, {
    writeLocal: (id, value) => writeLocalVerificationSession(id, value),
    writeD1: (id, value) => writeD1VerificationSession(env, id, value),
  });
}

async function clearLatestVerificationSession(env, userId) {
  return clearLatestVerificationSessionState({ userId }, {
    clearLocal: (id) => clearLocalVerificationSession(id),
    clearD1: (id) => clearD1VerificationSession(env, id),
  });
}

async function getLatestVerificationSessionState(env, userId, token = '') {
  return getLatestVerificationSession({ userId, token }, {
    readLocal: (id, value) => readLocalVerificationSession(id, value),
    readD1: (id, value) => getD1VerificationSession(env, id, value),
  });
}

async function isVerificationStateInvalidatedByD1(env, userId, state) {
  return isVerificationStateInvalidatedByD1State({ userId, state }, {
    getD1Status: (id) => getD1VerificationStatus(env, id),
    writeLocalCleared: (id, clearedAt) => writeLocalVerificationCleared(id, clearedAt),
  });
}

async function isVerificationStateActive(env, userId, state, profile = null) {
  return isVerificationStateActiveState({ userId, state, profile }, {
    isInvalidatedByProfile: isVerificationStateInvalidatedByProfile,
    isInvalidatedByD1: (id, value) => isVerificationStateInvalidatedByD1(env, id, value),
    writeLocalPassed: (id, passedAt) => writeLocalVerificationPassed(id, passedAt),
  });
}

async function resolveVerificationPassedAt(env, userId, profile = null) {
  return resolveVerificationPassedAtState({ userId, profile }, {
    getProfilePassedAt: getProfileVerificationPassedAt,
    isPassedAtCleared: (id, passedAt, value) => isVerificationPassedAtCleared(id, passedAt, value),
    writeLocalPassed: (id, passedAt) => writeLocalVerificationPassed(id, passedAt),
    getLocalPassedAt: (id, value) => getLocalVerificationPassedAt(id, value),
    getD1PassedAt: (id, value) => getD1VerificationPassedAt(env, id, value),
  });
}

async function applyResolvedVerificationStatusToProfile(env, userId, profile) {
  return applyResolvedVerificationStatusToProfileState({ userId, profile }, {
    isVerificationEnabled: () => isUserVerificationEnabled(env),
    resolvePassedAt: (id, value) => resolveVerificationPassedAt(env, id, value),
    getLocalClearedAt: (id) => getLocalVerificationClearedAt(id),
    nowIso: () => new Date().toISOString(),
  });
}

async function repairVerificationStateFromProfile(env, userId, state = null, profile = null) {
  return repairVerificationStateFromProfileState({ userId, state, profile }, {
    resolvePassedAt: (id, value) => resolveVerificationPassedAt(env, id, value),
    nowIso: () => new Date().toISOString(),
    saveState: (id, nextState, existing) => putVerificationState(env, id, nextState, { existing }),
    clearLatest: (id) => clearLatestVerificationSession(env, id),
    markProfilePassed: (id, passedAt) => markUserProfileVerificationPassed(env, id, passedAt),
    clearPrompt: (id, promptMessageId) => clearVerificationPromptMessage(
      env,
      id,
      promptMessageId,
      '✅ 验证已通过，当前验证入口已自动失效。',
    ),
  });
}

async function resetVerificationStateAfterProfileRevocation(env, userId, state = null) {
  return resetVerificationStateAfterProfileRevocationState({ userId, state }, {
    nowIso: () => new Date().toISOString(),
    saveState: (id, nextState, existing) => putVerificationState(env, id, nextState, { existing }),
    clearLatest: (id) => clearLatestVerificationSession(env, id),
  });
}

async function listUsers(env, requestedLimit = 50) {
  const page = await listUsersPage(env, { limit: requestedLimit, offset: 0 });
  return page.items;
}

async function getUserListSnapshot(env) {
  const cached = readTimedCacheValue(userListSnapshotCache, USER_LIST_SNAPSHOT_CACHE_KEY);
  if (cached) {
    return cached;
  }

  const names = await collectKvKeys(env.BOT_KV, 'user:');
  const users = await Promise.all(names.map((name) => getCachedJson(env, name, USER_PROFILE_CACHE_TTL_MS)));
  const enriched = await Promise.all(
    users.filter(Boolean).map(async (item) => {
      const [blacklist, trust, verifyState] = await Promise.all([
        getBlacklistEntry(env, item.userId),
        getTrustEntry(env, item.userId),
        getUserVerificationState(env, item.userId),
      ]);

      const profileVerified = isProfileVerificationPassed(item);
      const verified = Boolean(verifyState?.verified || profileVerified);

      return {
        ...item,
        displayName: item.displayName || buildDisplayName(item) || `用户 ${item.userId}`,
        profileStatus: item.profileStatus || 'message-only',
        blacklisted: Boolean(blacklist),
        blacklistReason: blacklist?.reason || null,
        trusted: Boolean(trust),
        trustNote: trust?.note || null,
        verified,
        verificationStatus:
          verified
            ? 'verified'
            : verifyState?.challenge || verifyState?.sessionToken || verifyState?.stage
              ? 'pending'
              : 'unknown',
      };
    }),
  );

  const sorted = enriched.sort((a, b) => String(b.lastSeenAt || '').localeCompare(String(a.lastSeenAt || '')));
  const snapshot = {
    sorted,
    summary: {
      total: sorted.length,
      blacklisted: sorted.filter((item) => item.blacklisted).length,
      trusted: sorted.filter((item) => item.trusted).length,
      verified: sorted.filter((item) => item.verified).length,
    },
  };
  writeTimedCacheValue(
    userListSnapshotCache,
    USER_LIST_SNAPSHOT_CACHE_KEY,
    snapshot,
    USER_LIST_SNAPSHOT_CACHE_TTL_MS,
  );
  return snapshot;
}

function parseD1JsonValue(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

async function isDirectoryIndexReady(env) {
  if (!env?.BOT_KV || !env?.DB) return false;
  const state = await getJson(env.BOT_KV, DIRECTORY_INDEX_BACKFILL_KEY);
  return state?.version === 1 && state?.status === 'complete';
}

async function listUsersPageFromD1(env, options = {}) {
  if (!env?.DB || !(await ensureDirectoryD1Schema(env))) return null;
  const limit = clamp(Math.floor(Number(options.limit) || 50), 1, MAX_LIST_LIMIT);
  const offset = Math.max(0, Math.floor(Number(options.offset) || 0));

  try {
    const [summaryRow, pageResult] = await Promise.all([
      env.DB.prepare(
        `SELECT
           COUNT(d.user_id) AS total,
           SUM(CASE WHEN b.user_id IS NOT NULL THEN 1 ELSE 0 END) AS blacklisted,
           SUM(CASE WHEN t.user_id IS NOT NULL THEN 1 ELSE 0 END) AS trusted,
           SUM(CASE WHEN json_extract(d.profile_json, '$.verificationStatus') = 'verified' THEN 1 ELSE 0 END) AS verified
         FROM user_directory d
         LEFT JOIN user_moderation_index b ON b.user_id = d.user_id AND b.kind = 'blacklist'
         LEFT JOIN user_moderation_index t ON t.user_id = d.user_id AND t.kind = 'trust'`,
      ).first(),
      env.DB.prepare(
        `SELECT
           d.profile_json AS profileJson,
           b.entry_json AS blacklistJson,
           t.entry_json AS trustJson
         FROM user_directory d
         LEFT JOIN user_moderation_index b ON b.user_id = d.user_id AND b.kind = 'blacklist'
         LEFT JOIN user_moderation_index t ON t.user_id = d.user_id AND t.kind = 'trust'
         ORDER BY COALESCE(d.last_seen_at, '') DESC, d.user_id DESC
         LIMIT ?1 OFFSET ?2`,
      ).bind(limit, offset).all(),
    ]);

    const rows = Array.isArray(pageResult?.results) ? pageResult.results : [];
    const items = await Promise.all(rows.map(async (row) => {
      const profile = parseD1JsonValue(row.profileJson);
      if (!profile?.userId) return null;
      const blacklist = parseD1JsonValue(row.blacklistJson);
      const trust = parseD1JsonValue(row.trustJson);
      const verifyState = await getUserVerificationState(env, profile.userId);
      const verified = Boolean(verifyState?.verified || isProfileVerificationPassed(profile));
      return {
        ...profile,
        displayName: profile.displayName || buildDisplayName(profile) || `用户 ${profile.userId}`,
        profileStatus: profile.profileStatus || 'message-only',
        blacklisted: Boolean(blacklist),
        blacklistReason: blacklist?.reason || null,
        trusted: Boolean(trust),
        trustNote: trust?.note || null,
        verified,
        verificationStatus:
          verified
            ? 'verified'
            : verifyState?.challenge || verifyState?.sessionToken || verifyState?.stage
              ? 'pending'
              : 'unknown',
      };
    }));

    const total = Number(summaryRow?.total || 0);
    const nextOffset = offset + limit < total ? offset + limit : null;
    return {
      items: items.filter(Boolean),
      summary: {
        total,
        blacklisted: Number(summaryRow?.blacklisted || 0),
        trusted: Number(summaryRow?.trusted || 0),
        verified: Number(summaryRow?.verified || 0),
      },
      total,
      limit,
      offset,
      nextOffset,
      prevOffset: offset > 0 ? Math.max(0, offset - limit) : null,
      hasMore: nextOffset !== null,
      source: 'd1',
    };
  } catch (error) {
    console.warn('Failed to list users from D1 directory; falling back to KV', formatErrorMessage(error));
    return null;
  }
}

async function listUsersPage(env, options = {}) {
  const limit = clamp(Math.floor(Number(options.limit) || 50), 1, MAX_LIST_LIMIT);
  const offset = Math.max(0, Math.floor(Number(options.offset) || 0));
  if (!env.BOT_KV) {
    return {
      items: [],
      summary: {
        total: 0,
        blacklisted: 0,
        trusted: 0,
        verified: 0,
      },
      total: 0,
      limit,
      offset,
      nextOffset: null,
      prevOffset: offset > 0 ? Math.max(0, offset - limit) : null,
      hasMore: false,
    };
  }

  if (await isDirectoryIndexReady(env)) {
    const d1Page = await listUsersPageFromD1(env, { limit, offset });
    if (d1Page) return d1Page;
  }

  const { sorted, summary } = await getUserListSnapshot(env);
  const total = sorted.length;
  const items = sorted.slice(offset, offset + limit);
  const nextOffset = offset + limit < total ? offset + limit : null;
  const prevOffset = offset > 0 ? Math.max(0, offset - limit) : null;

  return {
    items,
    summary,
    total,
    limit,
    offset,
    nextOffset,
    prevOffset,
    hasMore: nextOffset !== null,
  };
}

async function getBlacklistEntry(env, userId) {
  if (!env.BOT_KV) return null;
  return getCachedJson(env, blacklistKey(userId), HOT_KV_JSON_CACHE_TTL_MS);
}

async function setBlacklistEntry(env, userId, payload) {
  ensureKv(env);
  const profile = await getUserProfile(env, userId);
  const entry = {
    userId: Number(userId),
    reason: payload.reason || '管理员封禁',
    createdAt: payload.createdAt || new Date().toISOString(),
    createdBy: payload.createdBy || 'unknown',
    displayName: profile?.displayName || null,
    username: profile?.username || null,
  };
  await putJsonIfChanged(env, blacklistKey(userId), entry, {
    ttlMs: HOT_KV_JSON_CACHE_TTL_MS,
  });
  await writeD1ModerationIndex(env, 'blacklist', entry);
  return entry;
}

async function deleteBlacklistEntry(env, userId) {
  ensureKv(env);
  const key = blacklistKey(userId);
  await env.BOT_KV.delete(key);
  noteKvJsonDelete(key);
  await deleteD1DirectoryEntries(env, userId, 'blacklist');
}

function buildOffsetPage(items, total, limit, offset, source) {
  const nextOffset = offset + limit < total ? offset + limit : null;
  return {
    items,
    total,
    limit,
    offset,
    nextOffset,
    prevOffset: offset > 0 ? Math.max(0, offset - limit) : null,
    hasMore: nextOffset !== null,
    source,
  };
}

function enrichModerationItem(entry, profile) {
  return {
    ...entry,
    displayName: entry.displayName || profile?.displayName || buildDisplayName(profile) || `用户 ${entry.userId}`,
    username: entry.username || profile?.username || null,
    firstName: profile?.firstName || null,
    lastName: profile?.lastName || null,
    hasAvatar: Boolean(profile?.hasAvatar),
    avatarUrl: profile?.avatarUrl || null,
    profileStatus: profile?.profileStatus || 'message-only',
  };
}

async function listModerationIndexPageFromD1(env, kind, options = {}) {
  if (!env?.DB || !(await ensureDirectoryD1Schema(env))) return null;
  const limit = clamp(Math.floor(Number(options.limit) || 50), 1, MAX_LIST_LIMIT);
  const offset = Math.max(0, Math.floor(Number(options.offset) || 0));
  try {
    const [countRow, result] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) AS total FROM user_moderation_index WHERE kind = ?1')
        .bind(String(kind))
        .first(),
      env.DB.prepare(
        `SELECT m.entry_json AS entryJson, d.profile_json AS profileJson
         FROM user_moderation_index m
         LEFT JOIN user_directory d ON d.user_id = m.user_id
         WHERE m.kind = ?1
         ORDER BY COALESCE(m.created_at, '') DESC, m.user_id DESC
         LIMIT ?2 OFFSET ?3`,
      ).bind(String(kind), limit, offset).all(),
    ]);
    const rows = Array.isArray(result?.results) ? result.results : [];
    const items = rows.map((row) => {
      const entry = parseD1JsonValue(row.entryJson) || {};
      const profile = parseD1JsonValue(row.profileJson) || {};
      return enrichModerationItem(entry, profile);
    });
    return buildOffsetPage(items, Number(countRow?.total || 0), limit, offset, 'd1');
  } catch (error) {
    console.warn(`Failed to list ${kind} from D1 directory; falling back to KV`, formatErrorMessage(error));
    return null;
  }
}

async function listModerationPageFromKv(env, prefix, options = {}) {
  const limit = clamp(Math.floor(Number(options.limit) || 50), 1, MAX_LIST_LIMIT);
  const offset = Math.max(0, Math.floor(Number(options.offset) || 0));
  const names = await collectKvKeys(env.BOT_KV, prefix);
  const entries = await Promise.all(names.map((name) => getCachedJson(env, name, HOT_KV_JSON_CACHE_TTL_MS)));
  const enriched = await Promise.all(entries.filter(Boolean).map(async (entry) => (
    enrichModerationItem(entry, await getUserProfile(env, entry.userId))
  )));
  const sorted = enriched.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return buildOffsetPage(sorted.slice(offset, offset + limit), sorted.length, limit, offset, 'kv');
}

async function listBlacklistPage(env, options = {}) {
  if (!env.BOT_KV) return buildOffsetPage([], 0, 50, 0, 'kv');
  if (await isDirectoryIndexReady(env)) {
    const d1Page = await listModerationIndexPageFromD1(env, 'blacklist', options);
    if (d1Page) return d1Page;
  }
  return listModerationPageFromKv(env, 'blacklist:', options);
}

async function listBlacklist(env, requestedLimit = 50) {
  return (await listBlacklistPage(env, { limit: requestedLimit, offset: 0 })).items;
}

async function listTrustPage(env, options = {}) {
  if (!env.BOT_KV) return buildOffsetPage([], 0, 50, 0, 'kv');
  if (await isDirectoryIndexReady(env)) {
    const d1Page = await listModerationIndexPageFromD1(env, 'trust', options);
    if (d1Page) return d1Page;
  }
  return listModerationPageFromKv(env, 'trust:', options);
}

async function listTrust(env, requestedLimit = 50) {
  return (await listTrustPage(env, { limit: requestedLimit, offset: 0 })).items;
}

async function getTrustEntry(env, userId) {
  if (!env.BOT_KV) return null;
  return getCachedJson(env, trustKey(userId), HOT_KV_JSON_CACHE_TTL_MS);
}

async function setTrustEntry(env, userId, payload) {
  ensureKv(env);
  const profile = await getUserProfile(env, userId);
  const entry = {
    userId: Number(userId),
    note: payload.note || '管理员加入白名单',
    createdAt: payload.createdAt || new Date().toISOString(),
    createdBy: payload.createdBy || 'unknown',
    displayName: profile?.displayName || null,
    username: profile?.username || null,
  };
  await putJsonIfChanged(env, trustKey(userId), entry, {
    ttlMs: HOT_KV_JSON_CACHE_TTL_MS,
  });
  await writeD1ModerationIndex(env, 'trust', entry);
  return entry;
}

async function deleteTrustEntry(env, userId) {
  ensureKv(env);
  const key = trustKey(userId);
  await env.BOT_KV.delete(key);
  noteKvJsonDelete(key);
  await deleteD1DirectoryEntries(env, userId, 'trust');
}

async function setAuthorizedAdmin(env, userId, payload) {
  ensureKv(env);
  const profile = await syncTelegramProfile(env, userId, {
    existing: (await getUserProfile(env, userId)) || { userId: Number(userId) },
    adminChatId: env.ADMIN_CHAT_ID,
  });
  const entry = {
    userId: Number(userId),
    note: payload.note || null,
    createdAt: payload.createdAt || new Date().toISOString(),
    createdBy: payload.createdBy || 'unknown',
    source: 'kv',
    displayName: profile?.displayName || buildDisplayName(profile) || null,
    username: profile?.username || null,
    firstName: profile?.firstName || null,
    lastName: profile?.lastName || null,
    avatarUrl: profile?.avatarUrl || null,
    hasAvatar: Boolean(profile?.hasAvatar),
    profileStatus: profile?.profileStatus || 'message-only',
  };
  await putJsonIfChanged(env, adminKey(userId), entry, {
    ttlMs: AUTHORIZED_ADMIN_CACHE_TTL_MS,
  });
  return entry;
}

async function deleteAuthorizedAdmin(env, userId) {
  if (!env.BOT_KV) return;
  const key = adminKey(userId);
  await env.BOT_KV.delete(key);
  noteKvJsonDelete(key);
}

async function getAuthorizedAdminEntry(env, userId) {
  if (!env.BOT_KV) return null;
  return getCachedJson(env, adminKey(userId), AUTHORIZED_ADMIN_CACHE_TTL_MS);
}

async function isAuthorizedAdmin(env, userId) {
  if (isRootAdmin(env, userId)) {
    return true;
  }

  const entry = await getAuthorizedAdminEntry(env, userId);
  if (entry) {
    return true;
  }

  const adminChatId = Number(env.ADMIN_CHAT_ID);
  if (Number.isFinite(adminChatId) && adminChatId < 0 && Number(userId) > 0) {
    return isTelegramGroupAdmin(env, adminChatId, Number(userId));
  }

  return false;
}

async function listAuthorizedAdmins(env, requestedLimit = 50) {
  const limit = clamp(requestedLimit, 1, MAX_LIST_LIMIT);
  const rootEntries = getRootAdminIds(env).map((userId) => ({
    userId,
    note: '根管理员',
    source: 'root-env',
  }));
  const groupEntries = await getDynamicGroupAdminEntries(env);

  if (!env.BOT_KV) {
    return [...rootEntries, ...groupEntries].slice(0, limit);
  }

  const names = await collectKvKeys(env.BOT_KV, 'admin:');
  const kvEntries = (await Promise.all(names.map((name) => getCachedJson(env, name, AUTHORIZED_ADMIN_CACHE_TTL_MS))))
    .filter((item) => item && Number.isFinite(Number(item.userId)))
    .map((item) => ({
      ...item,
      userId: Number(item.userId),
      source: item.source || 'kv',
    }));

  const merged = new Map();
  for (const item of [...rootEntries, ...groupEntries, ...kvEntries]) {
    merged.set(Number(item.userId), item);
  }

  const enriched = await Promise.all(
    Array.from(merged.values()).map(async (item) => {
      const profile = await syncTelegramProfile(env, item.userId, {
        existing: (await getUserProfile(env, item.userId)) || item,
        adminChatId: env.ADMIN_CHAT_ID,
      });

      return {
        ...item,
        displayName: item.displayName || profile?.displayName || buildDisplayName(profile) || `管理员 ${item.userId}`,
        username: item.username || profile?.username || null,
        firstName: item.firstName || profile?.firstName || null,
        lastName: item.lastName || profile?.lastName || null,
        avatarUrl: item.avatarUrl || profile?.avatarUrl || null,
        hasAvatar: item.hasAvatar || Boolean(profile?.hasAvatar),
        profileStatus: item.profileStatus || profile?.profileStatus || 'message-only',
      };
    }),
  );

  return enriched.sort((a, b) => Number(a.userId) - Number(b.userId)).slice(0, limit);
}

async function getDynamicGroupAdminEntries(env) {
  const adminChatId = Number(env.ADMIN_CHAT_ID);
  if (!(Number.isFinite(adminChatId) && adminChatId < 0) || !env.BOT_TOKEN) {
    return [];
  }

  try {
    const members = await getAdminChatMembers(env, adminChatId);

    const result = [];
    for (const item of members) {
      const userId = Number(item?.user?.id);
      if (!(Number.isFinite(userId) && userId > 0)) continue;
      const profile = await syncTelegramProfile(env, userId, {
        user: item?.user || {},
        adminChatId,
      });
      result.push({
        userId,
        note: item?.status === 'creator' ? '群主管理员' : '群管理员',
        source: 'group-admin',
        createdAt: null,
        displayName: profile?.displayName || buildDisplayName(profile) || null,
        username: profile?.username || null,
        firstName: profile?.firstName || null,
        lastName: profile?.lastName || null,
        avatarUrl: profile?.avatarUrl || null,
        hasAvatar: Boolean(profile?.hasAvatar),
        profileStatus: profile?.profileStatus || 'message-only',
      });
    }

    return result;
  } catch (error) {
    return [];
  }
}

function getCommandAdminChatIds(env) {
  const chatId = env.ADMIN_CHAT_ID ? Number(env.ADMIN_CHAT_ID) : 0;
  if (!Number.isFinite(chatId) || chatId <= 0) return [];
  return [chatId];
}

function getCommandGroupChatIdsForCleanup(env) {
  const chatId = env.ADMIN_CHAT_ID ? Number(env.ADMIN_CHAT_ID) : 0;
  if (!Number.isFinite(chatId) || chatId >= 0) return [];
  return [chatId];
}

async function getCommandAdminUserIds(env) {
  const admins = await listAuthorizedAdmins(env, MAX_LIST_LIMIT);
  const configuredIds = admins
    .map((item) => Number(item.userId))
    .filter((userId) => Number.isFinite(userId) && userId > 0);

  const groupAdminIds = [];
  const adminChatId = env.ADMIN_CHAT_ID ? Number(env.ADMIN_CHAT_ID) : 0;
  if (Number.isFinite(adminChatId) && adminChatId < 0 && env.BOT_TOKEN) {
    try {
      const members = await getAdminChatMembers(env, adminChatId);
      groupAdminIds.push(
        ...members
          .map((item) => Number(item?.user?.id))
          .filter((userId, index, arr) => Number.isFinite(userId) && userId > 0 && !arr.slice(0, index).includes(userId)),
      );
    } catch (error) {
      // ignore group admin lookup failures and fall back to configured IDs
    }
  }

  return Array.from(new Set([...configuredIds, ...groupAdminIds]));
}

function formatUserActionCardText(userId, profile = null) {
  const name = profile?.displayName || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim() || '';
  const username = profile?.username ? `@${profile.username}` : '';
  const lines = [
    '用户快捷操作',
    `#UID:${userId}`,
    [name ? `用户：${name}` : '', username, `ID:${userId}`].filter(Boolean).join(' | '),
    '可使用下方按钮查看资料、封禁/解封、信任或重新验证。',
  ].filter(Boolean);
  return lines.join('\n');
}

async function sendUserActionCard(env, message, userId) {
  const profile = await getUserProfile(env, userId);
  const payload = {
    chat_id: message.chat.id,
    text: formatUserActionCardText(userId, profile),
    reply_markup: buildAdminActionKeyboard(userId),
  };
  if (message.message_thread_id) {
    payload.message_thread_id = message.message_thread_id;
  }
  return telegramWithThreadFallback(env, 'sendMessage', payload);
}

async function markUserTopicMetaSent(env, topicRecord, sentMessage = null) {
  if (!env?.BOT_KV || !topicRecord?.userId || !topicRecord?.threadId) return;
  if (topicRecord.adminMetaSentAt) return;

  const persistedTopicRecord = { ...topicRecord };
  delete persistedTopicRecord._createdNow;
  const now = new Date().toISOString();
  const next = {
    ...persistedTopicRecord,
    adminMetaSentAt: now,
    adminMetaMessageId: Number(sentMessage?.message_id || 0) || null,
    updatedAt: now,
  };

  Object.assign(topicRecord, next);
  await putJsonIfChanged(env, topicUserKey(topicRecord.userId), next, {
    existing: persistedTopicRecord,
    ttlMs: TOPIC_MAPPING_CACHE_TTL_MS,
  });
}

async function ensureUserTopic(env, message, adminChatId) {
  ensureKv(env);

  const userId = Number(message.chat.id);
  const existing = await getTopicByUser(env, userId);
  if (existing?.threadId) {
    return existing;
  }

  let created;
  try {
    created = await telegram(env, 'createForumTopic', {
      chat_id: adminChatId,
      name: buildTopicName(message.from || {}, message.chat),
    });
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    throw new AppError(
      500,
      `话题模式创建失败：${raw}。请确认 ADMIN_CHAT_ID 指向已开启话题功能的 Telegram 超级群组，并已绑定 BOT_KV。`,
    );
  }

  const record = {
    userId,
    threadId: Number(created.message_thread_id),
    topicName: created.name || buildTopicName(message.from || {}, message.chat),
    chatId: Number(adminChatId),
    createdAt: new Date().toISOString(),
  };

  await putJsonIfChanged(env, topicUserKey(userId), record, {
    ttlMs: TOPIC_MAPPING_CACHE_TTL_MS,
  });
  await putJsonIfChanged(
    env,
    topicThreadKey(record.threadId),
    {
      threadId: record.threadId,
      userId,
      createdAt: record.createdAt,
    },
    {
      ttlMs: TOPIC_MAPPING_CACHE_TTL_MS,
    },
  );

  return { ...record, _createdNow: true };
}

async function getTopicByUser(env, userId) {
  if (!env.BOT_KV) return null;
  return getCachedJson(env, topicUserKey(userId), TOPIC_MAPPING_CACHE_TTL_MS);
}

async function getUserIdByThread(env, threadId) {
  if (!env.BOT_KV) return null;
  const record = await getCachedJson(env, topicThreadKey(threadId), TOPIC_MAPPING_CACHE_TTL_MS);
  return record?.userId ? Number(record.userId) : null;
}

async function getUserVerificationState(env, userId) {
  if (!env.BOT_KV) return null;
  return getCachedJson(env, verifyKey(userId), VERIFY_STATE_CACHE_TTL_MS);
}

async function createOrRefreshVerificationWebSession(env, userId, options = {}) {
  ensureKv(env);
  return createOrRefreshVerificationWebSessionState(
    { userId, forceNew: options.forceNew },
    {
      getState: (id) => getUserVerificationState(env, id),
      getFlowMode: () => getVerificationFlowMode(env),
      getProfile: (id) => getUserProfile(env, id),
      isStateActive: (id, state, profile) => isVerificationStateActive(env, id, state, profile),
      isProfilePassed: isProfileVerificationPassed,
      markProfilePassed: (id, passedAt) => markUserProfileVerificationPassed(env, id, passedAt),
      resetAfterRevocation: (id, state) => resetVerificationStateAfterProfileRevocation(env, id, state),
      repairFromProfile: (id, state, profile) => repairVerificationStateFromProfile(env, id, state, profile),
      nowMs: () => Date.now(),
      ensureProof: (id, state) => ensureVerificationSliderProofState(env, id, state),
      deletePrompt: (id, messageId) => deleteVerificationPromptMessage(env, id, messageId),
      createSessionToken,
      getSessionExpireMs: () => getVerifyWebSessionExpireMs(env),
      createSliderChallenge: createSliderChallengeForWebVerification,
      createGridChallenge: createGridChallengeForWebVerification,
      createChoiceChallenge: createNumericChoiceChallenge,
      saveState: (id, state, existing) => putVerificationState(env, id, state, { existing }),
      persistLatest: (id, state) => persistLatestVerificationSession(env, id, state),
    },
  );
}

async function ensureVerificationSliderProofState(env, userId, state) {
  if (state?.stage !== 'slider' || !state?.slider || state.slider.submitNonce) {
    return state;
  }

  const nextState = {
    ...state,
    slider: {
      ...(state.slider || {}),
      submitNonce: createChallengeToken(),
      submitNonceIssuedAt: new Date().toISOString(),
    },
    updatedAt: new Date().toISOString(),
  };
  await putVerificationState(env, userId, nextState, { existing: state });
  await persistLatestVerificationSession(env, userId, nextState);
  return nextState;
}

function getVerificationBaseUrl(env = null, fallbackBaseUrl = '') {
  const custom = normalizeVerificationBaseUrl(env?.VERIFY_PUBLIC_BASE_URL || '');
  if (custom) return custom;
  return normalizeVerificationBaseUrl(fallbackBaseUrl || env?.PUBLIC_BASE_URL || '');
}

async function buildVerificationSessionPayload(state, env, publicBaseUrl = '') {
  return buildVerificationSessionPayloadResponse(
    { state, publicBaseUrl },
    {
      nowMs: () => Date.now(),
      getMaxAttempts: () => getVerifyStageMaxAttempts(env),
      createChoiceChallenge: createNumericChoiceChallenge,
      buildChoiceImage: (choice, baseUrl) => buildVerificationImageUrl(
        choice,
        getVerificationBaseUrl(env, baseUrl || env?.PUBLIC_BASE_URL || ''),
      ),
      createSliderChallenge: createSliderChallengeForWebVerification,
      buildSliderProof: (proofState, slider) => buildSliderSubmitProof(
        proofState,
        slider,
        getVerificationProofSecret(env, proofState),
      ),
      buildRotationImage: (slider) => buildRotationCaptchaDataUrl(slider, { drawChar }),
      buildPuzzleImage: buildSliderBackgroundDataUrl,
      createGridChallenge: createGridChallengeForWebVerification,
    },
  );
}

async function sendVerificationWebPrompt(env, userId, state, publicBaseUrl = '', forceNewMessage = false) {
  return sendVerificationWebPromptRequest(
    {
      userId,
      state,
      publicBaseUrl: getVerificationBaseUrl(env, publicBaseUrl || env.PUBLIC_BASE_URL || ''),
      verifyPath: VERIFY_WEB_PATH,
      forceNewMessage,
    },
    {
      getMaxAttempts: () => getVerifyStageMaxAttempts(env),
      getRetryBlockMs: () => getVerifyRetryBlockMs(env),
      persistLatest: (id, value) => persistLatestVerificationSession(env, id, value),
      editMessage: (payload) => telegram(env, 'editMessageText', payload),
      sendMessage: (payload) => telegram(env, 'sendMessage', payload),
      setPromptMessageId: (id, messageId) => setVerificationPromptMessageId(env, id, messageId),
    },
  );
}

async function handleVerificationApiRequest(request, url, env, publicBaseUrl = '') {
  if (!isUserVerificationEnabled(env)) {
    throw new AppError(403, '当前未开启验证');
  }
  ensureKv(env);
  const noCacheHeaders = {
    'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
    pragma: 'no-cache',
    expires: '0',
  };

  const body = await readJsonBody(request);
  const result = await dispatchVerificationApiRoute(
    {
      pathname: url.pathname,
      prefix: VERIFY_API_PREFIX,
      env,
      body,
      publicBaseUrl,
    },
    {
      session: handleVerificationSessionApi,
      slider: handleVerificationSliderApi,
      grid: handleVerificationGridApi,
      choice: handleVerificationChoiceApi,
    },
  );
  if (result) {
    return json({ ok: true, ...result }, 200, noCacheHeaders, request);
  }

  throw new AppError(404, '未找到验证接口');
}

function parseVerificationApiIdentity(body) {
  const userId = Number(body?.userId ?? body?.uid);
  if (!(Number.isInteger(userId) && userId > 0)) {
    throw new AppError(400, 'userId 无效');
  }
  const token = String(body?.token || '').trim();
  if (!token) {
    throw new AppError(400, '缺少验证令牌');
  }
  return { userId, token };
}

async function loadVerificationSubmissionContext(env, body) {
  return loadVerificationApiContext(
    { body },
    {
      parseIdentity: parseVerificationApiIdentity,
      getState: (userId) => getUserVerificationState(env, userId),
      getLatestSession: (userId, token) => getLatestVerificationSessionState(env, userId, token),
      putState: (userId, state, existing) => putVerificationState(env, userId, state, { existing }),
      tokensEqual: timingSafeEqualText,
      isExpired: isVerificationSessionExpired,
      error: (status, message) => new AppError(status, message),
    },
  );
}

async function handleVerificationSessionApi(env, body, publicBaseUrl = '') {
  return handleVerificationSessionApiRequest(
    { body, publicBaseUrl },
    {
      parseIdentity: parseVerificationApiIdentity,
      getState: (userId) => getUserVerificationState(env, userId),
      getLatestSession: (userId, token) => getLatestVerificationSessionState(env, userId, token),
      putState: (userId, state, existing) => putVerificationState(env, userId, state, { existing }),
      tokensEqual: timingSafeEqualText,
      now: () => Date.now(),
      isExpired: isVerificationSessionExpired,
      ensureProof: (userId, state) => ensureVerificationSliderProofState(env, userId, state),
      buildPayload: (state, baseUrl) => buildVerificationSessionPayload(state, env, baseUrl),
      error: (status, message) => new AppError(status, message),
    },
  );
}

async function handleVerificationSliderApi(env, body, publicBaseUrl = '') {
  return handleVerificationSliderApiRequest(
    { body, publicBaseUrl },
    {
      loadContext: (value) => loadVerificationSubmissionContext(env, value),
      buildPayload: (state, baseUrl) => buildVerificationSessionPayload(state, env, baseUrl),
      ensureProof: (userId, state) => ensureVerificationSliderProofState(env, userId, state),
      validateAttempt: (state, value) => validateSliderAttemptHuman(
        {
          state,
          body: value,
          minSliderTimeMs: getVerifyMinSliderTimeMs(env),
          sliderTolerance: getVerifySliderTolerance(env),
          rotationTolerance: getVerifyRotationTolerance(env),
        },
        {
          validateProof: (proofState, slider, proofBody) => validateSliderSubmitProof({
            state: proofState,
            slider,
            body: proofBody,
            secret: getVerificationProofSecret(env, proofState),
            nowMs: Date.now(),
            sessionExpireMs: getVerifyWebSessionExpireMs(env),
          }),
        },
      ),
      nowMs: () => Date.now(),
      getSessionExpireMs: () => getVerifyWebSessionExpireMs(env),
      nowIso: () => new Date().toISOString(),
      createNonce: createChallengeToken,
      getMaxAttempts: () => getVerifyStageMaxAttempts(env),
      lock: (userId, state, details) => lockVerificationAndReport(env, userId, state, details),
      saveState: (userId, state, existing) => putVerificationState(env, userId, state, { existing }),
      persistLatest: (userId, state) => persistLatestVerificationSession(env, userId, state),
    },
  );
}

async function handleVerificationGridApi(env, body, publicBaseUrl = '') {
  return handleVerificationGridApiRequest(
    { body, publicBaseUrl },
    {
      loadContext: (value) => loadVerificationSubmissionContext(env, value),
      buildPayload: (state, baseUrl) => buildVerificationSessionPayload(state, env, baseUrl),
      approve: (userId, source, options) => adminApproveUserVerification(env, userId, source, options),
      getMaxAttempts: () => getVerifyStageMaxAttempts(env),
      nowIso: () => new Date().toISOString(),
      lock: (userId, state, details) => lockVerificationAndReport(env, userId, state, details),
      saveState: (userId, state, existing) => putVerificationState(env, userId, state, { existing }),
      persistLatest: (userId, state) => persistLatestVerificationSession(env, userId, state),
    },
  );
}

async function handleVerificationChoiceApi(env, body, publicBaseUrl = '') {
  return handleVerificationChoiceApiRequest(
    { body, publicBaseUrl },
    {
      loadContext: (value) => loadVerificationSubmissionContext(env, value),
      buildPayload: (state, baseUrl) => buildVerificationSessionPayload(state, env, baseUrl),
      answersEqual: timingSafeEqualText,
      approve: (userId, source, options) => adminApproveUserVerification(env, userId, source, options),
      getMaxAttempts: () => getVerifyStageMaxAttempts(env),
      nowIso: () => new Date().toISOString(),
      lock: (userId, state, details) => lockVerificationAndReport(env, userId, state, details),
      saveState: (userId, state, existing) => putVerificationState(env, userId, state, { existing }),
      persistLatest: (userId, state) => persistLatestVerificationSession(env, userId, state),
    },
  );
}

async function lockVerificationAndReport(env, userId, state, detail = {}) {
  return lockVerificationAndReportState(
    { userId, state, detail },
    {
      nowMs: () => Date.now(),
      getRetryBlockMs: () => getVerifyRetryBlockMs(env),
      saveState: (id, value, existing) => putVerificationState(env, id, value, { existing }),
      clearLatest: (id) => clearLatestVerificationSession(env, id),
      notifyUser: (id, blockedUntil) => telegram(env, 'sendMessage', {
        chat_id: id,
        text: `验证失败次数超过限制，已锁定。请在 ${blockedUntil} 后重试。`,
      }),
      reportFailure: (id, value) => reportVerificationFailureToTopic(env, id, value),
    },
  );
}

async function reportVerificationFailureToTopic(env, userId, state) {
  return reportVerificationFailureToAdmin(
    { userId, state },
    {
      getProfile: (id) => getUserProfile(env, id),
      getAdminChatId: () => toChatId(env.ADMIN_CHAT_ID),
      getTopicId: () => getVerifyFailTopicId(env),
      getMaxAttempts: () => getVerifyStageMaxAttempts(env),
      sendMessage: (payload) => telegramWithThreadFallback(env, 'sendMessage', payload),
    },
  );
}

async function adminApproveUserVerification(env, userId, operator = 'unknown', options = {}) {
  ensureKv(env);
  return approveUserVerificationState({ userId, operator, options }, {
    getState: (id) => getUserVerificationState(env, id),
    nowIso: () => new Date().toISOString(),
    markProfilePassed: (id, timestamp) => markUserProfileVerificationPassed(env, id, timestamp),
    getObserveMessageCount: () => getVerifyObserveMessageCount(env),
    saveState: (id, state, existing) => putVerificationState(env, id, state, { existing }),
    clearLatest: (id) => clearLatestVerificationSession(env, id),
    clearPrompt: (id, promptMessageId) => clearVerificationPromptMessage(env, id, promptMessageId, '✅ 验证通过，已解除发送限制。'),
    notifyUser: (id) => sendWelcomeMessage(env, id, {
      extraText: '✅ 验证通过，现在可以正常发消息。',
    }),
  });
}

async function setVerificationPromptMessageId(env, userId, messageId) {
  if (!env.BOT_KV) return;
  return setVerificationPromptMessageIdState(
    { userId, messageId },
    {
      getState: (id) => getUserVerificationState(env, id),
      getProfile: (id) => getUserProfile(env, id),
      isStateActive: (id, state, profile) => isVerificationStateActive(env, id, state, profile),
      isProfilePassed: isProfileVerificationPassed,
      markProfilePassed: (id, passedAt) => markUserProfileVerificationPassed(env, id, passedAt),
      resetAfterRevocation: (id, state) => resetVerificationStateAfterProfileRevocation(env, id, state),
      repairFromProfile: (id, state, profile) => repairVerificationStateFromProfile(env, id, state, profile),
      clearPrompt: (id, promptId, text) => clearVerificationPromptMessage(env, id, promptId, text),
      nowIso: () => new Date().toISOString(),
      saveState: (id, state, existing) => putVerificationState(env, id, state, { existing }),
    },
  );
}

async function restartUserVerification(env, userId, operator = 'unknown') {
  ensureKv(env);
  return restartUserVerificationState({ userId, operator }, {
    getState: (id) => getUserVerificationState(env, id),
    deletePrompt: (id, promptMessageId) => deleteVerificationPromptMessage(env, id, promptMessageId),
    clearProfilePassed: (id) => clearUserProfileVerificationPassed(env, id),
    nowIso: () => new Date().toISOString(),
    saveState: (id, state, existing) => putVerificationState(env, id, state, { existing }),
  });
}

async function runDataCleanupIfDue(env) {
  return runMaintenanceIfDue(
    { env, intervalMs: DATA_CLEANUP_INTERVAL_MS, missingBindingReason: 'missing_kv' },
    {
      hasRequiredBindings: (runtimeEnv) => Boolean(runtimeEnv?.BOT_KV),
      readLastState: (runtimeEnv) => getJson(runtimeEnv.BOT_KV, LAST_DATA_CLEANUP_KEY),
      run: (runtimeEnv, options) => runDataCleanup(runtimeEnv, options),
    },
  );
}

async function runDeletedAccountSweepIfDue(env) {
  return runMaintenanceIfDue(
    { env, intervalMs: DELETED_ACCOUNT_SWEEP_INTERVAL_MS },
    {
      hasRequiredBindings: (runtimeEnv) => Boolean(runtimeEnv?.BOT_KV && runtimeEnv?.BOT_TOKEN),
      readLastState: (runtimeEnv) => getJson(runtimeEnv.BOT_KV, LAST_DELETED_ACCOUNT_SWEEP_KEY),
      run: (runtimeEnv, options) => runDeletedAccountSweep(runtimeEnv, options),
    },
  );
}

async function runDataCleanup(env, options = {}) {
  ensureKv(env);
  const retentionDays = clamp(
    parsePositiveInt(options.retentionDays ?? env.DATA_RETENTION_DAYS, getDataRetentionDays(env)),
    DATA_RETENTION_MIN_DAYS,
    DATA_RETENTION_MAX_DAYS,
  );
  const batchSize = clamp(
    parsePositiveInt(options.batchSize ?? env.DATA_CLEANUP_BATCH_SIZE, getDataCleanupBatchSize(env)),
    DATA_CLEANUP_MIN_BATCH,
    DATA_CLEANUP_MAX_BATCH,
  );
  return executeDataCleanup({
    source: options.source,
    retentionDays,
    batchSize,
    rootAdminIds: getRootAdminIds(env),
    listUserKeys: (limit) => collectKvKeys(env.BOT_KV, 'user:', limit),
    readUserProfile: (keyName) => getJson(env.BOT_KV, keyName),
    isProtectedUser: async (userId) => {
      const entries = await Promise.all([
        getBlacklistEntry(env, userId),
        getTrustEntry(env, userId),
        getAuthorizedAdminEntry(env, userId),
      ]);
      return entries.some(Boolean);
    },
    readTopic: (userId) => getTopicByUser(env, userId),
    buildUserKeys: (userId, topicRecord) => ({
      user: userKey(userId),
      verify: verifyKey(userId),
      topicUser: topicUserKey(userId),
      topicThread: Number.isFinite(Number(topicRecord?.threadId))
        ? topicThreadKey(Number(topicRecord.threadId))
        : '',
    }),
    deleteKv: (key) => env.BOT_KV.delete(key),
    onKvDeleted: noteKvJsonDelete,
    db: env.DB || null,
    deleteDirectory: (userId) => deleteD1DirectoryEntries(env, userId),
    onConversationsDeleted: () => messageHistoryConversationCache.clear(),
    persistState: (metrics) => env.BOT_KV.put(LAST_DATA_CLEANUP_KEY, JSON.stringify(metrics)),
  });
}

async function runDeletedAccountSweep(env, options = {}) {
  ensureKv(env);
  if (!env.BOT_TOKEN) {
    return { ok: false, skipped: 'missing_bot_token' };
  }
  const batchSize = clamp(
    parsePositiveInt(options.batchSize ?? env.DELETED_ACCOUNT_SWEEP_BATCH_SIZE, getDeletedAccountSweepBatchSize(env)),
    DELETED_ACCOUNT_SWEEP_MIN_BATCH,
    DELETED_ACCOUNT_SWEEP_MAX_BATCH,
  );
  const scanLimit = Math.min(8000, Math.max(batchSize * 6, MAX_SCAN_KEYS));
  return executeDeletedAccountSweep({
    source: options.source,
    batchSize,
    scanLimit,
    rootAdminIds: getRootAdminIds(env),
    listUserKeys: (limit) => collectKvKeys(env.BOT_KV, 'user:', limit),
    readUserProfile: (keyName) => getJson(env.BOT_KV, keyName),
    probeDeletedUser: (userId) => probeDeletedTelegramUser(env, userId),
    purgeDeletedUser: (userId, profile) => purgeDeletedUserData(env, userId, { profile }),
    persistState: (metrics) => env.BOT_KV.put(LAST_DELETED_ACCOUNT_SWEEP_KEY, JSON.stringify(metrics)),
    notify: async (metrics) => {
      if ((metrics.kv.deletedUsers <= 0 && metrics.d1.deletedMessages <= 0) || !env.ADMIN_CHAT_ID) return;
      const adminChatId = toChatId(env.ADMIN_CHAT_ID);
      const summary = [
        '注销账户巡检完成',
        `扫描用户：${metrics.kv.scannedUsers}`,
        `命中：${metrics.detections.length}`,
        `删除档案：${metrics.kv.deletedUsers}`,
        `删除消息：${metrics.d1.deletedMessages}`,
        `删除会话：${metrics.d1.deletedConversations}`,
      ].join('\n');
      await telegram(env, 'sendMessage', { chat_id: adminChatId, text: summary });
    },
  });
}

async function purgeDeletedUserData(env, userId, options = {}) {
  ensureKv(env);
  const topicRecord = options.topicRecord || (await getTopicByUser(env, userId));
  const verifyState = await getUserVerificationState(env, userId);

  if (verifyState?.promptMessageId) {
    await deleteVerificationPromptMessage(env, userId, verifyState.promptMessageId);
  }
  writeLocalVerificationCleared(userId, new Date().toISOString());

  return purgeDeletedUserRecords({
    userId,
    kvDeletions: [
      { kind: 'user', key: userKey(userId) },
      { kind: 'verify', key: verifyKey(userId) },
      { kind: 'topicUser', key: topicUserKey(userId) },
      { kind: 'blacklist', key: blacklistKey(userId) },
      { kind: 'trust', key: trustKey(userId) },
      { kind: 'admin', key: adminKey(userId) },
    ],
    topicThreadKey: Number.isFinite(Number(topicRecord?.threadId))
      ? topicThreadKey(Number(topicRecord.threadId))
      : '',
    deleteKv: (key) => env.BOT_KV.delete(key),
    onKvDeleted: noteKvJsonDelete,
    db: env.DB || null,
    deleteDirectory: () => deleteD1DirectoryEntries(env, userId),
    deleteVerificationStatus: () => verificationD1Repository.deleteStatus(env.DB, userId),
    deleteVerificationSession: () => verificationD1Repository.deleteSession(env.DB, userId),
    onVerificationStatusDeleted: () => invalidateD1VerificationStatusCache(userId),
    onConversationsDeleted: () => clearMessageHistoryConversationId(userId),
  });
}

async function getJson(kv, key) {
  const raw = await kv.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function ensureKv(env) {
  if (!env.BOT_KV) {
    throw new AppError(500, '请先在 wrangler.toml / Cloudflare 中绑定 KV：BOT_KV');
  }
}

function getVerificationMathEnabled(env) {
  return String(env.VERIFY_MATH_ENABLED ?? 'true').trim().toLowerCase() !== 'false';
}

function getVerificationCaptchaEnabled(env) {
  return String(env.VERIFY_CAPTCHA_ENABLED ?? 'true').trim().toLowerCase() !== 'false';
}

function getVerificationFlowMode(env) {
  const captchaEnabled = getVerificationCaptchaEnabled(env);
  const numericEnabled = getVerificationMathEnabled(env);
  if (numericEnabled && !captchaEnabled) return 'numeric-choice';
  return 'graphic-two-step';
}

function getVerifyWebSessionExpireMs(env) {
  return parsePositiveInt(env.VERIFY_WEB_SESSION_EXPIRE_MS, VERIFY_WEB_SESSION_EXPIRE_MS);
}

function getVerifyRetryBlockMs(env) {
  return parsePositiveInt(env.VERIFY_RETRY_BLOCK_MS, VERIFY_RETRY_BLOCK_MS);
}

function getVerifyStageMaxAttempts(env) {
  return clamp(parsePositiveInt(env.VERIFY_STAGE_MAX_ATTEMPTS, VERIFY_STAGE_MAX_ATTEMPTS), 1, 10);
}

function getVerifyMinSliderTimeMs(env) {
  return parsePositiveInt(env.VERIFY_MIN_SLIDER_TIME_MS, VERIFY_MIN_SLIDER_TIME_MS);
}

function getVerifySliderTolerance(env) {
  return clamp(parsePositiveInt(env.VERIFY_SLIDER_TOLERANCE, VERIFY_SLIDER_TOLERANCE), 1, 60);
}

function getVerifyRotationTolerance(env) {
  const configured = env.VERIFY_ROTATION_TOLERANCE ?? env.VERIFY_SLIDER_TOLERANCE;
  return clamp(parsePositiveInt(configured, VERIFY_ROTATION_TOLERANCE), 3, 45);
}

function getVerifyObserveMessageCount(env) {
  return clamp(parsePositiveInt(env.VERIFY_OBSERVE_MESSAGE_COUNT, VERIFY_OBSERVE_MESSAGE_COUNT), 0, 20);
}

function getVerifyFailTopicId(env) {
  const raw = Number(env.VERIFY_FAIL_TOPIC_ID);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return Math.floor(raw);
}

async function applyPostVerifyObservationLayer(message, env, adminChatId, preloadedVerifyState = null) {
  if (!env.BOT_KV || !isUserVerificationEnabled(env)) {
    return true;
  }

  const userId = Number(message?.chat?.id || 0);
  if (!(Number.isFinite(userId) && userId > 0)) {
    return true;
  }

  const state = preloadedVerifyState || (await getUserVerificationState(env, userId));
  if (!state?.verified) {
    return true;
  }

  const maxObserveCount = getVerifyObserveMessageCount(env);
  if (maxObserveCount <= 0) {
    return true;
  }

  const remaining = Number(state.postVerifyRemaining);
  if (!Number.isFinite(remaining) || remaining <= 0) {
    return true;
  }

  const trustEntry = await getTrustEntry(env, userId);
  const keywordHit = trustEntry ? null : matchKeywordFilter(env, message);
  if (keywordHit) {
    const entry = await setBlacklistEntry(env, userId, {
      reason: `命中关键词过滤：${keywordHit}`,
      createdAt: new Date().toISOString(),
      createdBy: 'keyword-observation',
    });
    await reportKeywordBan(env, adminChatId, message, keywordHit, entry);
    await telegram(env, 'sendMessage', {
      chat_id: userId,
      text: env.BLOCKED_TEXT || DEFAULT_BLOCKED_TEXT,
    });

    const nextState = {
      ...state,
      postVerifyRemaining: 0,
      updatedAt: new Date().toISOString(),
    };
    await putVerificationState(env, userId, nextState, { existing: state });
    return false;
  }

  const nextState = {
    ...state,
    postVerifyRemaining: Math.max(0, remaining - 1),
    updatedAt: new Date().toISOString(),
  };
  await putVerificationState(env, userId, nextState, { existing: state });
  return true;
}

async function reportKeywordBan(env, adminChatId, message, keyword, entry) {
  const sender = message.from || {};
  const lines = [
    '🚨 命中关键词过滤，已自动封禁用户',
    `关键词：${keyword}`,
    `用户：${formatUserProfile(sender, message.chat)}`,
    `原因：${entry.reason || '命中关键词过滤'}`,
    `内容预览：${formatMessagePreview(message)}`,
  ];

  try {
    await telegram(env, 'sendMessage', {
      chat_id: adminChatId,
      text: lines.join('\n'),
    });
  } catch (error) {
    // ignore
  }
}

async function sendAdminNotice(env, message, text) {
  const payload = {
    chat_id: message.chat.id,
    text,
  };

  if (message.message_thread_id) {
    payload.message_thread_id = message.message_thread_id;
  }

  await telegramWithThreadFallback(env, 'sendMessage', payload);
}

async function notifyUserAdminDeliveryFailed(env, message, error) {
  try {
    await telegram(env, 'sendMessage', {
      chat_id: message.chat.id,
      text: [
        '消息暂未送达管理员，请稍后再试。',
        `原因：${trimText(formatErrorMessage(error), 300)}`,
      ].join('\n'),
    });
  } catch (notifyError) {
    console.error('Failed to notify user delivery failure', formatErrorMessage(notifyError));
  }
}

async function getRuntimeEnv(env) {
  if (!env.BOT_KV) {
    return env;
  }
  return mergeRuntimeEnv(env, await getSystemConfig(env));
}

async function saveMessageHistory(env, entry) {
  if (!env.DB) return;

  try {
    const userId = Number(entry.userId);
    if (!Number.isFinite(userId)) return;
    if (shouldSkipDuplicateMessageHistory(entry, userId)) return;

    const nowIso = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO conversations (user_id, chat_type, topic_id, last_message_at, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?4, ?4)
       ON CONFLICT(user_id) DO UPDATE SET
         chat_type = excluded.chat_type,
         topic_id = COALESCE(excluded.topic_id, conversations.topic_id),
         last_message_at = excluded.last_message_at,
         updated_at = excluded.updated_at`
    )
      .bind(userId, entry.chatType || null, entry.topicId || null, nowIso)
      .run();

    let conversationId = readMessageHistoryConversationId(userId);
    if (!conversationId) {
      const conversation = await env.DB.prepare('SELECT id FROM conversations WHERE user_id = ?1 LIMIT 1')
        .bind(userId)
        .first();
      conversationId = Number(conversation?.id || 0);
      if (!conversationId) return;
      writeMessageHistoryConversationId(userId, conversationId);
    }

    await env.DB.prepare(
      `INSERT INTO messages (
        conversation_id, user_id, telegram_message_id, direction, sender_role, message_type,
        text_content, media_file_id, raw_payload, created_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`
    )
      .bind(
        conversationId,
        userId,
        entry.telegramMessageId || null,
        entry.direction,
        entry.senderRole,
        entry.messageType,
        entry.textContent || null,
        entry.mediaFileId || null,
        safeJsonStringify(entry.rawPayload),
        nowIso,
      )
      .run();
  } catch (error) {
    // ignore D1 write failures to avoid blocking message flow
  }
}

async function listMessageHistory(env, options = {}) {
  if (!env.DB) {
    return {
      items: [],
      nextCursor: null,
      hasMore: false,
    };
  }

  const limit = clamp(Number(options.limit) || 50, 1, MAX_LIST_LIMIT);
  const fetchLimit = limit + 1;
  const userId = options.userId ? Number(options.userId) : null;
  const beforeId = Number(options.beforeId || 0);
  const query = String(options.query || '').trim();
  const direction = ['user_to_admin', 'admin_to_user'].includes(String(options.direction || ''))
    ? String(options.direction)
    : '';
  const messageType = String(options.messageType || '').trim().toLowerCase();
  const baseSql = `SELECT
      m.id,
      m.user_id,
      m.telegram_message_id,
      m.direction,
      m.sender_role,
      m.message_type,
      m.text_content,
      m.media_file_id,
      m.created_at,
      c.topic_id,
      c.chat_type
    FROM messages m
    INNER JOIN conversations c ON c.id = m.conversation_id`;
  const where = [];
  const params = [];

  if (userId) {
    params.push(userId);
    where.push(`m.user_id = ?${params.length}`);
  }

  if (Number.isFinite(beforeId) && beforeId > 0) {
    params.push(beforeId);
    where.push(`m.id < ?${params.length}`);
  }

  if (direction) {
    params.push(direction);
    where.push(`m.direction = ?${params.length}`);
  }

  if (messageType && /^[a-z0-9_-]{1,32}$/.test(messageType)) {
    params.push(messageType);
    where.push(`m.message_type = ?${params.length}`);
  }

  if (query) {
    const escaped = query.replace(/[\\%_]/g, (hit) => `\\${hit}`);
    params.push(`%${escaped}%`);
    where.push(`m.text_content LIKE ?${params.length} ESCAPE '\\'`);
  }

  params.push(fetchLimit);
  const limitPlaceholder = `?${params.length}`;
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const statement = env.DB.prepare(`${baseSql}${whereSql} ORDER BY m.id DESC LIMIT ${limitPlaceholder}`).bind(...params);

  const result = await statement.all();
  const rows = Array.isArray(result?.results) ? result.results : [];
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1] || null;
  return {
    items,
    nextCursor: hasMore && last?.id ? String(last.id) : null,
    hasMore,
  };
}



function getWelcomeSetupScopeKey(message) {
  const chatId = Number(message?.chat?.id || 0) || 0;
  const threadId = Number(message?.message_thread_id || 0) || 0;
  return `${chatId}:${threadId}`;
}

async function getPendingAdminImageUpload(env, scopeKey) {
  if (!env?.BOT_KV || !scopeKey) return null;
  return getJson(env.BOT_KV, `${ADMIN_IMAGE_UPLOAD_PENDING_PREFIX}${scopeKey}`);
}

async function setPendingAdminImageUpload(env, scopeKey, payload = {}) {
  ensureKv(env);
  if (!scopeKey) return;
  await env.BOT_KV.put(`${ADMIN_IMAGE_UPLOAD_PENDING_PREFIX}${scopeKey}`, JSON.stringify(payload), {
    expirationTtl: ADMIN_IMAGE_UPLOAD_TTL_SECONDS,
  });
}

async function clearPendingAdminImageUpload(env, scopeKey) {
  if (!env?.BOT_KV || !scopeKey) return;
  await env.BOT_KV.delete(`${ADMIN_IMAGE_UPLOAD_PENDING_PREFIX}${scopeKey}`);
}

async function downloadTelegramImageFile(env, descriptor = {}) {
  const fileId = String(descriptor.fileId || '').trim();
  if (!fileId) throw new Error('telegram_file_missing');
  const metadata = await telegram(env, 'getFile', { file_id: fileId });
  const filePath = String(metadata?.file_path || '').trim();
  const declaredSize = Number(metadata?.file_size || descriptor.fileSize || 0) || 0;
  if (!filePath) throw new Error('telegram_file_missing');
  if (declaredSize > IMAGE_MAX_BYTES) throw new Error('image_file_too_large');

  const response = await fetch(`https://api.telegram.org/file/bot${env.BOT_TOKEN}/${filePath}`);
  if (!response.ok) throw new Error('telegram_file_download_failed');
  const contentLength = Number(response.headers.get('content-length') || 0) || 0;
  if (contentLength > IMAGE_MAX_BYTES) throw new Error('image_file_too_large');
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > IMAGE_MAX_BYTES) throw new Error('image_file_too_large');

  return {
    name: String(descriptor.fileName || 'telegram-image'),
    type: String(descriptor.contentType || ''),
    size: bytes.byteLength,
    arrayBuffer: async () => bytes,
  };
}

async function tryConsumePendingAdminImageUpload(message, env, publicBaseUrl) {
  return tryHandleAdminImageUploadMessage(message, {
    now: () => new Date(),
    isReady: () => Boolean(env?.BOT_KV && env?.DB && env?.IMAGE_BUCKET),
    getSession: (scopeKey) => getPendingAdminImageUpload(env, scopeKey),

    setSession: (scopeKey, payload) => setPendingAdminImageUpload(env, scopeKey, payload),
    clearSession: (scopeKey) => clearPendingAdminImageUpload(env, scopeKey),
    sendNotice: (text) => sendAdminNotice(env, message, text),
    downloadFile: (descriptor) => downloadTelegramImageFile(env, descriptor),
    store: (file, createdBy) => storeImageAsset({ file, createdBy, db: env.DB, bucket: env.IMAGE_BUCKET }),
    buildView: (asset) => buildImageAssetView(asset, publicBaseUrl, {
      imagePublicBaseUrl: env.IMAGE_PUBLIC_BASE_URL,
    }),
  });
}

async function getPendingAdminPanelInput(env, scopeKey) {
  if (!env?.BOT_KV || !scopeKey) return null;
  return getJson(env.BOT_KV, `${ADMIN_PANEL_INPUT_PENDING_PREFIX}${scopeKey}`);
}

async function setPendingAdminPanelInput(env, scopeKey, payload = {}) {
  ensureKv(env);
  if (!scopeKey) return;
  await env.BOT_KV.put(`${ADMIN_PANEL_INPUT_PENDING_PREFIX}${scopeKey}`, JSON.stringify(payload), {
    expirationTtl: ADMIN_PANEL_INPUT_TTL_SECONDS,
  });
}

async function clearPendingAdminPanelInput(env, scopeKey) {
  if (!env?.BOT_KV || !scopeKey) return;
  await env.BOT_KV.delete(`${ADMIN_PANEL_INPUT_PENDING_PREFIX}${scopeKey}`);
}

async function beginPendingAdminPanelInput(message, env, action) {
  return beginAdminPanelInput(message, action, {
    now: () => new Date(),
    setSession: (scopeKey, payload) => setPendingAdminPanelInput(env, scopeKey, payload),
    sendNotice: (text) => sendAdminNotice(env, message, text),
  });
}

async function sendAdminPanelInputReply(env, message, userId, text) {
  await telegram(env, 'sendMessage', { chat_id: userId, text });
  await saveMessageHistory(env, {
    userId: Number(userId),
    chatType: 'private',
    topicId: message.message_thread_id || null,
    telegramMessageId: Number(message.message_id) || null,
    direction: 'admin_to_user',
    senderRole: 'admin',
    messageType: 'text',
    textContent: text,
    mediaFileId: null,
    rawPayload: message,
  });
}

async function sendAdminPanelDeleteConfirmation(env, message, userId) {
  const payload = {
    chat_id: message.chat.id,
    text: [
      '⚠️ 确认彻底删除用户',
      '',
      `用户 ID：${userId}`,
      '该操作会删除用户资料、验证状态、会话和历史消息，无法恢复。',
      '点击下方确认按钮执行；发送 /cancel 可取消。',
    ].join('\n'),
    reply_markup: {
      inline_keyboard: [[{ text: '🗑️ 确认删除用户', callback_data: 'panel:deleteuser' }]],
    },
  };
  if (message.message_thread_id) payload.message_thread_id = message.message_thread_id;
  await telegramWithThreadFallback(env, 'sendMessage', payload);
}

async function tryConsumePendingAdminPanelInput(message, env, publicBaseUrl) {
  return tryHandleAdminPanelInputMessage(message, {
    now: () => new Date(),
    getSession: (scopeKey) => getPendingAdminPanelInput(env, scopeKey),
    setSession: (scopeKey, payload) => setPendingAdminPanelInput(env, scopeKey, payload),
    clearSession: (scopeKey) => clearPendingAdminPanelInput(env, scopeKey),
    sendNotice: (text) => sendAdminNotice(env, message, text),
    runAdminCommand: (text) => handleAdminCommand({ ...message, text }, env, null, publicBaseUrl),
    sendReply: (userId, text) => sendAdminPanelInputReply(env, message, userId, text),
    requestDeleteConfirmation: (userId) => sendAdminPanelDeleteConfirmation(env, message, userId),
  });
}

async function confirmPendingAdminPanelDelete(message, env, publicBaseUrl) {
  const scopeKey = getAdminPanelInputScopeKey(message);
  const pending = await getPendingAdminPanelInput(env, scopeKey);
  const userId = Number(pending?.userId || 0);
  if (!scopeKey || pending?.action !== 'deleteuser' || pending?.stage !== 'confirm' || !userId) return false;
  await clearPendingAdminPanelInput(env, scopeKey);
  await handleAdminCommand({ ...message, text: `/deleteuser ${userId}` }, env, null, publicBaseUrl);
  return true;
}

function normalizeWelcomeTypeForSetup(value) {
  const type = String(value || '').trim().toLowerCase();
  if (type === WELCOME_TYPE_TEXT) return WELCOME_TYPE_TEXT;
  if (type === WELCOME_TYPE_PHOTO) return WELCOME_TYPE_PHOTO;
  if (type === WELCOME_TYPE_VIDEO) return WELCOME_TYPE_VIDEO;
  if (type === WELCOME_TYPE_ANIMATION) return WELCOME_TYPE_ANIMATION;
  if (type === WELCOME_TYPE_AUDIO) return WELCOME_TYPE_AUDIO;
  if (type === WELCOME_TYPE_VOICE) return WELCOME_TYPE_VOICE;
  if (type === WELCOME_TYPE_STICKER) return WELCOME_TYPE_STICKER;
  if (type === WELCOME_TYPE_DOCUMENT) return WELCOME_TYPE_DOCUMENT;
  throw new AppError(400, '欢迎类型仅支持 text/photo/video/animation/audio/voice/sticker/document');
}

function detectWelcomeTypeFromMessage(message) {
  if (typeof message?.text === 'string' && message.text.trim()) return WELCOME_TYPE_TEXT;
  if (message?.photo?.length) return WELCOME_TYPE_PHOTO;
  if (message?.video) return WELCOME_TYPE_VIDEO;
  if (message?.animation) return WELCOME_TYPE_ANIMATION;
  if (message?.audio) return WELCOME_TYPE_AUDIO;
  if (message?.voice) return WELCOME_TYPE_VOICE;
  if (message?.sticker) return WELCOME_TYPE_STICKER;
  if (message?.document) return WELCOME_TYPE_DOCUMENT;
  return '';
}

function extractWelcomeMediaFileIdFromMessageByType(message, type) {
  if (type === WELCOME_TYPE_PHOTO && Array.isArray(message?.photo) && message.photo.length) {
    return message.photo[message.photo.length - 1]?.file_id || '';
  }
  if (type === WELCOME_TYPE_VIDEO) return String(message?.video?.file_id || '');
  if (type === WELCOME_TYPE_ANIMATION) return String(message?.animation?.file_id || '');
  if (type === WELCOME_TYPE_AUDIO) return String(message?.audio?.file_id || '');
  if (type === WELCOME_TYPE_VOICE) return String(message?.voice?.file_id || '');
  if (type === WELCOME_TYPE_STICKER) return String(message?.sticker?.file_id || '');
  if (type === WELCOME_TYPE_DOCUMENT) return String(message?.document?.file_id || '');
  return '';
}

function resolveWelcomeTextForSetup(currentText, incomingText, resolvedType) {
  const incoming = String(incomingText || '').trim();
  if (resolvedType === WELCOME_TYPE_TEXT || incoming) return incoming;
  return String(currentText || '').trim();
}

async function getPendingWelcomeSetup(env, scopeKey) {
  if (!env?.BOT_KV || !scopeKey) return null;
  return getJson(env.BOT_KV, `${WELCOME_SETUP_PENDING_PREFIX}${scopeKey}`);
}

async function setPendingWelcomeSetup(env, scopeKey, payload = {}) {
  ensureKv(env);
  if (!scopeKey) return;
  const now = new Date().toISOString();
  const record = {
    scopeKey,
    requestedType: String(payload.requestedType || 'auto').trim().toLowerCase() || 'auto',
    createdBy: payload.createdBy || null,
    chatId: Number(payload.chatId || 0) || null,
    threadId: Number(payload.threadId || 0) || null,
    createdAt: now,
    updatedAt: now,
  };
  await env.BOT_KV.put(`${WELCOME_SETUP_PENDING_PREFIX}${scopeKey}`, JSON.stringify(record), {
    expirationTtl: WELCOME_SETUP_PENDING_TTL_SECONDS,
  });
}

async function clearPendingWelcomeSetup(env, scopeKey) {
  if (!env?.BOT_KV || !scopeKey) return;
  await env.BOT_KV.delete(`${WELCOME_SETUP_PENDING_PREFIX}${scopeKey}`);
}

async function applyWelcomeSetupFromAdminMessage(env, message, pending) {
  const requestedType = String(pending?.requestedType || 'auto').trim().toLowerCase();
  const config = await getSystemConfig(env);
  if (requestedType === 'text-only') {
    const text = typeof message?.text === 'string' ? message.text.trim() : '';
    if (!text) {
      throw new AppError(400, '请发送纯文本欢迎文案，媒体和空文本不会被保存。');
    }
    const next = {
      ...config,
      WELCOME_TEXT: text,
      updatedAt: new Date().toISOString(),
    };
    await setSystemConfig(env, next);
    return {
      welcomeType: getWelcomeType(next),
      welcomeMedia: String(next.WELCOME_MEDIA || '').trim(),
      welcomeText: text,
      welcomeTextPreserved: false,
      runtimeEnv: await getRuntimeEnv(env),
    };
  }

  const resolvedType =
    requestedType !== 'auto'
      ? normalizeWelcomeTypeForSetup(requestedType)
      : detectWelcomeTypeFromMessage(message);
  if (!resolvedType) {
    throw new AppError(400, '未识别到可设置内容，请发送文本或支持的媒体消息。');
  }

  const incomingText = extractMessageText(message).trim();
  const mediaFileId = extractWelcomeMediaFileIdFromMessageByType(message, resolvedType);
  if (resolvedType !== WELCOME_TYPE_TEXT && !mediaFileId) {
    throw new AppError(400, '未能提取媒体 file_id，请改用原生媒体消息发送（不要仅发送链接）。');
  }

  const text = resolveWelcomeTextForSetup(config.WELCOME_TEXT, incomingText, resolvedType);
  const next = {
    ...config,
    WELCOME_TYPE: resolvedType,
    WELCOME_MEDIA: resolvedType === WELCOME_TYPE_TEXT ? '' : mediaFileId,
    WELCOME_TEXT: text,
    updatedAt: new Date().toISOString(),
  };
  await setSystemConfig(env, next);

  const runtimeEnv = await getRuntimeEnv(env);
  return {
    welcomeType: resolvedType,
    welcomeMedia: resolvedType === WELCOME_TYPE_TEXT ? '' : mediaFileId,
    welcomeText: text,
    welcomeTextPreserved: resolvedType !== WELCOME_TYPE_TEXT && !incomingText,
    runtimeEnv,
  };
}

async function tryConsumePendingWelcomeSetup(message, env) {
  if (!env?.BOT_KV) return false;
  const text = typeof message?.text === 'string' ? message.text.trim() : '';
  if (/^\/(?:setwelcome|welcome|setupwelcome|setwelcometext|welcometext|welcomecopy|cancelwelcome|cancelsetwelcome|welcomecancel)\b/i.test(text)) {
    return false;
  }

  const scopeKey = getWelcomeSetupScopeKey(message);
  const pending = await getPendingWelcomeSetup(env, scopeKey);
  if (!pending) return false;

  try {
    const result = await applyWelcomeSetupFromAdminMessage(env, message, pending);
    await clearPendingWelcomeSetup(env, scopeKey);
    await sendAdminNotice(
      env,
      message,
      [
        '欢迎内容设置成功：',
        `类型：${result.welcomeType}`,
        result.welcomeMedia ? `媒体 file_id：${result.welcomeMedia}` : '媒体：已清空',
        result.welcomeTextPreserved
          ? `文案：已保留原文案（${result.welcomeText || '空'}）`
          : `文案：${result.welcomeText || '（空）'}`,
      ].join('\n'),
    );
    return true;
  } catch (error) {
    await sendAdminNotice(
      env,
      message,
      `欢迎内容设置失败：${trimText(formatErrorMessage(error), 300)}\n请重发目标内容，或使用 /cancelwelcome 取消。`,
    );
    return true;
  }
}

function safeJsonStringify(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch (error) {
    return null;
  }
}

function getWelcomeUploadEndpointByType(type) {
  const normalized = String(type || '').trim().toLowerCase();
  if (normalized === WELCOME_TYPE_PHOTO) return { method: 'sendPhoto', field: 'photo' };
  if (normalized === WELCOME_TYPE_VIDEO) return { method: 'sendVideo', field: 'video' };
  if (normalized === WELCOME_TYPE_ANIMATION) return { method: 'sendAnimation', field: 'animation' };
  if (normalized === WELCOME_TYPE_AUDIO) return { method: 'sendAudio', field: 'audio' };
  if (normalized === WELCOME_TYPE_VOICE) return { method: 'sendVoice', field: 'voice' };
  if (normalized === WELCOME_TYPE_STICKER) return { method: 'sendSticker', field: 'sticker' };
  if (normalized === WELCOME_TYPE_DOCUMENT) return { method: 'sendDocument', field: 'document' };
  throw new AppError(400, '当前欢迎类型不支持上传文件，请先切换到图片/视频/动图/音频/语音/贴纸/文件');
}

function extractWelcomeMediaFileIdByType(type, message = {}) {
  const normalized = String(type || '').trim().toLowerCase();
  if (normalized === WELCOME_TYPE_PHOTO && Array.isArray(message.photo) && message.photo.length) {
    return message.photo[message.photo.length - 1]?.file_id || '';
  }
  if (normalized === WELCOME_TYPE_VIDEO) return String(message?.video?.file_id || '');
  if (normalized === WELCOME_TYPE_ANIMATION) return String(message?.animation?.file_id || '');
  if (normalized === WELCOME_TYPE_AUDIO) return String(message?.audio?.file_id || '');
  if (normalized === WELCOME_TYPE_VOICE) return String(message?.voice?.file_id || '');
  if (normalized === WELCOME_TYPE_STICKER) return String(message?.sticker?.file_id || '');
  if (normalized === WELCOME_TYPE_DOCUMENT) return String(message?.document?.file_id || '');
  return '';
}

async function uploadWelcomeMediaToTelegram(env, type, file) {
  const endpoint = getWelcomeUploadEndpointByType(type);
  const chatId = toChatId(env.ADMIN_CHAT_ID);
  if (!chatId) {
    throw new AppError(400, 'ADMIN_CHAT_ID 未配置，无法上传欢迎媒体');
  }

  const body = new FormData();
  body.set('chat_id', String(chatId));
  body.set(endpoint.field, file, file.name || `welcome-${Date.now()}`);

  const data = await telegramMultipart(env, endpoint.method, body);
  const fileId = extractWelcomeMediaFileIdByType(type, data);
  if (!fileId) {
    throw new AppError(500, '上传成功但未解析到 file_id，请更换文件类型后重试');
  }

  // 上传时 Telegram 会给管理员会话发一条消息，这里尝试撤回，避免干扰。
  try {
    if (data?.message_id) {
      await telegram(env, 'deleteMessage', {
        chat_id: chatId,
        message_id: data.message_id,
      });
    }
  } catch (error) {
    // ignore cleanup failure
  }

  return {
    type,
    fileId,
    fileName: String(file.name || '').trim() || null,
    mimeType: String(file.type || '').trim() || null,
    size: Number(file.size || 0) || 0,
  };
}

async function getEffectiveSystemConfig(env) {
  const config = await getSystemConfig(env);
  return buildEffectiveSystemConfig(env, config);
}

async function getSystemConfig(env) {
  if (!env.BOT_KV) {
    return {};
  }

  const cached = readSystemConfigCache();
  if (cached) {
    return { ...cached };
  }

  const data = await getJson(env.BOT_KV, SYSTEM_CONFIG_KEY);
  if (!data || typeof data !== 'object') {
    writeSystemConfigCache({});
    return {};
  }
  writeSystemConfigCache(data);
  return { ...data };
}

const adminPasswordStateHandlers = {
  ensureKv,
  getSystemConfig,
  getAdminPanelUser,
  hashPassword,
  setSystemConfig,
  getAdminSessionVersion,
  createBootstrapPassword,
  notifyBootstrapPassword,
};

async function ensureAdminPasswordState(env) {
  return ensureAdminPasswordStateCore(
    { env, bootstrapTtlMs: ADMIN_BOOTSTRAP_TTL_MS },
    adminPasswordStateHandlers,
  );
}

async function resendBootstrapPassword(env) {
  ensureKv(env);
  const state = await ensureAdminPasswordState(env);

  if (!state.passwordReady) {
    return {
      ok: false,
      message: '当前还无法生成面板密码，请先确保 BOT_TOKEN 与 ADMIN_CHAT_ID 已正确配置。',
    };
  }

  if (state.passwordMode === 'permanent') {
    return {
      ok: false,
      message: '当前面板已使用永久密码。若你忘记了密码，请执行 /panelreset 重新生成新的临时密码。',
    };
  }

  const result = await resetBootstrapPassword(env);
  return {
    ...result,
    message: result.ok
      ? `出于安全考虑，旧临时密码已作废；新的临时密码已发送到管理员会话。${result.expiresAt ? `有效期至：${result.expiresAt}` : ''}`
      : result.message,
  };
}

async function resetBootstrapPassword(env) {
  return resetAdminBootstrapPassword(
    { env, bootstrapTtlMs: ADMIN_BOOTSTRAP_TTL_MS },
    adminPasswordStateHandlers,
  );
}

function getAdminSessionVersion(config = {}) {
  const value = Number(config.ADMIN_SESSION_VERSION || 1);
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function buildAdminAuthPayload(passwordState, authenticated = false, options = {}) {
  return {
    ok: true,
    authenticated,
    username: passwordState.username || 'admin',
    mustChangePassword: authenticated ? Boolean(passwordState.mustChangePassword) : false,
    passwordReady: Boolean(passwordState.passwordReady),
    passwordMode: passwordState.passwordMode || 'none',
    bootstrapExpiresAt: passwordState.bootstrapExpiresAt || null,
    bootstrapNotifyError: passwordState.bootstrapNotifyError || null,
    csrfToken: authenticated ? String(options.csrfToken || '') || null : null,
  };
}

async function updateSystemConfig(env, payload) {
  ensureKv(env);
  const existing = await getSystemConfig(env);
  const next = { ...existing };
  const botMetaPayload = readBotMetaUpdatePayload(payload || {}, existing || {});
  validateBotMetaPayload(botMetaPayload);
  const allowed = [
    'VERIFY_EXPIRE_MS',
    'VERIFY_FAIL_BLOCK_MS',
    'VERIFY_TIMEOUT_BLOCK_MS',
    'VERIFY_MAX_FAILURES',
    'VERIFY_MATH_ENABLED',
    'VERIFY_CAPTCHA_ENABLED',
    'VERIFY_WEB_SESSION_EXPIRE_MS',
    'VERIFY_RETRY_BLOCK_MS',
    'VERIFY_STAGE_MAX_ATTEMPTS',
    'VERIFY_MIN_SLIDER_TIME_MS',
    'VERIFY_SLIDER_TOLERANCE',
    'VERIFY_ROTATION_TOLERANCE',
    'VERIFY_PROOF_SECRET',
    'VERIFY_OBSERVE_MESSAGE_COUNT',
    'VERIFY_FAIL_TOPIC_ID',
    'BOT_TOKEN',
    'ADMIN_CHAT_ID',
    'ADMIN_IDS',
    'ADMIN_ID',
    'WEBHOOK_SECRET',
    'PUBLIC_BASE_URL',
    'VERIFY_PUBLIC_BASE_URL',
    'WEBHOOK_PATH',
    'TOPIC_MODE',
    'USER_VERIFICATION',
    'ADMIN_META_MODE',
    'WELCOME_TYPE',
    'WELCOME_MEDIA',
    'WELCOME_TEXT',
    'BOT_DESCRIPTION',
    'BOT_SHORT_DESCRIPTION',
    'BOT_DESCRIPTION_DEFAULT',
    'BOT_SHORT_DESCRIPTION_DEFAULT',
    'BOT_DESCRIPTION_ZH_CN',
    'BOT_SHORT_DESCRIPTION_ZH_CN',
    'BOT_DESCRIPTION_EN_US',
    'BOT_SHORT_DESCRIPTION_EN_US',
    'BLOCKED_TEXT',
    'DATA_RETENTION_DAYS',
    'DATA_CLEANUP_BATCH_SIZE',
    'DATA_CLEANUP_AUTO',
    'DELETED_ACCOUNT_SWEEP_AUTO',
    'DELETED_ACCOUNT_SWEEP_BATCH_SIZE',
    'ADMIN_API_KEY',
    'ADMIN_PANEL_URL',
    'ADMIN_PANEL_USER',
    'KEYWORD_FILTERS',
  ];

  for (const key of allowed) {
    if (!(key in payload)) continue;
    const value = String(payload[key] ?? '').trim();
    if (!value) {
      delete next[key];
      continue;
    }
    next[key] = value;
  }

  next.updatedAt = new Date().toISOString();
  const normalizedDescription = String(botMetaPayload?.values?.BOT_DESCRIPTION || '').trim();
  const normalizedShortDescription = String(botMetaPayload?.values?.BOT_SHORT_DESCRIPTION || '').trim();
  next.BOT_DESCRIPTION = normalizedDescription;
  next.BOT_SHORT_DESCRIPTION = normalizedShortDescription;
  // Keep legacy keys aligned to avoid stale reads from old deployments.
  next.BOT_DESCRIPTION_DEFAULT = normalizedDescription;
  next.BOT_SHORT_DESCRIPTION_DEFAULT = normalizedShortDescription;
  delete next.BOT_DESCRIPTION_ZH_CN;
  delete next.BOT_SHORT_DESCRIPTION_ZH_CN;
  delete next.BOT_DESCRIPTION_EN_US;
  delete next.BOT_SHORT_DESCRIPTION_EN_US;
  await setSystemConfig(env, next);

  const shouldSyncBotMeta = botMetaPayload.updated;
  let metaSync = { synced: false, error: null };
  if (shouldSyncBotMeta && env.BOT_TOKEN) {
    try {
      await syncTelegramBotProfileMeta(env, next);
      metaSync = { synced: true, error: null };
    } catch (error) {
      const errorText = formatErrorMessage(error);
      metaSync = { synced: false, error: errorText };
      throw new AppError(400, `机器人简介同步失败：${errorText}`);
    }
  }

  return { ...next, metaSync };
}

function readBotMetaUpdatePayload(payload = {}, existing = {}) {
  const hasDescription = Object.prototype.hasOwnProperty.call(payload, 'BOT_DESCRIPTION');
  const hasShortDescription = Object.prototype.hasOwnProperty.call(payload, 'BOT_SHORT_DESCRIPTION');
  const hasLegacyDescription = Object.prototype.hasOwnProperty.call(payload, 'BOT_DESCRIPTION_DEFAULT');
  const hasLegacyShortDescription = Object.prototype.hasOwnProperty.call(payload, 'BOT_SHORT_DESCRIPTION_DEFAULT');

  const description = hasDescription
    ? payload.BOT_DESCRIPTION
    : hasLegacyDescription
      ? payload.BOT_DESCRIPTION_DEFAULT
      : existing.BOT_DESCRIPTION;
  const shortDescription = hasShortDescription
    ? payload.BOT_SHORT_DESCRIPTION
    : hasLegacyShortDescription
      ? payload.BOT_SHORT_DESCRIPTION_DEFAULT
      : existing.BOT_SHORT_DESCRIPTION;

  return {
    updated: hasDescription || hasShortDescription || hasLegacyDescription || hasLegacyShortDescription,
    values: {
      BOT_DESCRIPTION: String(description ?? '').trim(),
      BOT_SHORT_DESCRIPTION: String(shortDescription ?? '').trim(),
    },
  };
}

function validateBotMetaPayload(payload = {}) {
  const description = String(payload?.values?.BOT_DESCRIPTION || '').trim();
  const shortDescription = String(payload?.values?.BOT_SHORT_DESCRIPTION || '').trim();

  if (description.length > BOT_DESCRIPTION_MAX_LENGTH) {
    throw new AppError(400, `BOT_DESCRIPTION 最长 ${BOT_DESCRIPTION_MAX_LENGTH} 个字符`);
  }
  if (shortDescription.length > BOT_SHORT_DESCRIPTION_MAX_LENGTH) {
    throw new AppError(400, `BOT_SHORT_DESCRIPTION 最长 ${BOT_SHORT_DESCRIPTION_MAX_LENGTH} 个字符`);
  }
}

async function syncTelegramBotProfileMeta(env, config = {}) {
  const description = String(config?.BOT_DESCRIPTION || '').trim();
  const shortDescription = String(config?.BOT_SHORT_DESCRIPTION || '').trim();

  await telegram(env, 'setMyDescription', { description });
  await telegram(env, 'setMyShortDescription', { short_description: shortDescription });

  // Clear legacy locale-specific overrides if they ever existed.
  try {
    await telegram(env, 'setMyDescription', { description: '', language_code: 'zh-hans' });
    await telegram(env, 'setMyShortDescription', { short_description: '', language_code: 'zh-hans' });
    await telegram(env, 'setMyDescription', { description: '', language_code: 'en' });
    await telegram(env, 'setMyShortDescription', { short_description: '', language_code: 'en' });
  } catch (error) {
    // ignore cleanup failures
  }
}

function buildSystemConfigView(config) {
  const description = String(
    config.BOT_DESCRIPTION || config.BOT_DESCRIPTION_DEFAULT || config.BOT_DESCRIPTION_ZH_CN || config.BOT_DESCRIPTION_EN_US || '',
  ).trim();
  const shortDescription = String(
    config.BOT_SHORT_DESCRIPTION ||
      config.BOT_SHORT_DESCRIPTION_DEFAULT ||
      config.BOT_SHORT_DESCRIPTION_ZH_CN ||
      config.BOT_SHORT_DESCRIPTION_EN_US ||
      '',
  ).trim();

  return {
    BOT_TOKEN: maskSecret(config.BOT_TOKEN),
    ADMIN_CHAT_ID: config.ADMIN_CHAT_ID || '',
    ADMIN_IDS: config.ADMIN_IDS || config.ADMIN_ID || '',
    WEBHOOK_SECRET: maskSecret(config.WEBHOOK_SECRET),
    PUBLIC_BASE_URL: config.PUBLIC_BASE_URL || '',
    VERIFY_PUBLIC_BASE_URL: config.VERIFY_PUBLIC_BASE_URL || '',
    WEBHOOK_PATH: config.WEBHOOK_PATH || '',
    TOPIC_MODE: config.TOPIC_MODE || '',
    USER_VERIFICATION: config.USER_VERIFICATION || '',
    ADMIN_META_MODE: getAdminMetaMode(config),
    VERIFY_EXPIRE_MS: config.VERIFY_EXPIRE_MS || '',
    VERIFY_FAIL_BLOCK_MS: config.VERIFY_FAIL_BLOCK_MS || '',
    VERIFY_TIMEOUT_BLOCK_MS: config.VERIFY_TIMEOUT_BLOCK_MS || '',
    VERIFY_MAX_FAILURES: config.VERIFY_MAX_FAILURES || '',
    VERIFY_MATH_ENABLED: config.VERIFY_MATH_ENABLED || '',
    VERIFY_CAPTCHA_ENABLED: config.VERIFY_CAPTCHA_ENABLED || '',
    VERIFY_WEB_SESSION_EXPIRE_MS: config.VERIFY_WEB_SESSION_EXPIRE_MS || '',
    VERIFY_RETRY_BLOCK_MS: config.VERIFY_RETRY_BLOCK_MS || '',
    VERIFY_STAGE_MAX_ATTEMPTS: config.VERIFY_STAGE_MAX_ATTEMPTS || '',
    VERIFY_MIN_SLIDER_TIME_MS: config.VERIFY_MIN_SLIDER_TIME_MS || '',
    VERIFY_SLIDER_TOLERANCE: config.VERIFY_SLIDER_TOLERANCE || '',
    VERIFY_ROTATION_TOLERANCE: config.VERIFY_ROTATION_TOLERANCE || '',
    VERIFY_PROOF_SECRET: maskSecret(config.VERIFY_PROOF_SECRET),
    VERIFY_OBSERVE_MESSAGE_COUNT: config.VERIFY_OBSERVE_MESSAGE_COUNT || '',
    VERIFY_FAIL_TOPIC_ID: config.VERIFY_FAIL_TOPIC_ID || '',
    WELCOME_TYPE: config.WELCOME_TYPE || '',
    WELCOME_MEDIA: config.WELCOME_MEDIA || '',
    WELCOME_TEXT: config.WELCOME_TEXT || '',
    BOT_DESCRIPTION: description,
    BOT_SHORT_DESCRIPTION: shortDescription,
    BLOCKED_TEXT: config.BLOCKED_TEXT || '',
    DATA_RETENTION_DAYS: config.DATA_RETENTION_DAYS || '',
    DATA_CLEANUP_BATCH_SIZE: config.DATA_CLEANUP_BATCH_SIZE || '',
    DATA_CLEANUP_AUTO: config.DATA_CLEANUP_AUTO || '',
    DELETED_ACCOUNT_SWEEP_AUTO: config.DELETED_ACCOUNT_SWEEP_AUTO || '',
    DELETED_ACCOUNT_SWEEP_BATCH_SIZE: config.DELETED_ACCOUNT_SWEEP_BATCH_SIZE || '',
    ADMIN_API_KEY: maskSecret(config.ADMIN_API_KEY),
    ADMIN_PANEL_URL: config.ADMIN_PANEL_URL || '',
    ADMIN_PANEL_USER: config.ADMIN_PANEL_USER || '',
    KEYWORD_FILTERS: config.KEYWORD_FILTERS || '',
    updatedAt: config.updatedAt || null,
  };
}

function maskSecret(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.length <= 6) return '*'.repeat(raw.length);
  return `${raw.slice(0, 3)}***${raw.slice(-3)}`;
}

function getAdminPanelUser(env) {
  return String(env.ADMIN_PANEL_USER || 'admin').trim() || 'admin';
}

function getVerificationProofSecret(env, state = null) {
  const configured = String(env?.VERIFY_PROOF_SECRET || env?.WEBHOOK_SECRET || env?.BOT_TOKEN || '').trim();
  if (configured) return configured;
  return String(state?.sessionToken || 'verification-proof-fallback');
}

function createBootstrapPassword(length = 12) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

async function notifyBootstrapPassword(env, username, password, expiresAt) {
  const adminChatId = toChatId(env.ADMIN_CHAT_ID);
  const panelUrl = getAdminPanelEntryUrl(env) || await resolveAdminPanelUrl(env);
  const lines = [
    '你的管理面板首次临时密码已生成。',
    `账号：${username || 'admin'}`,
    `临时密码：${password}`,
    `有效期至：${expiresAt}`,
    '请尽快登录并修改为永久密码。',
  ];

  if (panelUrl) {
    lines.splice(1, 0, `面板入口：${panelUrl}`);
  }

  await telegram(env, 'sendMessage', {
    chat_id: adminChatId,
    text: lines.join('\n'),
  });
}

function formatErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function handleDeployBootstrap(request, env, webhookPath, publicBaseUrl) {
  return handleDeployBootstrapRequest(
    { request, env, webhookPath, publicBaseUrl },
    {
      createError: (status, message) => new AppError(status, message),
      ensureEnv,
      ensureKv,
      telegram,
      syncTelegramCommands,
      ensureAdminPasswordState,
      json,
    },
  );
}

async function getAdminSession(env, request) {
  if (!env.BOT_KV) return null;
  const cookies = parseCookies(request.headers.get('cookie'));
  const token = cookies.admin_session;
  if (!token) return null;
  const session = await getJson(env.BOT_KV, `${ADMIN_SESSION_PREFIX}${token}`);
  if (!session || typeof session !== 'object') return null;

  const expireAtMs = new Date(session.expireAt || '').getTime();
  if (!Number.isFinite(expireAtMs) || expireAtMs <= Date.now()) {
    await env.BOT_KV.delete(`${ADMIN_SESSION_PREFIX}${token}`);
    return null;
  }

  const config = await getSystemConfig(env);
  if (Number(session.sessionVersion || 0) !== getAdminSessionVersion(config)) {
    await env.BOT_KV.delete(`${ADMIN_SESSION_PREFIX}${token}`);
    return null;
  }

  return { ...session, token };
}

async function createAdminSession(env, username, sessionVersion) {
  const token = createSessionToken();
  const csrfToken = createRandomToken(24);
  const now = new Date();
  const expireAt = new Date(Date.now() + ADMIN_SESSION_TTL_SECONDS * 1000).toISOString();
  const session = {
    username,
    loginAt: now.toISOString(),
    expireAt,
    sessionVersion,
    csrfToken,
  };
  await env.BOT_KV.put(
    `${ADMIN_SESSION_PREFIX}${token}`,
    JSON.stringify(session),
    { expirationTtl: ADMIN_SESSION_TTL_SECONDS },
  );
  return { ...session, token };
}

function getAdminLoginClientAddress(request) {
  const forwarded = String(request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  return String(request.headers.get('cf-connecting-ip') || forwarded || 'unknown').trim().toLowerCase();
}

async function getAdminLoginRateKey(request) {
  return `${ADMIN_LOGIN_RATE_PREFIX}${await sha256Hex(getAdminLoginClientAddress(request))}`;
}

function isUnsafeHttpMethod(method = '') {
  return !['GET', 'HEAD', 'OPTIONS'].includes(String(method || '').toUpperCase());
}

function isAdminPanelCrossSite(request, env) {
  const requestOrigin = getRequestOrigin(request);
  const panelOrigin = getUrlOrigin(env.ADMIN_PANEL_URL || env.ADMIN_PANEL_ENTRY_URL || '');
  return Boolean(panelOrigin && requestOrigin && panelOrigin !== requestOrigin);
}

async function handleAdminAuthMe(request, env) {
  ensureKv(env);
  validateAdminOrigin(request, env);
  const passwordState = await ensureAdminPasswordState(env);
  const session = await getAdminSession(env, request);
  const authorization = request.headers.get('authorization') || '';
  const bearerToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  const key = request.headers.get('x-admin-key') || bearerToken || '';
  const authenticatedByKey = Boolean(
    env.ADMIN_API_KEY && key && timingSafeEqualText(key, env.ADMIN_API_KEY),
  );

  return json(
    buildAdminAuthPayload(passwordState, authenticatedByKey || Boolean(session), {
      csrfToken: session?.csrfToken,
    }),
    200,
    {},
    request,
    env,
  );
}

async function handleAdminLogin(request, env) {
  ensureKv(env);
  validateAdminOrigin(request, env);
  const body = await readJsonBody(request);
  const username = String(body.username || '').trim() || 'admin';
  const password = String(body.password || '').trim();
  const expectedUser = getAdminPanelUser(env);
  const passwordState = await ensureAdminPasswordState(env);
  const rateKey = await getAdminLoginRateKey(request);
  const rateState = await getJson(env.BOT_KV, rateKey);

  if (isLoginRateBlocked(rateState)) {
    throw new AppError(429, '登录尝试过于频繁，请稍后再试');
  }

  if (!passwordState.passwordReady) {
    throw new AppError(500, '请先配置 BOT_TOKEN 与 ADMIN_CHAT_ID，系统会自动生成首次临时密码并发送到管理员会话');
  }

  const passwordMatches = await verifyPassword(password, passwordState.passwordHash);
  if (!timingSafeEqualText(username, expectedUser) || !passwordMatches) {
    const nextRateState = recordLoginFailure(rateState);
    await env.BOT_KV.put(rateKey, JSON.stringify(nextRateState), {
      expirationTtl: Math.ceil((ADMIN_LOGIN_BLOCK_MS * 2) / 1000),
    });
    if (isLoginRateBlocked(nextRateState)) {
      throw new AppError(429, '登录尝试过于频繁，请稍后再试');
    }
    throw new AppError(401, '账号或密码错误');
  }

  await env.BOT_KV.delete(rateKey);
  const config = await getSystemConfig(env);
  if (passwordHashNeedsUpgrade(passwordState.passwordHash)) {
    const upgradedHash = await hashPassword(password);
    const next = { ...config, updatedAt: new Date().toISOString() };
    if (passwordState.passwordMode === 'bootstrap') {
      next.ADMIN_BOOTSTRAP_PASSWORD_HASH = upgradedHash;
    } else {
      next.ADMIN_PANEL_PASSWORD_HASH = upgradedHash;
    }
    await setSystemConfig(env, next);
  }
  const session = await createAdminSession(env, username, getAdminSessionVersion(config));

  return json(
    {
      ...buildAdminAuthPayload(passwordState, true, { csrfToken: session.csrfToken }),
      expireAt: session.expireAt,
    },
    200,
    {
      'set-cookie': buildSessionCookie(session.token, {
        crossSite: isAdminPanelCrossSite(request, env),
      }),
    },
    request,
    env,
  );
}

async function handleAdminChangePassword(request, env) {
  ensureKv(env);
  const body = await readJsonBody(request);
  const newPassword = String(body.newPassword || '').trim();

  if (newPassword.length < 10) {
    throw new AppError(400, '新密码至少需要 10 位');
  }

  const current = await getSystemConfig(env);
  const nextSessionVersion = getAdminSessionVersion(current) + 1;
  const next = {
    ...current,
    ADMIN_PANEL_PASSWORD_HASH: await hashPassword(newPassword),
    ADMIN_FORCE_PASSWORD_CHANGE: 'false',
    ADMIN_SESSION_VERSION: String(nextSessionVersion),
    updatedAt: new Date().toISOString(),
  };

  delete next.ADMIN_PANEL_PASSWORD;
  delete next.ADMIN_BOOTSTRAP_PASSWORD;
  delete next.ADMIN_BOOTSTRAP_PASSWORD_HASH;
  delete next.ADMIN_BOOTSTRAP_EXPIRES_AT;
  delete next.ADMIN_BOOTSTRAP_NOTIFY_ERROR;
  await setSystemConfig(env, next);

  const cookies = parseCookies(request.headers.get('cookie'));
  const oldToken = cookies.admin_session;
  if (oldToken) {
    await env.BOT_KV.delete(`${ADMIN_SESSION_PREFIX}${oldToken}`);
  }
  const session = await createAdminSession(env, getAdminPanelUser(env), nextSessionVersion);

  return json(
    {
      ok: true,
      authenticated: true,
      username: getAdminPanelUser(env),
      mustChangePassword: false,
      passwordReady: true,
      passwordMode: 'permanent',
      bootstrapExpiresAt: null,
      csrfToken: session.csrfToken,
      expireAt: session.expireAt,
    },
    200,
    {
      'set-cookie': buildSessionCookie(session.token, {
        crossSite: isAdminPanelCrossSite(request, env),
      }),
    },
    request,
    env,
  );
}

async function handleAdminLogout(request, env) {
  if (env.BOT_KV) {
    const cookies = parseCookies(request.headers.get('cookie'));
    const token = cookies.admin_session;
    if (token) {
      await env.BOT_KV.delete(`${ADMIN_SESSION_PREFIX}${token}`);
    }
  }

  return json(
    { ok: true },
    200,
    {
      'set-cookie': buildExpiredSessionCookie(),
    },
    request,
    env,
  );
}

async function requireHttpAdmin(request, env) {
  validateAdminOrigin(request, env);
  const authorization = request.headers.get('authorization') || '';
  const bearerToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  const key = request.headers.get('x-admin-key') || bearerToken || '';

  if (env.ADMIN_API_KEY && key && timingSafeEqualText(key, env.ADMIN_API_KEY)) {
    return { authType: 'api-key' };
  }

  const session = await getAdminSession(env, request);
  if (session) {
    if (
      isUnsafeHttpMethod(request.method)
      && !timingSafeEqualText(request.headers.get('x-csrf-token') || '', session.csrfToken || '')
    ) {
      throw new AppError(403, 'CSRF token invalid');
    }
    return { authType: 'session', session };
  }

  throw new AppError(401, 'Unauthorized');
}

function getHttpAdminOperator(request) {
  const authorization = request.headers.get('authorization') || '';
  const hasBearer = authorization.startsWith('Bearer ');
  if (request.headers.get('x-admin-key')) return 'http:x-admin-key';
  if (hasBearer) return 'http:bearer';
  return 'http:session';
}

function formatAdminOperator(sender) {
  if (!sender) return 'telegram-admin';
  const username = sender.username ? `@${sender.username}` : null;
  const name = [sender.first_name, sender.last_name].filter(Boolean).join(' ').trim() || null;
  return username || name || `telegram:${sender.id || 'unknown'}`;
}

async function isTelegramGroupAdmin(env, chatId, userId) {
  const numericChatId = Number(chatId);
  const numericUserId = Number(userId);
  if (!(Number.isFinite(numericChatId) && numericChatId < 0 && Number.isFinite(numericUserId) && numericUserId > 0)) {
    return false;
  }

  const cacheKey = buildGroupAdminMemberCacheKey(numericChatId, numericUserId);
  const cached = readTimedCacheValue(groupAdminMembershipCache, cacheKey);
  if (cached === true || cached === false) {
    return cached;
  }

  const fromListCache = getGroupAdminStatusFromCachedList(numericChatId, numericUserId);
  if (fromListCache === true || fromListCache === false) {
    writeTimedCacheValue(groupAdminMembershipCache, cacheKey, fromListCache, GROUP_ADMIN_MEMBER_CACHE_TTL_MS);
    return fromListCache;
  }

  try {
    const member = await telegram(env, 'getChatMember', {
      chat_id: numericChatId,
      user_id: numericUserId,
    });
    const status = String(member?.status || '').toLowerCase();
    const isAdmin = status === 'creator' || status === 'administrator';
    writeTimedCacheValue(groupAdminMembershipCache, cacheKey, isAdmin, GROUP_ADMIN_MEMBER_CACHE_TTL_MS);
    return isAdmin;
  } catch (error) {
    return false;
  }
}

async function isTelegramGroupOwner(env, chatId, userId) {
  const numericChatId = Number(chatId);
  const numericUserId = Number(userId);
  if (!(Number.isFinite(numericChatId) && numericChatId < 0 && Number.isFinite(numericUserId) && numericUserId > 0)) {
    return false;
  }

  const cachedMembers = readTimedCacheValue(groupAdminListCache, String(numericChatId));
  if (Array.isArray(cachedMembers)) {
    const member = cachedMembers.find((item) => Number(item?.user?.id) === numericUserId);
    if (member) {
      const status = String(member.status || '').toLowerCase();
      return status === 'creator' || status === 'owner';
    }
  }

  try {
    const member = await telegram(env, 'getChatMember', {
      chat_id: numericChatId,
      user_id: numericUserId,
    });
    const status = String(member?.status || '').toLowerCase();
    return status === 'creator' || status === 'owner';
  } catch (error) {
    return false;
  }
}

function isAnonymousAdminMessage(message, adminChatId) {
  if (!message || !message.chat || !message.sender_chat) return false;
  if (message.chat.type === 'private') return false;
  const chatId = Number(message.chat.id);
  const senderChatId = Number(message.sender_chat.id);
  return chatId === Number(adminChatId) && senderChatId === Number(adminChatId);
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch (error) {
    throw new AppError(400, '请求体必须是合法 JSON');
  }
}

async function syncTelegramProfile(env, userId, options = {}) {
  const numericUserId = Number(userId);
  const existing = options.existing || (await getUserProfile(env, numericUserId)) || {};
  const persistProfile = options.persist !== false;
  const nowIso = new Date().toISOString();
  const lastSyncMs = existing?.lastProfileSyncAt ? new Date(existing.lastProfileSyncAt).getTime() : 0;
  const skipRemoteSync =
    !env.BOT_TOKEN ||
    numericUserId <= 0 ||
    (lastSyncMs && Date.now() - lastSyncMs < PROFILE_SYNC_INTERVAL_MS && existing?.profileStatus !== 'error');

  const record = {
    ...existing,
    userId: numericUserId,
    username: options.user?.username || existing?.username || null,
    firstName: options.user?.first_name || options.user?.firstName || existing?.firstName || null,
    lastName: options.user?.last_name || options.user?.lastName || existing?.lastName || null,
    displayName:
      buildDisplayName({
        firstName: options.user?.first_name || options.user?.firstName || existing?.firstName,
        lastName: options.user?.last_name || options.user?.lastName || existing?.lastName,
        username: options.user?.username || existing?.username,
        displayName: existing?.displayName,
        userId: numericUserId,
      }) || existing?.displayName || null,
    chatType: options.chat?.type || existing?.chatType || null,
    profileSource: existing?.profileSource || 'message',
    profileStatus: existing?.profileStatus || 'message-only',
    hasAvatar: Boolean(existing?.hasAvatar),
    avatarFileId: existing?.avatarFileId || null,
    avatarFileUniqueId: existing?.avatarFileUniqueId || null,
    avatarFilePath: existing?.avatarFilePath || null,
    avatarUpdatedAt: existing?.avatarUpdatedAt || null,
    avatarUrl: existing?.avatarUrl || null,
    lastProfileSyncAt: existing?.lastProfileSyncAt || null,
    profileSyncError: existing?.profileSyncError || null,
  };

  if (skipRemoteSync) {
    record.profileStatus = record.profileStatus || 'message-only';
    return record;
  }

  try {
    const photos = await telegram(env, 'getUserProfilePhotos', {
      user_id: numericUserId,
      limit: 1,
    });
    const bestPhoto = extractBestTelegramPhoto(photos);

    if (bestPhoto?.file_id) {
      const file = await telegram(env, 'getFile', { file_id: bestPhoto.file_id });
      const filePath = file?.file_path || null;
      record.hasAvatar = true;
      record.avatarFileId = bestPhoto.file_id;
      record.avatarFileUniqueId = bestPhoto.file_unique_id || null;
      record.avatarFilePath = filePath;
      record.avatarUpdatedAt = nowIso;
      record.avatarUrl = filePath ? buildTelegramAvatarProxyUrl(numericUserId) : record.avatarUrl;
      record.profileStatus = 'complete';
      record.profileSource = 'telegram-api';
    } else {
      record.hasAvatar = false;
      record.avatarFileId = null;
      record.avatarFileUniqueId = null;
      record.avatarFilePath = null;
      record.avatarUpdatedAt = nowIso;
      record.avatarUrl = null;
      record.profileStatus = record.firstName || record.lastName || record.username ? 'partial' : 'message-only';
      record.profileSource = 'telegram-api';
    }

    record.lastProfileSyncAt = nowIso;
    record.profileSyncError = null;
    if (env.BOT_KV && persistProfile) {
      await putUserProfileIfChanged(env, numericUserId, record, { existing });
    }
    return record;
  } catch (error) {
    record.lastProfileSyncAt = nowIso;
    record.profileStatus = record.firstName || record.lastName || record.username ? 'partial' : 'error';
    record.profileSyncError = error instanceof Error ? error.message : String(error);
    if (env.BOT_KV && persistProfile) {
      await putUserProfileIfChanged(env, numericUserId, record, { existing });
    }
    return record;
  }
}

function extractBestTelegramPhoto(photos) {
  const sets = Array.isArray(photos?.photos) ? photos.photos : [];
  const variants = sets[0] || [];
  return variants[variants.length - 1] || null;
}

function buildTelegramAvatarProxyUrl(userId) {
  return `${ADMIN_API_PREFIX}/avatar?userId=${encodeURIComponent(String(userId))}`;
}

function buildAdminPanelUrl(env, publicBaseUrl = '') {
  const configured = String(env.ADMIN_PANEL_URL || '').trim();
  if (configured) {
    try {
      return new URL(configured).toString();
    } catch (error) {
      // ignore invalid explicit panel url and continue fallback resolution
    }
  }

  const raw = String(publicBaseUrl || env.PUBLIC_BASE_URL || '').trim();
  if (!raw) {
    return DEFAULT_ADMIN_PANEL_EXTERNAL_URL || ADMIN_PANEL_PATH;
  }

  try {
    const parsed = new URL(raw);
    const origin = parsed.origin;
    if (!origin) return DEFAULT_ADMIN_PANEL_EXTERNAL_URL || ADMIN_PANEL_PATH;
    return `${origin}${ADMIN_PANEL_PATH}`;
  } catch (error) {
    return DEFAULT_ADMIN_PANEL_EXTERNAL_URL || ADMIN_PANEL_PATH;
  }
}

function buildAdminPanelRedirectUrl(env, publicBaseUrl = '', request = null) {
  const target = buildAdminPanelUrl(env, publicBaseUrl);
  if (!isAbsoluteHttpUrl(target)) return target;

  try {
    const targetUrl = new URL(target);
    const workerOrigin = getRequestOrigin(request) || getUrlOrigin(publicBaseUrl) || '';
    if (workerOrigin) {
      targetUrl.searchParams.set('worker_origin', workerOrigin);
    }
    return targetUrl.toString();
  } catch (error) {
    return target;
  }
}

function getAdminPanelEntryUrl(env, publicBaseUrl = '') {
  const raw = String(publicBaseUrl || env.PUBLIC_BASE_URL || '').trim();
  if (!raw) return '';

  try {
    const origin = new URL(raw).origin;
    return `${origin}${ADMIN_PANEL_PATH}`;
  } catch (error) {
    return '';
  }
}

async function resolveAdminPanelUrl(env, publicBaseUrl = '') {
  const directUrl = buildAdminPanelUrl(env, publicBaseUrl);
  if (isAbsoluteHttpUrl(directUrl)) {
    return directUrl;
  }

  if (env.BOT_TOKEN) {
    try {
      const webhookInfo = await telegram(env, 'getWebhookInfo', {});
      const webhookUrl = String(webhookInfo?.url || '').trim();
      if (webhookUrl) {
        const webhookOrigin = new URL(webhookUrl).origin;
        const webhookResolvedUrl = buildAdminPanelUrl(env, webhookOrigin);
        if (isAbsoluteHttpUrl(webhookResolvedUrl)) {
          return webhookResolvedUrl;
        }
      }
    } catch (error) {
      // ignore webhook lookup failures and keep local fallback
    }
  }

  return directUrl;
}

function isAbsoluteHttpUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (error) {
    return false;
  }
}

async function handleTelegramAvatarProxy(request, env) {
  ensureEnv(env, ['BOT_TOKEN']);
  const url = new URL(request.url);
  const userId = toChatId(url.searchParams.get('userId'));
  const profile = await syncTelegramProfile(env, userId, {
    existing: await getUserProfile(env, userId),
  });
  if (!profile?.avatarFilePath) {
    throw new AppError(404, '该用户暂无可用头像');
  }

  const fileUrl = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${profile.avatarFilePath}`;
  const response = await fetch(fileUrl, {
    headers: {
      accept: 'image/*',
    },
  });

  if (!response.ok) {
    throw new AppError(response.status, '头像拉取失败');
  }

  return new Response(response.body, {
    status: 200,
    headers: {
      'content-type': response.headers.get('content-type') || 'image/jpeg',
      'cache-control': 'private, max-age=3600',
      ...corsHeaders(request),
    },
  });
}

function ensureEnv(env, keys) {
  for (const key of keys) {
    if (!env[key]) {
      throw new AppError(500, `缺少环境变量：${key}`);
    }
  }
}

function toChatId(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new AppError(400, 'userId / ADMIN_CHAT_ID 必须是合法数字');
  }
  return num;
}

function getPublicBaseUrl(url, env) {
  const raw = String(env.PUBLIC_BASE_URL || url.origin).trim();
  try {
    const parsed = new URL(raw);
    return parsed.origin.replace(/\/$/, '');
  } catch (error) {
    throw new AppError(500, 'PUBLIC_BASE_URL 不是合法 URL');
  }
}

function html(content, status = 200, request = null, extraHeaders = {}, env = null) {
  return new Response(content, {
    status,
    headers: {
      'content-type': 'text/html; charset=UTF-8',
      ...corsHeaders(request, env),
      ...extraHeaders,
    },
  });
}

function json(data, status = 200, extraHeaders = {}, request = null, env = null) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      ...corsHeaders(request, env),
      ...extraHeaders,
    },
  });
}

function corsHeaders(request = null, env = null) {
  const origin =
    typeof request === 'string'
      ? request
      : request?.headers?.get?.('origin') || request?.headers?.get?.('Origin') || '';
  const allowOrigin = resolveAllowedOrigin(origin, request, env);

  return {
    'access-control-allow-origin': allowOrigin,
    'access-control-allow-methods': 'GET,HEAD,POST,DELETE,OPTIONS',
    'access-control-allow-headers': 'Content-Type, Authorization, X-Admin-Key, X-CSRF-Token, X-Deploy-Bootstrap-Token',
    'access-control-allow-credentials': 'true',
    vary: 'Origin',
  };
}

function resolveAllowedOrigin(origin, request = null, env = null) {
  const requestOrigin = getRequestOrigin(request);
  const fallback = requestOrigin || 'null';
  if (!origin) return fallback;

  try {
    const url = new URL(origin);
    const isSameOrigin = Boolean(requestOrigin && url.origin === requestOrigin);
    const configuredPanelOrigin = getUrlOrigin(env?.ADMIN_PANEL_URL || '');
    const isConfiguredPanel = Boolean(configuredPanelOrigin && url.origin === configuredPanelOrigin);

    if (isSameOrigin || isConfiguredPanel) {
      return origin;
    }
  } catch (error) {
    return fallback;
  }

  return fallback;
}

function validateAdminOrigin(request, env) {
  const origin = String(request?.headers?.get?.('origin') || '').trim();
  if (!origin) return;
  if (resolveAllowedOrigin(origin, request, env) === origin) return;
  throw new AppError(403, 'Origin not allowed');
}

function getRequestOrigin(request = null) {
  try {
    if (request?.url) return new URL(request.url).origin;
  } catch (error) {
    return '';
  }

  return '';
}

function getUrlOrigin(value = '') {
  try {
    const text = String(value || '').trim();
    if (!text) return '';
    const withProtocol = /^https?:\/\//i.test(text) ? text : `https://${text}`;
    const parsed = new URL(withProtocol);
    return parsed.origin.replace(/\/$/, '');
  } catch (error) {
    return '';
  }
}

function renderVerificationWebPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>安全验证</title>
  <style>
    :root{
      --bg:#f4f7fb;
      --card:#ffffff;
      --panel:#f8fbff;
      --line:#d6e0ee;
      --line-strong:#bfd0e5;
      --text:#132b45;
      --muted:#4f6985;
      --brand:#1372d3;
      --brand-2:#0b57a7;
      --brand-soft:#e8f3ff;
      --ok:#0f7745;
      --warn:#a46a00;
      --err:#ab1d2d;
      --shadow:0 22px 55px rgba(24,57,92,.14);
    }
    *{box-sizing:border-box}
    html,body{height:100%;min-height:100%}
    body{
      margin:0;
      font-family:'Noto Sans SC','PingFang SC','Microsoft YaHei','Segoe UI',sans-serif;
      color:var(--text);
      background:
        radial-gradient(1200px 520px at -15% -10%,rgba(19,114,211,.11),transparent 55%),
        radial-gradient(900px 460px at 115% -5%,rgba(29,184,122,.12),transparent 60%),
        linear-gradient(180deg,#f6f9fd,#f2f6fb);
      display:flex;
      justify-content:center;
      padding:calc(10px + env(safe-area-inset-top)) 12px calc(12px + env(safe-area-inset-bottom));
      overflow:auto;
    }
    .shell{
      width:min(760px,100%);
      background:var(--card);
      border:1px solid var(--line);
      border-radius:20px;
      overflow:hidden;
      box-shadow:var(--shadow);
      position:relative;
      isolation:isolate;
      max-height:calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 24px);
      display:flex;
      flex-direction:column;
    }
    .shell::before{
      content:'';
      position:absolute;
      inset:-120px auto auto -120px;
      width:260px;
      height:260px;
      border-radius:50%;
      background:radial-gradient(circle,rgba(19,114,211,.2),rgba(19,114,211,0));
      pointer-events:none;
      animation:floatGlow 8s ease-in-out infinite;
      z-index:-1;
    }
    .shell::after{
      content:'';
      position:absolute;
      inset:auto -90px -110px auto;
      width:240px;
      height:240px;
      border-radius:50%;
      background:radial-gradient(circle,rgba(29,184,122,.18),rgba(29,184,122,0));
      pointer-events:none;
      animation:floatGlow 10s ease-in-out infinite reverse;
      z-index:-1;
    }
    .hero{
      padding:20px 22px 16px;
      border-bottom:1px solid var(--line);
      background:linear-gradient(135deg,#f7fbff,#eef7ff 54%,#f6fff9);
    }
    .hero-head{
      display:flex;
      align-items:flex-start;
      justify-content:space-between;
      gap:10px;
      margin-bottom:10px;
    }
    .title{
      margin:0;
      font-size:clamp(30px,7.2vw,34px);
      line-height:1.1;
      font-weight:900;
      letter-spacing:.4px;
    }
    .subtitle{
      margin:8px 0 0;
      color:var(--muted);
      font-size:17px;
      line-height:1.6;
      font-weight:520;
    }
    .hero-tag{
      display:inline-flex;
      align-items:center;
      gap:6px;
      font-size:12px;
      color:#1a4e84;
      border:1px solid #b8d2ef;
      background:rgba(255,255,255,.8);
      border-radius:999px;
      padding:5px 10px;
      white-space:nowrap;
      margin-top:4px;
    }
    .flow{
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:8px;
      margin-top:14px;
    }
    .flow-item{
      border:1px dashed var(--line-strong);
      background:#fff;
      border-radius:12px;
      padding:10px 12px;
      display:flex;
      align-items:center;
      gap:10px;
      transition:.22s ease;
    }
    .flow-item i{
      width:22px;
      height:22px;
      border-radius:50%;
      border:2px solid #a8bed8;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      font-size:12px;
      color:#4f6985;
      flex:0 0 auto;
      font-style:normal;
      font-weight:700;
      background:#fff;
    }
    .flow-item span{
      font-size:13px;
      font-weight:700;
      color:#3f5975;
      letter-spacing:.2px;
    }
    .flow-item.active{
      border-style:solid;
      border-color:#9fc3ea;
      background:var(--brand-soft);
      transform:translateY(-1px);
    }
    .flow-item.active i{
      border-color:#5d97d5;
      color:#12539f;
      background:#e8f2ff;
    }
    .flow-item.done{
      border-style:solid;
      border-color:#8fd1b4;
      background:#ecfbf2;
    }
    .flow-item.done i{
      border-color:#3eaa72;
      color:#0f7745;
      background:#e3f8ed;
    }
    .content{
      padding:18px 20px 22px;
      display:grid;
      gap:14px;
      overflow-y:auto;
      overscroll-behavior:contain;
      padding-bottom:calc(22px + env(safe-area-inset-bottom));
    }
    .status{
      border-radius:14px;
      padding:12px 14px;
      border:1px solid var(--line);
      background:var(--panel);
      color:#375170;
      font-size:14px;
      line-height:1.7;
      white-space:pre-wrap;
    }
    .status.ok{border-color:#9fd4b8;background:#ecfbf2;color:var(--ok)}
    .status.warn{border-color:#e9cc8a;background:#fff8e9;color:var(--warn)}
    .status.err{border-color:#edafb8;background:#fff1f3;color:var(--err)}
    .panel{
      border:1px solid var(--line);
      background:#fff;
      border-radius:16px;
      padding:16px;
      animation:fadeInUp .28s ease both;
    }
    .panel h2{
      margin:0 0 10px;
      font-size:clamp(26px,7vw,42px);
      line-height:1.16;
      letter-spacing:.2px;
      font-weight:900;
      font-family:'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;
      word-break:break-word;
    }
    .meta{
      display:flex;
      flex-wrap:wrap;
      gap:8px;
      margin-bottom:12px;
    }
    .chip{
      border:1px solid #bdd0e6;
      background:#f5fbff;
      border-radius:999px;
      padding:6px 11px;
      font-size:13px;
      color:#3a5976;
      font-weight:600;
    }
    .board{
      border:1px solid #c0d2e7;
      border-radius:14px;
      overflow:hidden;
      background:#e8eff7;
      position:relative;
      margin:0 auto 10px;
      touch-action:none;
      width:100%;
      max-width:320px;
    }
    .puzzle-bg{
      width:100%;
      height:100%;
      display:block;
      object-fit:cover;
      user-select:none;
      pointer-events:none;
    }
    .board.rotation-board{
      width:min(100%,260px);
      max-width:260px;
      aspect-ratio:1/1;
      border-radius:999px;
      padding:10px;
      background:radial-gradient(circle at 35% 25%,#fff 0%,#eff7ff 42%,#dbeaf8 100%);
      box-shadow:inset 0 0 0 1px rgba(255,255,255,.75),0 16px 38px rgba(36,73,108,.18);
      overflow:visible;
    }
    .puzzle-bg.rotation-image{
      border-radius:999px;
      box-shadow:0 12px 28px rgba(28,59,88,.18);
      transition:transform .06s linear;
      transform-origin:center center;
    }
    .piece{
      position:absolute;
      border:3px solid rgba(31,59,89,.78);
      background:linear-gradient(160deg,rgba(255,255,255,.45),rgba(255,255,255,.18));
      border-radius:16px;
      box-shadow:0 10px 24px rgba(24,46,74,.28), inset 0 0 0 1px rgba(255,255,255,.45);
      pointer-events:none;
      transition:left .04s linear;
    }
    .piece.rotation-hidden{display:none}
    .slider-row{
      display:grid;
      gap:10px;
      margin-top:8px;
    }
    .slider-controls{
      padding:0 10px;
      touch-action:none;
      user-select:none;
    }
    .slider-track{
      position:relative;
      height:58px;
      border-radius:999px;
      border:1px solid #ccd8e7;
      background:linear-gradient(180deg,#f3f6fa,#e8edf3);
      box-shadow:inset 0 2px 4px rgba(30,54,82,.08);
      overflow:visible;
      touch-action:none;
      cursor:grab;
    }
    .slider-track:active{cursor:grabbing}
    .slider-track-fill{
      position:absolute;
      inset:0 auto 0 0;
      width:0;
      border-radius:999px;
      background:linear-gradient(90deg,rgba(69,194,110,.22),rgba(48,156,255,.16));
      pointer-events:none;
    }
    .slider-handle{
      position:absolute;
      left:0;
      top:50%;
      width:62px;
      height:62px;
      border:1px solid #d7e1eb;
      border-radius:999px;
      background:#fff;
      transform:translate(0,-50%);
      box-shadow:0 8px 20px rgba(33,58,88,.18);
      display:flex;
      align-items:center;
      justify-content:center;
      color:#44bd42;
      font-size:25px;
      font-weight:900;
      letter-spacing:2px;
      touch-action:none;
      z-index:2;
    }
    .slider-handle::before{
      content:'|||';
      transform:scaleX(.78);
    }
    .slider-track-text{
      position:absolute;
      inset:0 18px 0 78px;
      display:flex;
      align-items:center;
      justify-content:center;
      color:#8a9aac;
      font-size:15px;
      font-weight:700;
      pointer-events:none;
      white-space:nowrap;
    }
    .tiny{
      font-size:14px;
      color:#56738f;
      line-height:1.65;
    }
    .actions{
      display:flex;
      flex-wrap:wrap;
      gap:10px;
      margin-top:12px;
      position:sticky;
      bottom:-1px;
      padding-top:10px;
      padding-bottom:calc(10px + env(safe-area-inset-bottom));
      background:linear-gradient(180deg,rgba(255,255,255,0) 0%,rgba(255,255,255,.92) 34%,#fff 62%);
      z-index:3;
    }
    .primary-btn{
      border:0;
      border-radius:14px;
      background:linear-gradient(135deg,var(--brand),var(--brand-2));
      color:#fff;
      min-width:160px;
      padding:12px 18px;
      font-size:17px;
      font-weight:820;
      letter-spacing:.3px;
      box-shadow:0 8px 18px rgba(19,114,211,.25);
      cursor:pointer;
      transition:.2s ease;
    }
    .primary-btn:hover{transform:translateY(-1px);box-shadow:0 12px 22px rgba(19,114,211,.3)}
    .primary-btn:active{transform:translateY(1px)}
    .primary-btn[disabled]{
      opacity:.55;
      cursor:not-allowed;
      box-shadow:none;
    }
    .grid{
      display:grid;
      grid-template-columns:repeat(3,minmax(0,1fr));
      gap:10px;
      margin-top:8px;
    }
    .grid button{
      min-height:76px;
      aspect-ratio:1/1;
      border:1px solid #bfd0e5;
      border-radius:16px;
      background:linear-gradient(180deg,#f2f8ff,#e6f0fb);
      color:#183955;
      font-size:clamp(28px,7.2vw,34px);
      font-weight:700;
      transition:transform .12s ease,border-color .12s ease,box-shadow .12s ease,background .12s ease;
      cursor:pointer;
    }
    .grid button:hover{
      border-color:#7aaada;
      box-shadow:0 10px 18px rgba(34,72,112,.12);
      transform:translateY(-1px);
    }
    .grid button:active{transform:scale(.985)}
    .grid button.selected{
      border-color:#1770cf;
      background:linear-gradient(180deg,#daebff,#c8e2ff);
      box-shadow:0 0 0 3px rgba(23,112,207,.15);
    }
    .choice-card{
      display:grid;
      gap:14px;
    }
    .choice-image-wrap{
      border:1px solid #c4d5e9;
      border-radius:16px;
      padding:12px;
      background:linear-gradient(180deg,#f6fbff,#eef6ff);
      display:flex;
      justify-content:center;
      overflow:hidden;
    }
    .choice-image{
      width:min(100%,420px);
      height:auto;
      border-radius:12px;
      display:block;
      box-shadow:0 12px 28px rgba(24,57,92,.12);
    }
    .choice-grid{
      display:grid;
      grid-template-columns:repeat(2,minmax(0,1fr));
      gap:10px;
    }
    .choice-grid button{
      border:1px solid #bfd0e5;
      border-radius:16px;
      background:linear-gradient(180deg,#fff,#eef6ff);
      color:#183955;
      min-height:58px;
      font-size:clamp(24px,7vw,32px);
      font-weight:900;
      letter-spacing:1px;
      cursor:pointer;
      transition:transform .12s ease,border-color .12s ease,box-shadow .12s ease,background .12s ease;
    }
    .choice-grid button.selected{
      border-color:#1770cf;
      background:linear-gradient(180deg,#daebff,#c8e2ff);
      box-shadow:0 0 0 3px rgba(23,112,207,.15);
    }
    .foot{
      color:#6a839d;
      font-size:13px;
      line-height:1.65;
    }
    .hide{display:none}
    @keyframes floatGlow{
      0%,100%{transform:translateY(0)}
      50%{transform:translateY(-8px)}
    }
    @keyframes fadeInUp{
      from{opacity:0;transform:translateY(8px)}
      to{opacity:1;transform:translateY(0)}
    }
    @media (max-width:640px){
      body{padding:calc(8px + env(safe-area-inset-top)) 8px calc(10px + env(safe-area-inset-bottom))}
      .shell{border-radius:16px}
      .hero{padding:16px}
      .title{font-size:clamp(27px,8vw,31px)}
      .subtitle{font-size:15px}
      .content{padding:14px}
      .panel{padding:14px}
      .panel h2{font-size:clamp(26px,10.5vw,34px)}
      .grid button{min-height:70px;font-size:clamp(24px,9vw,30px)}
      .board.rotation-board{width:min(86vw,246px);max-width:246px}
      .slider-controls{padding:0 6px}
      .slider-track{height:54px}
      .slider-handle{width:58px;height:58px}
      .slider-track-text{font-size:13px;inset-left:68px}
      .primary-btn{width:100%}
      .chip{font-size:12px;padding:5px 10px}
    }
    @media (max-width:380px){
      .hero{padding:14px}
      .flow-item{padding:8px 10px}
      .flow-item span{font-size:12px}
      .panel h2{font-size:clamp(23px,9.8vw,30px)}
      .grid{gap:8px}
      .grid button{border-radius:14px}
    }


    /* Verification UI refresh: compact, calm and mobile-first. */
    body{
      align-items:flex-start;
      background:
        radial-gradient(720px 360px at 10% -8%,rgba(37,99,235,.12),transparent 60%),
        radial-gradient(620px 320px at 100% 0,rgba(20,184,166,.10),transparent 58%),
        #f4f7fb;
    }
    .shell{
      width:min(560px,100%);
      max-height:none;
      border-color:rgba(148,163,184,.32);
      border-radius:26px;
      box-shadow:0 24px 70px rgba(30,64,175,.12),0 2px 10px rgba(15,23,42,.06);
    }
    .shell::before{width:220px;height:220px;inset:-140px auto auto -120px;opacity:.7}
    .shell::after{width:190px;height:190px;inset:auto -110px -120px auto;opacity:.65}
    .hero{
      padding:20px 22px 16px;
      background:linear-gradient(145deg,rgba(255,255,255,.98),rgba(248,251,255,.96));
      border-bottom-color:rgba(203,213,225,.72);
    }
    .hero-head{align-items:center;margin-bottom:14px}
    .title{font-size:clamp(24px,5.8vw,29px);line-height:1.15;letter-spacing:-.5px}
    .subtitle{max-width:430px;margin-top:6px;font-size:13px;line-height:1.55;font-weight:500;color:#64748b}
    .hero-tag{
      gap:5px;margin-top:0;padding:6px 10px;border:0;color:#1d4ed8;background:#eff6ff;
      font-size:11px;font-weight:750;
    }
    .hero-tag::before{
      content:'✓';display:grid;place-items:center;width:16px;height:16px;border-radius:50%;
      color:#fff;background:#2563eb;font-size:10px;
    }
    .flow{gap:10px;margin-top:0}
    .flow-item{
      min-width:0;padding:9px 11px;border:1px solid #e2e8f0;border-radius:13px;
      background:#f8fafc;box-shadow:none;transform:none;
    }
    .flow-item i{width:24px;height:24px;border:0;color:#64748b;background:#e2e8f0}
    .flow-item span{
      overflow:hidden;color:#64748b;font-size:12px;text-overflow:ellipsis;white-space:nowrap;
    }
    .flow-item.active{
      border-color:#bfdbfe;background:#eff6ff;
      box-shadow:inset 0 0 0 1px rgba(59,130,246,.08);transform:none;
    }
    .flow-item.active i{border:0;color:#fff;background:#2563eb}
    .flow-item.active span{color:#1e40af}
    .flow-item.done{border-color:#bbf7d0;background:#f0fdf4}
    .flow-item.done i{border:0;color:#fff;background:#16a34a}
    .content{gap:12px;padding:14px 16px 18px;overflow:visible}
    .status{
      padding:10px 12px;border-color:#e2e8f0;border-radius:12px;background:#f8fafc;
      color:#475569;font-size:13px;line-height:1.5;
    }
    .status.warn{border-color:#fde68a;background:#fffbeb;color:#92400e}
    .status.ok{border-color:#bbf7d0;background:#f0fdf4;color:#166534}
    .status.err{border-color:#fecdd3;background:#fff1f2;color:#be123c}
    .panel{
      padding:18px;border-color:#e2e8f0;border-radius:20px;
      box-shadow:0 10px 30px rgba(15,23,42,.045);
    }
    .panel h2{
      margin-bottom:8px;color:#0f2742;font-size:clamp(21px,5vw,25px);line-height:1.25;
      letter-spacing:-.4px;font-weight:850;
    }
    .meta{gap:6px;margin-bottom:14px}
    .chip{
      padding:5px 9px;border-color:#dbeafe;background:#f8fbff;color:#4b6682;
      font-size:11px;font-weight:650;
    }
    .board.rotation-board{
      width:min(100%,226px);max-width:226px;padding:9px;border:1px solid #dbeafe;
      background:radial-gradient(circle at 35% 25%,#fff 0%,#f0f7ff 46%,#e3effb 100%);
      box-shadow:inset 0 0 0 1px rgba(255,255,255,.85),0 14px 32px rgba(30,64,175,.13);
    }
    .puzzle-bg.rotation-image{box-shadow:0 8px 22px rgba(30,64,175,.13)}
    .slider-row{gap:8px;margin-top:14px}
    .slider-controls{padding:0 3px}
    .slider-track{
      height:52px;border-color:#dbe3ee;background:#f1f5f9;
      box-shadow:inset 0 1px 3px rgba(15,23,42,.08);
    }
    .slider-track-fill{background:linear-gradient(90deg,rgba(37,99,235,.18),rgba(20,184,166,.13))}
    .slider-handle{
      width:54px;height:54px;border-color:#dbeafe;color:#2563eb;
      box-shadow:0 7px 18px rgba(30,64,175,.18);
    }
    .slider-track-text{inset:0 14px 0 66px;color:#64748b;font-size:12px;font-weight:650}
    .tiny{padding:0 4px;color:#64748b;font-size:12px;line-height:1.55;text-align:center}
    .actions{
      margin:10px -2px -2px;padding:8px 2px 2px;
      background:linear-gradient(180deg,rgba(255,255,255,0),#fff 34%);
    }
    .primary-btn{
      min-height:50px;border-radius:15px;background:linear-gradient(135deg,#2563eb,#1d4ed8);
      font-size:16px;font-weight:780;box-shadow:0 9px 22px rgba(37,99,235,.24);
    }
    .grid{gap:9px}
    .grid button,.choice-grid button{
      border-color:#dbe3ee;border-radius:14px;background:#f8fafc;box-shadow:none;
    }
    .grid button.selected,.choice-grid button.selected{
      border-color:#60a5fa;background:#eff6ff;box-shadow:0 0 0 3px rgba(59,130,246,.12);
    }
    .choice-image-wrap{border-color:#e2e8f0;border-radius:16px;background:#f8fafc}
    .foot{color:#64748b;font-size:12px;line-height:1.55}

    @media (max-width:640px){
      body{display:block;padding:0;background:#f8fafc}
      .shell{
        width:100%;min-height:100dvh;max-height:none;border:0;border-radius:0;
        box-shadow:none;overflow:visible;
      }
      .hero{padding:16px 16px 13px}
      .hero-head{gap:8px;margin-bottom:12px}
      .title{font-size:23px}
      .subtitle{margin-top:4px;font-size:12px;line-height:1.5}
      .hero-tag{padding:5px 8px;font-size:10px}
      .hero-tag::before{width:14px;height:14px;font-size:9px}
      .flow{gap:8px}
      .flow-item{padding:8px 9px;gap:8px}
      .flow-item i{width:22px;height:22px}
      .flow-item span{font-size:11px}
      .content{padding:12px 12px calc(16px + env(safe-area-inset-bottom))}
      .status{padding:9px 11px;font-size:12px}
      .panel{padding:15px;border-radius:18px}
      .panel h2{font-size:21px}
      .board.rotation-board{width:min(62vw,218px);max-width:218px}
      .slider-controls{padding:0}
      .slider-track{height:50px}
      .slider-handle{width:52px;height:52px}
      .slider-track-text{inset:0 10px 0 60px;font-size:11px}
      .primary-btn{width:100%;min-height:50px}
      .chip{padding:4px 8px;font-size:10px}
    }
    @media (max-width:380px){
      .hero{padding:14px 13px 12px}
      .title{font-size:21px}
      .subtitle{font-size:11px}
      .content{padding:10px}
      .panel{padding:13px}
      .panel h2{font-size:19px}
      .board.rotation-board{width:min(60vw,202px);max-width:202px}
    }
  </style>
</head>
<body>
  <main class="shell">
    <header class="hero">
      <div class="hero-head">
        <div>
          <h1 id="pageTitle" class="title">两步安全验证</h1>
          <p id="pageSubtitle" class="subtitle">完成两个简单步骤，确认你是真实用户。每步最多尝试 3 次。</p>
        </div>
        <span class="hero-tag">安全连接</span>
      </div>
      <div id="flow" class="flow">
        <div id="stageOne" class="flow-item"><i>1</i><span id="stageOneLabel">旋转验证</span></div>
        <div id="stageTwo" class="flow-item"><i>2</i><span id="stageTwoLabel">九宫格点选</span></div>
      </div>
    </header>
    <section class="content">
      <div id="status" class="status">正在加载验证会话...</div>

      <section id="choicePanel" class="panel hide">
        <h2>识别图片数字</h2>
        <div class="meta">
          <span id="choiceAttemptChip" class="chip"></span>
          <span class="chip">四选一</span>
        </div>
        <div class="choice-card">
          <div class="choice-image-wrap">
            <img id="choiceImage" class="choice-image" alt="numeric captcha" />
          </div>
          <div id="choiceOptions" class="choice-grid"></div>
        </div>
        <div class="actions">
          <button id="choiceSubmitBtn" class="primary-btn" type="button" disabled>提交答案</button>
        </div>
        <div id="choiceHint" class="foot">请选择图片中对应的数字。</div>
      </section>

      <section id="sliderPanel" class="panel hide">
        <h2>旋转图片</h2>
        <div class="meta">
          <span id="sliderAttemptChip" class="chip"></span>
          <span class="chip">调整到正确方向</span>
        </div>
        <div id="puzzleWrap" class="board">
          <img id="puzzleBg" class="puzzle-bg" alt="slider puzzle" />
          <div id="piece" class="piece"></div>
        </div>
        <div class="slider-row">
          <input id="sliderInput" type="hidden" value="0" />
          <div class="slider-controls">
            <div id="sliderTrack" class="slider-track" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
              <div id="sliderTrackFill" class="slider-track-fill"></div>
              <div id="sliderHandle" class="slider-handle" aria-hidden="true"></div>
              <span id="sliderTrackText" class="slider-track-text">拖动滑杆旋转图片</span>
            </div>
          </div>
          <div class="tiny">将箭头和字母 N 调整为朝上，然后确认。</div>
        </div>
        <div class="actions">
          <button id="sliderSubmitBtn" class="primary-btn" type="button">确认并继续</button>
        </div>
      </section>

      <section id="gridPanel" class="panel hide">
        <h2>选择对应图片</h2>
        <div class="meta">
          <span id="gridAttemptChip" class="chip"></span>
          <span id="gridPromptChip" class="chip"></span>
        </div>
        <div id="gridCells" class="grid"></div>
        <div class="actions">
          <button id="gridSubmitBtn" class="primary-btn" type="button" disabled>完成验证</button>
        </div>
        <div id="gridHint" class="foot">当前已选择 0/2</div>
      </section>
    </section>
  </main>

  <script>
    (() => {
      const API_PREFIX = '${VERIFY_API_PREFIX}';
      const params = new URLSearchParams(window.location.search);
      const userId = Number(params.get('uid'));
      const token = String(params.get('token') || '');
      const state = {
        payload: null,
        sliderTrace: [],
        sliderDragStart: 0,
        sliderDragging: false,
        sliderScale: 1,
        sliderView: null,
        sliderInteraction: null,
        sliderProof: null,
        selectedChoice: '',
        selected: new Set(),
        blockedTimer: null,
        loadingSession: false,
        pendingSessionReload: false,
      };

      const el = {
        status: document.getElementById('status'),
        pageTitle: document.getElementById('pageTitle'),
        pageSubtitle: document.getElementById('pageSubtitle'),
        flow: document.getElementById('flow'),
        stageOne: document.getElementById('stageOne'),
        stageTwo: document.getElementById('stageTwo'),
        stageOneLabel: document.getElementById('stageOneLabel'),
        stageTwoLabel: document.getElementById('stageTwoLabel'),
        choicePanel: document.getElementById('choicePanel'),
        choiceImage: document.getElementById('choiceImage'),
        choiceOptions: document.getElementById('choiceOptions'),
        choiceSubmitBtn: document.getElementById('choiceSubmitBtn'),
        choiceAttemptChip: document.getElementById('choiceAttemptChip'),
        choiceHint: document.getElementById('choiceHint'),
        sliderPanel: document.getElementById('sliderPanel'),
        sliderInput: document.getElementById('sliderInput'),
        sliderTrack: document.getElementById('sliderTrack'),
        sliderTrackFill: document.getElementById('sliderTrackFill'),
        sliderTrackText: document.getElementById('sliderTrackText'),
        sliderHandle: document.getElementById('sliderHandle'),
        sliderSubmitBtn: document.getElementById('sliderSubmitBtn'),
        sliderAttemptChip: document.getElementById('sliderAttemptChip'),
        puzzleWrap: document.getElementById('puzzleWrap'),
        puzzleBg: document.getElementById('puzzleBg'),
        piece: document.getElementById('piece'),
        gridPanel: document.getElementById('gridPanel'),
        gridCells: document.getElementById('gridCells'),
        gridSubmitBtn: document.getElementById('gridSubmitBtn'),
        gridAttemptChip: document.getElementById('gridAttemptChip'),
        gridPromptChip: document.getElementById('gridPromptChip'),
        gridHint: document.getElementById('gridHint'),
      };

      if (!Number.isFinite(userId) || userId <= 0 || !token) {
        setStatus('链接参数无效，请返回 Telegram 重新打开验证按钮。', 'err');
        return;
      }

      bindSliderEvents();
      bindChoiceEvents();
      bindGridEvents();
      loadSession();
      window.addEventListener('pageshow', () => loadSession({ silent: true }));
      window.addEventListener('focus', () => loadSession({ silent: true }));
      window.addEventListener('resize', () => {
        if (state.payload && state.payload.stage === 'slider') {
          syncSliderPieceVisual();
          syncSliderTrackVisual();
        }
      });
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          loadSession({ silent: true });
        }
      });

      async function loadSession(options = {}) {
        const silent = Boolean(options && options.silent);
        if (state.loadingSession) {
          state.pendingSessionReload = true;
          return;
        }
        state.loadingSession = true;
        try {
          if (!silent) {
            setStatus('正在加载验证会话...', 'warn');
          }
          const payload = await callApi('/session', {});
          state.payload = payload;
          renderByPayload(payload);
        } catch (error) {
          const message = String(error.message || error);
          if (
            message.includes('验证会话不匹配') ||
            message.includes('验证会话不存在') ||
            message.includes('验证链接已失效')
          ) {
            setStatus('当前验证链接已失效，请返回 Telegram 点击最新验证按钮。', 'err');
          } else {
            setStatus('加载失败：' + message, 'err');
          }
        } finally {
          state.loadingSession = false;
          if (state.pendingSessionReload) {
            state.pendingSessionReload = false;
            loadSession({ silent: true });
          }
        }
      }

      function setStatus(text, tone) {
        el.status.className = 'status' + (tone ? ' ' + tone : '');
        el.status.textContent = text;
      }

      function configureFlow(payload) {
        const numeric = Boolean(payload && (payload.flowMode === 'numeric-choice' || payload.stage === 'choice'));
        el.pageTitle.textContent = numeric ? '数字图片验证' : '两步安全验证';
        el.pageSubtitle.textContent = numeric
          ? '看清图片中的 4 位数字，选择正确答案。'
          : '完成两个简单步骤，确认你是真实用户。每步最多尝试 3 次。';
        el.stageOneLabel.textContent = numeric ? '数字四选一' : '旋转验证';
        el.stageTwoLabel.textContent = '九宫格点选';
        el.stageTwo.classList.toggle('hide', numeric);
        el.flow.style.gridTemplateColumns = numeric ? '1fr' : '1fr 1fr';
      }

      function setStageState(stage, doneFirst = false, doneSecond = false) {
        el.stageOne.classList.remove('active', 'done');
        el.stageTwo.classList.remove('active', 'done');
        if (stage === 'choice') {
          el.stageOne.classList.add('active');
          return;
        }
        if (doneFirst) {
          el.stageOne.classList.add('done');
        } else if (stage === 'slider') {
          el.stageOne.classList.add('active');
        }
        if (doneSecond) {
          el.stageTwo.classList.add('done');
        } else if (stage === 'grid') {
          el.stageTwo.classList.add('active');
        }
      }

      function clearBlockedTimer() {
        if (state.blockedTimer) {
          clearInterval(state.blockedTimer);
          state.blockedTimer = null;
        }
      }

      function renderByPayload(payload) {
        clearBlockedTimer();
        hidePanels();
        configureFlow(payload);

        if (!payload || typeof payload !== 'object') {
          setStatus('返回数据异常，请关闭页面后重试。', 'err');
          return;
        }

        if (payload.status === 'verified') {
          configureFlow(state.payload || payload);
          setStageState('done', true, true);
          setStatus('验证已通过，你可以返回 Telegram 继续发送消息。', 'ok');
          return;
        }

        if (payload.status === 'blocked') {
          setStageState('');
          startBlockedCountdown(payload.blockedUntil);
          return;
        }

        if (payload.stage === 'choice') {
          renderChoice(payload);
          return;
        }

        if (payload.stage === 'slider') {
          renderSlider(payload);
          return;
        }

        if (payload.stage === 'grid') {
          renderGrid(payload);
          return;
        }

        setStageState('');
        setStatus('未知状态，请返回 Telegram 重新发起验证。', 'err');
      }

      function hidePanels() {
        el.choicePanel.classList.add('hide');
        el.sliderPanel.classList.add('hide');
        el.gridPanel.classList.add('hide');
      }

      function renderChoice(payload) {
        const choice = payload.choice || {};
        const options = Array.isArray(choice.options) ? choice.options : [];
        const attemptsLeft = Number(payload.choiceAttemptsLeft || 0);

        setStageState('choice', false, false);
        el.choicePanel.classList.remove('hide');
        el.choiceAttemptChip.textContent = '剩余次数：' + attemptsLeft;
        el.choiceImage.src = String(choice.image || '');
        el.choiceImage.alt = String(choice.question || 'numeric captcha');
        el.choiceOptions.innerHTML = '';
        state.selectedChoice = '';
        el.choiceSubmitBtn.disabled = true;
        el.choiceHint.textContent = '请选择图片中对应的数字。';

        options.forEach((option) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.dataset.answer = String(option);
          btn.textContent = String(option);
          el.choiceOptions.appendChild(btn);
        });

        if (payload.status === 'choice_failed') {
          setStatus('答案不正确，请重新选择。剩余次数：' + attemptsLeft, 'err');
        } else {
          setStatus('请识别图片中的数字，并选择对应答案。', 'warn');
        }
      }

      function renderSlider(payload) {
        const slider = payload.slider || {};
        const isRotation = String(slider.type || '') === 'rotation';
        const width = isRotation ? Number(slider.size || 240) : Number(slider.width || 320);
        const height = isRotation ? Number(slider.size || 240) : Number(slider.height || 180);
        const piece = Number(slider.piece || 46);
        const maxX = isRotation ? Number(slider.maxAngle || 360) : Number(slider.maxX || 250);
        const targetY = Number(slider.targetY || 56);
        const attemptsLeft = Number(payload.sliderAttemptsLeft || 0);

        setStageState('slider', false, false);
        el.sliderPanel.classList.remove('hide');
        el.sliderAttemptChip.textContent = '剩余次数：' + attemptsLeft;
        el.sliderInput.max = String(maxX);
        el.sliderInput.value = '0';
        el.puzzleWrap.classList.toggle('rotation-board', isRotation);
        el.puzzleBg.classList.toggle('rotation-image', isRotation);
        el.piece.classList.toggle('rotation-hidden', isRotation);
        el.puzzleWrap.style.maxWidth = width + 'px';
        el.puzzleWrap.style.width = '100%';
        el.puzzleWrap.style.aspectRatio = width + ' / ' + height;
        el.puzzleWrap.style.height = 'auto';
        el.puzzleBg.src = String(isRotation ? slider.image || '' : slider.background || '');
        state.sliderView = {
          type: isRotation ? 'rotation' : 'puzzle',
          width,
          height,
          piece,
          targetY,
          maxX,
        };
        state.sliderProof = {
          nonce: String(slider.nonce || ''),
          signature: String(slider.signature || ''),
        };
        syncSliderPieceVisual();
        syncSliderTrackVisual();

        state.sliderTrace = [];
        state.sliderDragging = false;
        state.sliderInteraction = null;

        if (payload.status === 'slider_failed') {
          setStatus('第一步未通过：' + formatSliderReason(payload.reason) + '。剩余次数：' + attemptsLeft, 'err');
        } else {
          setStatus(isRotation ? '第一步：拖动滑杆，把图片转正后提交。' : '第一步：拖动滑块并提交。', 'warn');
        }
      }

      function formatSliderReason(reason) {
        const text = String(reason || '');
        if (text === 'slider_position_mismatch') return '位置还没有完全对齐';
        if (text === 'slider_value_invalid') return '滑块位置无效';
        if (text === 'slider_missing') return '题目已失效';
        if (text === 'rotation_angle_mismatch') return '图片还没有转正';
        if (text === 'rotation_value_invalid') return '旋转角度无效';
        if (text === 'proof_missing') return '验证令牌缺失';
        if (text === 'proof_nonce_mismatch') return '验证令牌已失效';
        if (text === 'proof_signature_mismatch') return '验证签名异常';
        if (text === 'proof_expired') return '验证令牌已过期';
        if (text === 'trace_too_short') return '拖动轨迹过短，请按住滑块拖动';
        if (text === 'trace_too_fast') return '拖动太快，请稍微慢一点';
        if (text === 'trace_not_enough_segments') return '拖动轨迹不足';
        if (text === 'trace_direction_invalid') return '拖动方向异常';
        if (text === 'trace_distance_invalid') return '拖动距离异常';
        if (text === 'interaction_risk_high') return '交互行为异常，请按住滑块自然拖动';
        return '请重新对齐后提交';
      }

      function renderGrid(payload) {
        const grid = payload.grid || {};
        const cells = Array.isArray(grid.cells) ? grid.cells : [];
        const promptSymbols = Array.isArray(grid.promptSymbols) ? grid.promptSymbols : [];
        const attemptsLeft = Number(payload.gridAttemptsLeft || 0);

        setStageState('grid', true, false);
        el.gridPanel.classList.remove('hide');
        el.gridAttemptChip.textContent = '剩余次数：' + attemptsLeft;
        el.gridPromptChip.textContent = '请选择：' + promptSymbols.join(' 与 ');
        el.gridCells.innerHTML = '';
        state.selected = new Set();
        el.gridSubmitBtn.disabled = true;
        el.gridHint.textContent = '当前已选择 0/2';

        cells.forEach((item) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.dataset.index = String(item.index);
          btn.textContent = String(item.symbol || '?');
          el.gridCells.appendChild(btn);
        });

        if (payload.status === 'grid_failed') {
          setStatus('第二步未通过，请重新点选。剩余次数：' + attemptsLeft, 'err');
        } else {
          setStatus('第二步：在 9 个格子中点选 2 个目标。', 'warn');
        }
      }

      function startBlockedCountdown(blockedUntil) {
        const untilMs = blockedUntil ? new Date(blockedUntil).getTime() : 0;
        if (!untilMs || Number.isNaN(untilMs)) {
          setStatus('当前验证处于锁定状态，请稍后重试。', 'err');
          return;
        }
        const tick = () => {
          const left = untilMs - Date.now();
          if (left <= 0) {
            clearBlockedTimer();
            setStatus('锁定已到期，请回到 Telegram 发送任意消息重新获取验证入口。', 'warn');
            return;
          }
          const minutes = Math.floor(left / 60000);
          const seconds = Math.floor((left % 60000) / 1000);
          setStatus('验证锁定中，请 ' + minutes + ' 分 ' + seconds + ' 秒后重试。\\n到期时间：' + new Date(untilMs).toLocaleString(), 'err');
        };
        tick();
        state.blockedTimer = setInterval(tick, 1000);
      }

      function bindSliderEvents() {
        el.sliderTrack.addEventListener('pointerdown', beginSliderDrag);
        el.sliderTrack.addEventListener('pointermove', moveSliderDrag);
        el.sliderTrack.addEventListener('pointerup', endSliderDrag);
        el.sliderTrack.addEventListener('pointercancel', endSliderDrag);
        el.sliderTrack.addEventListener('keydown', handleSliderKeydown);
        window.addEventListener('blur', stopSliderMove);
        el.sliderSubmitBtn.addEventListener('click', submitSlider);
      }

      function beginSliderDrag(event) {
        if (!state.sliderView) return;
        event.preventDefault();
        stopSliderMove();
        state.sliderDragging = true;
        state.sliderTrace = [];
        state.sliderDragStart = performance.now();
        state.sliderInteraction = {
          dragStarted: true,
          pointerType: String(event.pointerType || 'unknown'),
          startedAt: state.sliderDragStart,
          endedAt: 0,
          eventCount: 0,
          startX: 0,
          endX: 0,
          trackWidth: Number(el.sliderTrack.clientWidth || 0),
        };
        if (el.sliderTrack.setPointerCapture && event.pointerId != null) {
          el.sliderTrack.setPointerCapture(event.pointerId);
        }
        setSliderFromClientX(event.clientX);
        pushTrace();
      }

      function moveSliderDrag(event) {
        if (!state.sliderDragging) return;
        event.preventDefault();
        setSliderFromClientX(event.clientX);
        pushTrace();
      }

      function endSliderDrag(event) {
        if (event) {
          event.preventDefault();
          if (el.sliderTrack.releasePointerCapture && event.pointerId != null) {
            try {
              el.sliderTrack.releasePointerCapture(event.pointerId);
            } catch (error) {
              // Pointer capture may already be released by the browser.
            }
          }
        }
        stopSliderMove();
      }

      function stopSliderMove() {
        if (state.sliderDragging) pushTrace();
        if (state.sliderInteraction) {
          state.sliderInteraction.endedAt = performance.now();
        }
        state.sliderDragging = false;
      }

      function handleSliderKeydown(event) {
        const max = Number(el.sliderInput.max || 0);
        const current = Number(el.sliderInput.value || 0);
        const step = event.shiftKey ? 10 : 3;
        let next = current;
        if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = Math.min(max, current + step);
        if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = Math.max(0, current - step);
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = max;
        if (next === current) return;
        event.preventDefault();
        if (!state.sliderTrace.length) {
          state.sliderDragStart = performance.now();
          state.sliderInteraction = {
            dragStarted: false,
            pointerType: 'keyboard',
            startedAt: state.sliderDragStart,
            endedAt: 0,
            eventCount: 0,
            startX: Number(el.sliderInput.value || 0),
            endX: Number(el.sliderInput.value || 0),
            trackWidth: Number(el.sliderTrack.clientWidth || 0),
          };
        }
        el.sliderInput.value = String(next);
        movePieceByInput();
        syncSliderTrackVisual();
        pushTrace();
      }

      function setSliderFromClientX(clientX) {
        const view = state.sliderView;
        if (!view) return;
        const rect = el.sliderTrack.getBoundingClientRect();
        const handleWidth = Number(el.sliderHandle.offsetWidth || 60);
        const travel = Math.max(1, rect.width - handleWidth);
        const raw = Number(clientX) - rect.left - handleWidth / 2;
        const ratio = Math.max(0, Math.min(1, raw / travel));
        const max = Number(el.sliderInput.max || view.maxX || 0);
        el.sliderInput.value = String(Math.round(ratio * max));
        movePieceByInput();
        syncSliderTrackVisual();
      }

      function movePieceByInput() {
        const view = state.sliderView;
        if (view && view.type === 'rotation') {
          const angle = Number(el.sliderInput.value || 0);
          el.puzzleBg.style.transform = 'rotate(' + angle + 'deg)';
          return;
        }
        const x = Number(el.sliderInput.value || 0);
        const scale = Number(state.sliderScale || 1);
        el.piece.style.left = Math.round(x * scale) + 'px';
      }

      function syncSliderTrackVisual() {
        const max = Number(el.sliderInput.max || 0);
        const handleWidth = Number(el.sliderHandle.offsetWidth || 60);
        const trackWidth = Number(el.sliderTrack.clientWidth || 1);
        const travel = Math.max(1, trackWidth - handleWidth);
        const x = Number(el.sliderInput.value || 0);
        const percent = max > 0 ? Math.max(0, Math.min(100, (x / max) * 100)) : 0;
        const handleLeft = Math.round((percent / 100) * travel);
        el.sliderHandle.style.transform = 'translate(' + handleLeft + 'px,-50%)';
        el.sliderTrackFill.style.width = Math.round(handleLeft + handleWidth / 2) + 'px';
        el.sliderTrack.setAttribute('aria-valuenow', String(Math.round(percent)));
        el.sliderTrackText.style.opacity = percent > 12 ? '0.35' : '1';
      }

      function syncSliderPieceVisual() {
        const view = state.sliderView;
        if (!view) return;
        if (view.type === 'rotation') {
          state.sliderScale = 1;
          el.piece.style.width = '0px';
          el.piece.style.height = '0px';
          el.puzzleBg.style.transform = 'rotate(' + Number(el.sliderInput.value || 0) + 'deg)';
          return;
        }
        const renderedWidth = Number(el.puzzleWrap.clientWidth || view.width);
        const scale = Math.max(0.2, Math.min(2, renderedWidth / Math.max(1, view.width)));
        state.sliderScale = scale;
        const pieceDisplay = Math.max(18, Math.round(view.piece * scale));
        el.piece.style.width = pieceDisplay + 'px';
        el.piece.style.height = pieceDisplay + 'px';
        el.piece.style.top = Math.round(view.targetY * scale) + 'px';
        movePieceByInput();
      }

      function pushTrace() {
        const now = performance.now();
        const x = Number(el.sliderInput.value || 0);
        const last = state.sliderTrace[state.sliderTrace.length - 1];
        if (last && Math.abs(Number(last.x || 0) - x) < 0.001 && now - state.sliderDragStart - Number(last.t || 0) < 120) {
          return;
        }
        state.sliderTrace.push({
          x,
          t: Math.round(now - state.sliderDragStart),
        });
        if (state.sliderInteraction) {
          state.sliderInteraction.eventCount = Number(state.sliderInteraction.eventCount || 0) + 1;
          if (state.sliderInteraction.eventCount === 1) {
            state.sliderInteraction.startX = x;
          }
          state.sliderInteraction.endX = x;
        }
      }

      async function submitSlider() {
        stopSliderMove();
        el.sliderSubmitBtn.disabled = true;
        try {
          const finalX = Number(el.sliderInput.value || 0);
          const interaction = buildSliderInteractionSummary(finalX);
          const proof = state.sliderProof || {};
          const payload = await callApi('/slider', {
            value: finalX,
            trace: state.sliderTrace.slice(-80),
            interaction,
            nonce: proof.nonce || '',
            signature: proof.signature || '',
          });
          state.payload = payload;
          renderByPayload(payload);
        } catch (error) {
          setStatus('第一步提交失败：' + String(error.message || error), 'err');
        } finally {
          el.sliderSubmitBtn.disabled = false;
        }
      }

      function buildSliderInteractionSummary(finalX) {
        const trace = Array.isArray(state.sliderTrace) ? state.sliderTrace : [];
        const first = trace[0] || { x: 0, t: 0 };
        const last = trace[trace.length - 1] || { x: finalX, t: 0 };
        const base = state.sliderInteraction || {};
        const durationMs = Math.max(
          0,
          Number(base.endedAt && base.startedAt ? base.endedAt - base.startedAt : last.t - first.t),
        );
        const eventCount = Number(base.eventCount || trace.length || 0);
        return {
          dragStarted: base.dragStarted === true,
          pointerType: String(base.pointerType || 'unknown').slice(0, 16),
          eventCount,
          durationMs: Math.round(durationMs),
          averageIntervalMs: eventCount > 1 ? Math.round(durationMs / (eventCount - 1)) : 0,
          startX: Number(base.startX ?? first.x ?? 0),
          endX: Number(base.endX ?? finalX),
          trackWidth: Number(base.trackWidth || el.sliderTrack.clientWidth || 0),
        };
      }

      function bindChoiceEvents() {
        el.choiceOptions.addEventListener('click', (event) => {
          const target = event.target;
          if (!(target instanceof HTMLButtonElement)) return;
          state.selectedChoice = String(target.dataset.answer || '');
          Array.from(el.choiceOptions.querySelectorAll('button')).forEach((btn) => {
            btn.classList.toggle('selected', btn === target);
          });
          el.choiceSubmitBtn.disabled = !state.selectedChoice;
          el.choiceHint.textContent = state.selectedChoice
            ? '已选择：' + state.selectedChoice
            : '请选择图片中对应的数字。';
        });

        el.choiceSubmitBtn.addEventListener('click', submitChoice);
      }

      async function submitChoice() {
        if (!state.selectedChoice) return;
        el.choiceSubmitBtn.disabled = true;
        try {
          const payload = await callApi('/choice', { answer: state.selectedChoice });
          state.payload = payload;
          renderByPayload(payload);
        } catch (error) {
          setStatus('答案提交失败：' + String(error.message || error), 'err');
        } finally {
          if (state.payload && state.payload.stage === 'choice') {
            el.choiceSubmitBtn.disabled = !state.selectedChoice;
          }
        }
      }

      function bindGridEvents() {
        el.gridCells.addEventListener('click', (event) => {
          const target = event.target;
          if (!(target instanceof HTMLButtonElement)) return;
          const index = Number(target.dataset.index);
          if (!Number.isInteger(index)) return;

          if (state.selected.has(index)) {
            state.selected.delete(index);
            target.classList.remove('selected');
          } else {
            if (state.selected.size >= 2) return;
            state.selected.add(index);
            target.classList.add('selected');
          }

          const count = state.selected.size;
          el.gridHint.textContent = '当前已选择 ' + count + '/2';
          el.gridSubmitBtn.disabled = count !== 2;
        });

        el.gridSubmitBtn.addEventListener('click', submitGrid);
      }

      async function submitGrid() {
        el.gridSubmitBtn.disabled = true;
        try {
          const selections = Array.from(state.selected.values());
          const payload = await callApi('/grid', { selections });
          state.payload = payload;
          renderByPayload(payload);
        } catch (error) {
          setStatus('第二步提交失败：' + String(error.message || error), 'err');
        } finally {
          if (state.payload && state.payload.stage === 'grid') {
            el.gridSubmitBtn.disabled = state.selected.size !== 2;
          }
        }
      }

      async function callApi(path, extra) {
        const resp = await fetch(API_PREFIX + path, {
          method: 'POST',
          cache: 'no-store',
          headers: { 'content-type': 'application/json;charset=UTF-8' },
          body: JSON.stringify({
            userId,
            token,
            ...(extra || {}),
          }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data.ok) {
          throw new Error(data.error || '请求失败_' + resp.status);
        }
        return data;
      }
    })();
  </script>
</body>
</html>`;
}

function renderAdminPage(url, env, webhookPath, publicBaseUrl) {
  const info = {
    host: url.host,
    webhookUrl: `${publicBaseUrl}${webhookPath}`,
    adminMode: isTopicModeEnabled(env) ? 'forum-topic' : 'reply-chain',
    userVerificationEnabled: isUserVerificationEnabled(env),
    rootAdmins: getRootAdminIds(env),
    panelUrl: String(env.ADMIN_PANEL_URL || '').trim(),
  };

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>管理面板入口</title>
  <style>
    :root{--bg:#0b1020;--card:#121b36dd;--text:#e6ecff;--muted:#9fb0d8;--line:#2b3d6d;--pri:#5b8cff;--pri-2:#7f6bff;--shadow:0 10px 30px rgba(0,0,0,.35)}
    *{box-sizing:border-box}
    body{margin:0;color:var(--text);background:radial-gradient(1200px 500px at -10% -20%, #2b5bff33 0%, transparent 60%),radial-gradient(900px 500px at 110% -10%, #7f6bff2e 0%, transparent 60%),linear-gradient(160deg,var(--bg),#0d1328 45%, #111936);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,'PingFang SC','Microsoft Yahei',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
    .card{width:min(760px,100%);border:1px solid var(--line);background:var(--card);backdrop-filter:blur(6px);border-radius:20px;padding:24px;box-shadow:var(--shadow)}
    .title{font-size:30px;font-weight:800;margin:0 0 12px}
    .desc{color:var(--muted);line-height:1.75;font-size:14px}
    .meta{margin-top:14px;display:flex;flex-wrap:wrap;gap:10px}
    .chip{font-size:12px;color:#d7e2ff;border:1px solid #3d518b;background:#162348;border-radius:999px;padding:6px 12px}
    .actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:18px}
    .btn{display:inline-flex;align-items:center;justify-content:center;min-width:180px;border:0;border-radius:12px;padding:12px 16px;color:white;text-decoration:none;cursor:pointer;background:linear-gradient(135deg,var(--pri),var(--pri-2));font-weight:700;letter-spacing:.2px}
    .btn.secondary{background:#273760}
    .hint{margin-top:16px;color:#c3cff3;font-size:12px;line-height:1.7}
    code{background:#162348;border:1px solid #31467c;border-radius:8px;padding:2px 6px}
  </style>
</head>
<body>
  <div class="card">
      <h1 class="title">管理面板入口</h1>
      <div class="desc">
        当前项目已切换为 <strong>Pages 面板接管</strong> 模式。<br>
        Worker 的 <code>/admin</code> 不再提供完整后台界面，只保留 API 与入口兜底能力。
      </div>
      <div class="meta">
        <span class="chip">域名：${escapeHtml(info.host)}</span>
        <span class="chip">Webhook：${escapeHtml(info.webhookUrl)}</span>
        <span class="chip">模式：${escapeHtml(info.adminMode)}</span>
        <span class="chip">首次验证：${info.userVerificationEnabled ? 'ON' : 'OFF'}</span>
        <span class="chip">根管理员：${escapeHtml((info.rootAdmins || []).join(', ') || '未配置')}</span>
      </div>

      <div class="actions">
        ${info.panelUrl ? `<a class="btn" href="${escapeHtml(info.panelUrl)}">打开 Pages 管理面板</a>` : ''}
        <a class="btn secondary" href="/">查看 Worker 状态</a>
      </div>

      <div class="hint">
        ${info.panelUrl
          ? `当前实例的 Pages 面板地址：<code>${escapeHtml(info.panelUrl)}</code><br>你也可以继续通过 Telegram 命令 <code>/panel</code> 打开这个地址。`
          : '当前尚未配置 <code>ADMIN_PANEL_URL</code>。请先部署 Pages 面板，并在系统配置或运行时变量中填入面板地址。'}
      </div>
  </div>
</body>
</html>`;
}
function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// Keep pure handlers directly testable without changing the deployed default export.
export {
  buildSessionCookie,
  extractMessageText,
  extractPrimaryMediaFileId,
  extractTargetUserId,
  isUserVerificationEnabled,
  matchKeywordFilter,
  normalizeBotCommandText,
  normalizeRotationAngle,
  normalizeSliderTrace,
  normalizeWebhookPath,
  parseCookies,
  parseIdList,
  parseLimit,
  parseOffset,
  parseReplyCommand,
  parseVerificationApiIdentity,
  collectKvKeys,
  putUserProfileIfChanged,
  writeD1ModerationIndex,
  deleteD1DirectoryEntries,
  runDirectoryIndexBackfill,
  listUsersPage,
  listBlacklist,
  listBlacklistPage,
  listTrust,
  listTrustPage,
  buildDeployBootstrapConsumptionKey,
  getRootAdminIds,
  isRootAdmin,
  getAdminMetaMode,
  shouldSendUserMetaMessage,
  isTopicModeEnabled,
  isDataCleanupAutoEnabled,
  isDeletedAccountSweepAutoEnabled,
  isUserPrivateCommand,
  detectMessageType,
  isIgnoredAdminServiceMessage,
  userKey,
  blacklistKey,
  adminKey,
  topicUserKey,
  topicThreadKey,
  trustKey,
  verifyKey,
  verificationCacheKey,
  buildGroupAdminMemberCacheKey,
  buildMessageHistoryDedupeKey,
  readTimedCacheValue,
  writeTimedCacheValue,
  pruneTimedCache,
  serializeJsonForStorage,
  areJsonStorageValuesEqual,
  getJsonChangedKeys,
  shouldThrottleUserProfileWrite,
  normalizeD1VerificationStatusRecord,
  isSameD1VerificationMeaning,
  parseIsoTimeMs,
  normalizeIsoTime,
  getRequestId,
  getTelegramUpdateContext,
  buildStructuredLogRecord,
  buildWebhookErrorStats,
  buildDeploymentHealthRecord,
  buildIncomingUserProfileBaseRecord,
  buildD1UserDirectoryRecord,
  buildD1ModerationIndexRecord,
  classifyTopLevelRoute,
  dispatchAdminRoutes,
  classifyVerificationApiRoute,
  dispatchVerificationApiRoute,
  resolveWelcomeTextForSetup,
};
