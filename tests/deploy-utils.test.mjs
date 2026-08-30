import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildCfErrorReason,
  buildPagesManifest,
  buildPagesUploadBatches,
  buildPanelTargetUrl,
  buildWorkerUploadMetadata,
  getCustomDomainHost,
  getPagesMimeType,
  normalizeHttpUrl,
  normalizePagesProjectName,
  normalizeWebhookPath,
  parseCfApiResult,
  shouldIgnorePagesAsset,
  suggestImageBucketName,
  suggestPagesProjectName,
} from '../shared/deploy-utils.cjs';
import {
  buildDeploymentWorkerSecrets,
  buildWorkerSecretsResource,
  createDeploymentRun,
  deleteWorkerSecret,
  ensurePagesProject,
  normalizeDeployBootstrapResponse,
  normalizeDeploymentResumeState,
  normalizeWorkerSecretEntries,
  runDeploymentSteps,
  syncWorkerSecrets,
} from '../shared/deployment-core.cjs';

test('normalizes URLs, paths, and Pages project names', () => {
  assert.equal(normalizeHttpUrl('example.com/path/?ignored=1#hash'), 'https://example.com/path');
  assert.equal(normalizeHttpUrl('ftp://example.com'), '');
  assert.equal(normalizeWebhookPath('webhook///'), '/webhook');
  assert.equal(normalizeWebhookPath(''), '/webhook');
  assert.equal(normalizePagesProjectName(' My Worker / Panel '), 'my-worker-panel');
  assert.equal(suggestPagesProjectName('Support Bot'), 'support-bot-panel');
  assert.equal(suggestImageBucketName('Support Bot'), 'support-bot-images');
  assert.equal(suggestImageBucketName('a'.repeat(80)).length, 63);
});

test('builds panel URLs and rejects platform-hosted custom domains', () => {
  assert.equal(
    buildPanelTargetUrl('https://panel.example.com', 'worker.example.com'),
    'https://panel.example.com/?worker_origin=https%3A%2F%2Fworker.example.com',
  );
  assert.equal(getCustomDomainHost('https://panel.example.com'), 'panel.example.com');
  assert.equal(getCustomDomainHost('https://demo.workers.dev'), '');
});

test('parses Cloudflare success and error responses', () => {
  assert.deepEqual(parseCfApiResult(200, '{"result":{"id":"1"}}', { result: { id: '1' } }), {
    ok: true,
    status: 200,
    result: { id: '1' },
    resultInfo: null,
  });
  assert.equal(buildCfErrorReason({ errors: [{ code: 1001, message: 'bad token' }] }, 403), '1001:bad token');
  assert.equal(parseCfApiResult(500, 'upstream failed', null).reason, 'http_500:upstream failed');
});

test('builds Pages manifests and respects upload batch limits', () => {
  assert.deepEqual(buildPagesManifest([{ name: 'index.html', hash: 'abc' }]), { '/index.html': 'abc' });
  assert.deepEqual(
    buildPagesUploadBatches(
      [{ name: 'a', sizeInBytes: 4 }, { name: 'b', sizeInBytes: 4 }, { name: 'c', sizeInBytes: 1 }],
      { maxBatchBytes: 5, maxBatchFiles: 10 },
    ).map((batch) => batch.map((file) => file.name)),
    [['a'], ['b', 'c']],
  );
  assert.equal(getPagesMimeType('assets/app.js'), 'application/javascript; charset=utf-8');
  assert.equal(getPagesMimeType('assets/unknown.bin'), 'application/octet-stream');
  assert.equal(shouldIgnorePagesAsset('node_modules/pkg/index.js'), true);
  assert.equal(shouldIgnorePagesAsset('index.html'), false);
});

test('builds deterministic Worker upload metadata', () => {
  assert.deepEqual(buildWorkerUploadMetadata({
    vars: { Z: 'last', A: 'first' },
    sortVars: true,
    kvNamespaceId: 'kv-id',
    d1DatabaseId: 'db-id',
    r2BucketName: 'test-worker-images',
    compatibilityDate: '2026-01-01',
  }), {
    main_module: 'worker.js',
    compatibility_date: '2026-01-01',
    keep_bindings: ['secret_text'],
    bindings: [
      { type: 'plain_text', name: 'A', text: 'first' },
      { type: 'plain_text', name: 'Z', text: 'last' },
      { type: 'kv_namespace', name: 'BOT_KV', namespace_id: 'kv-id' },
      { type: 'd1', name: 'DB', database_id: 'db-id' },
      { type: 'r2_bucket', name: 'IMAGE_BUCKET', bucket_name: 'test-worker-images' },
    ],
  });
});

test('shared deployment core normalizes deployment bootstrap responses', () => {
  assert.deepEqual(
    normalizeDeployBootstrapResponse(200, { ok: true, webhookUrl: ' https://bot.example.com/webhook ' }),
    {
      ok: true,
      consumed: false,
      webhookUrl: 'https://bot.example.com/webhook',
      reason: '',
      data: { ok: true, webhookUrl: ' https://bot.example.com/webhook ' },
    },
  );
  assert.deepEqual(
    normalizeDeployBootstrapResponse(410, {
      ok: false,
      error: 'deploy_bootstrap_consumed',
      webhookUrl: 'https://bot.example.com/webhook',
    }),
    {
      ok: true,
      consumed: true,
      webhookUrl: 'https://bot.example.com/webhook',
      reason: 'already_consumed',
      data: {
        ok: false,
        error: 'deploy_bootstrap_consumed',
        webhookUrl: 'https://bot.example.com/webhook',
      },
    },
  );

  const partial = normalizeDeployBootstrapResponse(200, {
    ok: false,
    commandsError: 'commands_failed',
    bootstrapNotifyError: 'notify_failed',
  }, {
    successReasonFields: ['commandsError', 'bootstrapNotifyError'],
  });
  assert.equal(partial.ok, false);
  assert.equal(partial.reason, 'commands_failed');
  assert.equal(
    normalizeDeployBootstrapResponse(200, {
      ok: false,
      deploymentHealth: { status: 'degraded', lastError: 'bootstrap_incomplete' },
    }, {
      successReasonFields: ['webhookError', 'commandsError', 'bootstrapNotifyError'],
    }).reason,
    'bootstrap_incomplete',
  );
  assert.equal(
    normalizeDeployBootstrapResponse(200, { ok: false, passwordReady: false }).reason,
    'password_not_ready',
  );
  assert.equal(
    normalizeDeployBootstrapResponse(503, null, { httpReasonPrefix: 'bootstrap_http_' }).reason,
    'bootstrap_http_503',
  );
});

test('shared deployment core normalizes Worker secrets and resource paths', () => {
  assert.deepEqual(buildDeploymentWorkerSecrets({
    botToken: ' bot-token ',
    adminChatId: ' 123 ',
    webhookSecret: ' webhook-secret ',
    bootstrapToken: ' bootstrap-token ',
  }), {
    BOT_TOKEN: 'bot-token',
    ADMIN_CHAT_ID: '123',
    WEBHOOK_SECRET: 'webhook-secret',
    DEPLOY_BOOTSTRAP_TOKEN: 'bootstrap-token',
  });
  assert.throws(
    () => buildDeploymentWorkerSecrets({ botToken: 'bot-token' }),
    /ADMIN_CHAT_ID,WEBHOOK_SECRET,DEPLOY_BOOTSTRAP_TOKEN/,
  );
  assert.deepEqual(normalizeWorkerSecretEntries({
    ' BOT_TOKEN ': ' token ',
    EMPTY: ' ',
    '': 'ignored',
  }), [['BOT_TOKEN', 'token']]);
  assert.equal(
    buildWorkerSecretsResource('account-id', 'worker/name', 'SECRET/NAME'),
    '/accounts/account-id/workers/scripts/worker%2Fname/secrets/SECRET%2FNAME',
  );
});

test('shared deployment core updates and verifies Worker secrets', async () => {
  const calls = [];
  const progress = [];
  const result = await syncWorkerSecrets({
    accountId: 'account-id',
    workerName: 'worker-name',
    secrets: { BOT_TOKEN: ' bot-token ', ADMIN_CHAT_ID: ' 123 ' },
    verifyAfterWrite: true,
    onProgress: (message) => progress.push(message),
    apiRequest: async (resource, options) => {
      calls.push([resource, options]);
      if (options.method === 'GET') {
        return { ok: true, result: [{ name: 'BOT_TOKEN' }, { binding: 'ADMIN_CHAT_ID' }] };
      }
      return { ok: true };
    },
  });

  assert.deepEqual(result, { ok: true, names: ['BOT_TOKEN', 'ADMIN_CHAT_ID'] });
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0][1], {
    method: 'PUT',
    body: { name: 'BOT_TOKEN', text: 'bot-token', type: 'secret_text' },
  });
  assert.match(progress[0], /BOT_TOKEN, ADMIN_CHAT_ID/);
});

test('shared deployment core reports secret verification and deletion results', async () => {
  await assert.rejects(
    syncWorkerSecrets({
      accountId: 'account-id',
      workerName: 'worker-name',
      secrets: { BOT_TOKEN: 'token' },
      verifyAfterWrite: true,
      apiRequest: async (_resource, options) => options.method === 'GET'
        ? { ok: true, result: [] }
        : { ok: true },
    }),
    /missing BOT_TOKEN/,
  );

  const calls = [];
  const deleted = await deleteWorkerSecret({
    accountId: 'account-id',
    workerName: 'worker-name',
    name: 'DEPLOY_BOOTSTRAP_TOKEN',
    apiRequest: async (...args) => {
      calls.push(args);
      return { ok: true };
    },
  });
  assert.deepEqual(deleted, { ok: true });
  assert.deepEqual(calls[0], [
    '/accounts/account-id/workers/scripts/worker-name/secrets/DEPLOY_BOOTSTRAP_TOKEN',
    { method: 'DELETE' },
  ]);
});

test('shared deployment core reuses or creates and verifies Pages projects', async () => {
  const existingCalls = [];
  const existing = await ensurePagesProject({
    projectName: 'existing-panel',
    getProject: async (name) => {
      existingCalls.push(`get:${name}`);
      return { ok: true, project: { name } };
    },
    createProject: async () => {
      existingCalls.push('create');
      return { ok: true };
    },
  });
  assert.deepEqual(existing, { project: { name: 'existing-panel' }, created: false });
  assert.deepEqual(existingCalls, ['get:existing-panel']);

  const createCalls = [];
  const created = await ensurePagesProject({
    projectName: 'new-panel',
    getProject: async (name) => {
      createCalls.push(`get:${name}`);
      return createCalls.length === 1
        ? { ok: false, reason: '8000007:not found' }
        : { ok: true, project: { name } };
    },
    createProject: async (name) => {
      createCalls.push(`create:${name}`);
      return { ok: true, project: { name } };
    },
  });
  assert.deepEqual(created, { project: { name: 'new-panel' }, created: true });
  assert.deepEqual(createCalls, ['get:new-panel', 'create:new-panel', 'get:new-panel']);
});

test('shared deployment core reports Pages adapter failures', async () => {
  await assert.rejects(
    ensurePagesProject({
      projectName: 'broken-panel',
      getProject: async () => ({ ok: false, reason: 'permission_denied' }),
      createProject: async () => ({ ok: true }),
    }),
    /Pages project preflight failed: permission_denied/,
  );

  await assert.rejects(
    ensurePagesProject({
      projectName: 'broken-panel',
      getProject: async () => ({ ok: false, reason: '8000007:not found' }),
      createProject: async () => ({ ok: false, reason: 'quota_exceeded' }),
    }),
    /Pages project creation failed: quota_exceeded/,
  );
});

test('shared deployment core returns structured step results and failure context', async () => {
  const events = [];
  const completed = await runDeploymentSteps([
    { id: 'resources', run: async () => ({ kv: 'kv-id' }) },
    { id: 'worker', run: async ({ results }) => ({ kv: results.resources.kv, url: 'https://worker.example.com' }) },
  ], {
    onStep: ({ id, status }) => events.push(`${id}:${status}`),
  });
  assert.deepEqual(completed, {
    results: {
      resources: { kv: 'kv-id' },
      worker: { kv: 'kv-id', url: 'https://worker.example.com' },
    },
    completedSteps: ['resources', 'worker'],
  });
  assert.deepEqual(events, [
    'resources:started',
    'resources:completed',
    'worker:started',
    'worker:completed',
  ]);

  await assert.rejects(
    runDeploymentSteps([
      { id: 'resources', run: async () => 'ready' },
      { id: 'worker', run: async () => { throw new Error('upload_failed'); } },
    ]),
    (error) => {
      assert.equal(error.message, 'upload_failed');
      assert.equal(error.deploymentStep, 'worker');
      assert.deepEqual(error.completedSteps, ['resources']);
      assert.deepEqual(error.deploymentResults, { resources: 'ready' });
      assert.deepEqual(error.deploymentState, {
        results: { resources: 'ready' },
        completedSteps: ['resources'],
      });
      return true;
    },
  );

  const resumedEvents = [];
  const resumed = await runDeploymentSteps([
    { id: 'resources', run: async () => { throw new Error('must_not_run'); } },
    { id: 'worker', run: async ({ results }) => results.resources },
  ], {
    initialResults: { resources: 'cached' },
    completedSteps: ['resources'],
    onStep: ({ id, status }) => resumedEvents.push(`${id}:${status}`),
  });
  assert.deepEqual(resumed, {
    results: { resources: 'cached', worker: 'cached' },
    completedSteps: ['resources', 'worker'],
  });
  assert.deepEqual(resumedEvents, ['resources:resumed', 'worker:started', 'worker:completed']);
});

test('incremental deployment runs accumulate completed steps and results', async () => {
  const deployment = createDeploymentRun();
  await deployment.run('resources', async () => ({ kv: 'kv-id' }));
  await deployment.run('worker', async ({ results }) => ({ kv: results.resources.kv }));
  assert.deepEqual(deployment.snapshot(), {
    results: {
      resources: { kv: 'kv-id' },
      worker: { kv: 'kv-id' },
    },
    completedSteps: ['resources', 'worker'],
  });

  await assert.rejects(
    deployment.run('worker', async () => 'duplicate'),
    /deployment_step_id_duplicate:worker/,
  );

  await assert.rejects(
    deployment.run('panel', async () => { throw new Error('pages_failed'); }),
    (error) => {
      assert.equal(error.deploymentStep, 'panel');
      assert.deepEqual(error.completedSteps, ['resources', 'worker']);
      assert.deepEqual(error.deploymentResults, deployment.snapshot().results);
      assert.deepEqual(error.deploymentState, deployment.snapshot());
      return true;
    },
  );
});

test('deployment resume state is serializable and incremental runs skip completed steps', async () => {
  assert.deepEqual(normalizeDeploymentResumeState({
    deploymentResults: { resources: { kv: 'kv-id' } },
    completedSteps: ['resources', '', 'resources', null],
  }), {
    results: { resources: { kv: 'kv-id' } },
    completedSteps: ['resources'],
  });

  const resumed = createDeploymentRun({
    initialResults: { resources: { kv: 'kv-id' } },
    completedSteps: ['resources'],
  });
  assert.deepEqual(resumed.snapshot(), {
    results: { resources: { kv: 'kv-id' } },
    completedSteps: ['resources'],
  });
  let reranResources = false;
  const resources = await resumed.run('resources', async () => {
    reranResources = true;
    return { kv: 'unexpected' };
  });
  assert.equal(reranResources, false);
  assert.deepEqual(resources, { kv: 'kv-id' });
  await resumed.run('worker', async ({ results }) => ({ kv: results.resources.kv }));
  assert.deepEqual(resumed.snapshot().completedSteps, ['resources', 'worker']);
  await assert.rejects(
    resumed.run('resources', async () => ({ kv: 'duplicate' })),
    /deployment_step_id_duplicate:resources/,
  );
});
