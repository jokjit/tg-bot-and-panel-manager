import {
  buildDeployBootstrapConsumptionKey,
  readDeployBootstrapToken,
  withDeployBootstrapLock,
} from '../auth/bootstrap.js';
import { timingSafeEqualText } from '../auth/crypto.js';
import { buildDeploymentHealthRecord } from '../observability/health.js';
import { writeStructuredLog } from '../observability/logging.js';

const DEPLOYMENT_HEALTH_KEY = 'sys:deployment_health';

function formatErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export async function handleDeployBootstrapRequest(context = {}, handlers = {}) {
  const {
    request,
    env,
    webhookPath,
    publicBaseUrl,
    requestId = null,
    startedAt,
  } = context;
  const nowMs = typeof handlers.nowMs === 'function' ? handlers.nowMs : Date.now;
  const requestStartedAt = Number.isFinite(Number(startedAt)) ? Number(startedAt) : nowMs();
  const log = typeof handlers.writeStructuredLog === 'function'
    ? handlers.writeStructuredLog
    : writeStructuredLog;
  const expectedToken = String(env?.DEPLOY_BOOTSTRAP_TOKEN || '').trim();
  if (!expectedToken) {
    throw handlers.createError(404, 'deploy_bootstrap_disabled');
  }

  const providedToken = await readDeployBootstrapToken(request);
  if (!timingSafeEqualText(providedToken, expectedToken)) {
    throw handlers.createError(403, 'forbidden');
  }

  handlers.ensureEnv(env, ['BOT_TOKEN', 'ADMIN_CHAT_ID', 'WEBHOOK_SECRET']);
  handlers.ensureKv(env);
  return withDeployBootstrapLock(expectedToken, async () => {
    const consumedKey = await buildDeployBootstrapConsumptionKey(expectedToken);
    if (await env.BOT_KV.get(consumedKey)) {
      throw handlers.createError(410, 'deploy_bootstrap_consumed');
    }

    const webhookUrl = `${publicBaseUrl}${webhookPath}`;
    const webhookPayload = { url: webhookUrl };
    if (env.WEBHOOK_SECRET) webhookPayload.secret_token = env.WEBHOOK_SECRET;

    let webhook = null;
    let webhookError = null;
    try {
      webhook = await handlers.telegram(env, 'setWebhook', webhookPayload);
    } catch (error) {
      webhookError = formatErrorMessage(error);
    }

    let commands = null;
    let commandsError = null;
    try {
      commands = await handlers.syncTelegramCommands(env);
    } catch (error) {
      commandsError = formatErrorMessage(error);
    }

    const passwordState = await handlers.ensureAdminPasswordState(env);
    const bootstrapNotifyError = passwordState.bootstrapNotifyError || null;
    const ok = Boolean(!webhookError && !commandsError && passwordState.passwordReady && !bootstrapNotifyError);
    const deploymentHealth = buildDeploymentHealthRecord({
      ok,
      webhookUrl,
      webhookError,
      commandsError,
      passwordReady: passwordState.passwordReady,
      bootstrapNotifyError,
    });
    try {
      await env.BOT_KV.put(DEPLOYMENT_HEALTH_KEY, JSON.stringify(deploymentHealth));
    } catch (error) {
      log('warn', 'deployment_health_persist_failed', {
        requestId,
        stage: 'deploy_bootstrap',
      }, {
        error: formatErrorMessage(error),
      });
    }
    if (ok) {
      await env.BOT_KV.put(consumedKey, JSON.stringify({ consumedAt: new Date().toISOString() }));
    }

    log(ok ? 'info' : 'warn', 'deployment_bootstrap_completed', {
      requestId,
      stage: 'deploy_bootstrap',
    }, {
      durationMs: Math.max(0, nowMs() - requestStartedAt),
      status: deploymentHealth.status,
      webhookReady: deploymentHealth.webhookReady,
      commandsReady: deploymentHealth.commandsReady,
      passwordReady: deploymentHealth.passwordReady,
      bootstrapNotifyReady: deploymentHealth.bootstrapNotifyReady,
    });

    return handlers.json(
      {
        ok,
        webhookUrl,
        webhook,
        webhookError,
        commands,
        commandsError,
        passwordReady: Boolean(passwordState.passwordReady),
        passwordMode: passwordState.passwordMode || 'none',
        bootstrapNotifyError,
        deploymentHealth,
      },
      200,
      {},
      request,
    );
  });
}
