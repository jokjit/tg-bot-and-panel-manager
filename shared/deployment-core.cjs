function formatMessage(formatter, fallback, context) {
  if (typeof formatter === 'function') return formatter(context);
  if (typeof formatter === 'string') return formatter;
  return fallback(context);
}

function normalizeDeploymentResumeState(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const rawResults = source.results || source.deploymentResults || source.initialResults;
  const results = rawResults && typeof rawResults === 'object' && !Array.isArray(rawResults)
    ? { ...rawResults }
    : {};
  const completedSteps = [];
  const seen = new Set();
  const rawCompletedSteps = Array.isArray(source.completedSteps) ? source.completedSteps : [];
  for (const rawId of rawCompletedSteps) {
    const id = String(rawId || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    completedSteps.push(id);
  }
  return { results, completedSteps };
}

function normalizeDeployBootstrapResponse(status, data, options = {}) {
  const httpStatus = Number(status) || 0;
  const payload = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  const webhookUrl = String(payload.webhookUrl || '').trim();
  if (httpStatus === 410 && payload.error === 'deploy_bootstrap_consumed') {
    return {
      ok: true,
      consumed: true,
      webhookUrl,
      reason: 'already_consumed',
      data: payload,
    };
  }

  const successfulStatus = httpStatus >= 200 && httpStatus < 300;
  if (successfulStatus && payload.ok) {
    return { ok: true, consumed: false, webhookUrl, reason: '', data: payload };
  }

  const defaultReasonFields = ['error', 'webhookError', 'bootstrapNotifyError', 'commandsError'];
  const configuredReasonFields = successfulStatus
    ? options.successReasonFields
    : options.failureReasonFields;
  const reasonFields = Array.isArray(configuredReasonFields)
    ? configuredReasonFields
    : defaultReasonFields;
  const reason = reasonFields
    .map((field) => String(payload[field] || '').trim())
    .find(Boolean);
  const healthReason = String(payload.deploymentHealth?.lastError || '').trim();
  const readinessReason = payload.passwordReady === false ? 'password_not_ready' : '';
  const httpReasonPrefix = String(options.httpReasonPrefix || 'http_');
  return {
    ok: false,
    consumed: false,
    webhookUrl,
    reason: reason || healthReason || readinessReason || `${httpReasonPrefix}${httpStatus}`,
    data: payload,
  };
}

function normalizeWorkerSecretEntries(secrets = {}) {
  return Object.entries(secrets && typeof secrets === 'object' ? secrets : {})
    .map(([name, value]) => [String(name || '').trim(), String(value || '').trim()])
    .filter(([name, value]) => name && value);
}

function buildDeploymentWorkerSecrets(values = {}) {
  const secrets = {
    BOT_TOKEN: String(values.botToken || '').trim(),
    ADMIN_CHAT_ID: String(values.adminChatId || '').trim(),
    WEBHOOK_SECRET: String(values.webhookSecret || '').trim(),
    DEPLOY_BOOTSTRAP_TOKEN: String(values.bootstrapToken || '').trim(),
  };
  const missing = Object.entries(secrets)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`deployment_worker_secrets_required:${missing.join(',')}`);
  }
  return secrets;
}

function buildWorkerSecretsResource(accountId, workerName, secretName = '') {
  const account = String(accountId || '').trim();
  const worker = String(workerName || '').trim();
  if (!account) throw new Error('worker_secret_account_id_required');
  if (!worker) throw new Error('worker_secret_worker_name_required');
  const base = `/accounts/${account}/workers/scripts/${encodeURIComponent(worker)}/secrets`;
  const name = String(secretName || '').trim();
  return name ? `${base}/${encodeURIComponent(name)}` : base;
}

async function syncWorkerSecrets(options = {}) {
  const entries = normalizeWorkerSecretEntries(options.secrets);
  const apiRequest = options.apiRequest;
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const messages = options.messages || {};
  if (typeof apiRequest !== 'function') throw new Error('worker_secret_api_adapter_required');
  if (entries.length === 0) return { ok: true, names: [] };

  const resource = buildWorkerSecretsResource(options.accountId, options.workerName);
  for (const [name, value] of entries) {
    const updated = await apiRequest(resource, {
      method: 'PUT',
      body: { name, text: value, type: 'secret_text' },
    });
    if (!updated?.ok) {
      const reason = String(updated?.reason || 'unknown');
      throw new Error(formatMessage(
        messages.updateFailed,
        ({ secretName, failureReason }) => `Worker secret update failed (${secretName}): ${failureReason}`,
        { secretName: name, failureReason: reason, result: updated },
      ));
    }
  }

  const names = entries.map(([name]) => name);
  if (options.verifyAfterWrite) {
    const listed = await apiRequest(resource, { method: 'GET' });
    if (listed?.ok) {
      const visibleNames = (Array.isArray(listed.result) ? listed.result : [])
        .map((item) => String(item?.name || item?.binding || item?.id || '').trim())
        .filter(Boolean);
      const missing = names.filter((name) => !visibleNames.includes(name));
      if (missing.length > 0) {
        throw new Error(formatMessage(
          messages.verifyFailed,
          ({ missingNames }) => `Worker secret verification failed: missing ${missingNames.join(', ')}`,
          { missingNames: missing, result: listed },
        ));
      }
    } else {
      onProgress(formatMessage(
        messages.listWarning,
        ({ reason }) => `Worker secret list warning: ${reason}`,
        { reason: String(listed?.reason || 'unknown'), result: listed },
      ));
    }
  }

  onProgress(formatMessage(
    messages.updated,
    ({ secretNames }) => `Worker Secrets updated: ${secretNames.join(', ')}`,
    { secretNames: names },
  ));
  return { ok: true, names };
}

async function deleteWorkerSecret(options = {}) {
  if (typeof options.apiRequest !== 'function') throw new Error('worker_secret_api_adapter_required');
  const resource = buildWorkerSecretsResource(options.accountId, options.workerName, options.name);
  return options.apiRequest(resource, { method: 'DELETE' });
}

async function ensurePagesProject(options = {}) {
  const projectName = String(options.projectName || '').trim();
  const getProject = options.getProject;
  const createProject = options.createProject;
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const notFoundCode = String(options.notFoundCode || '8000007');
  const messages = options.messages || {};

  if (!projectName) throw new Error('pages_project_name_required');
  if (typeof getProject !== 'function') throw new Error('pages_get_project_adapter_required');
  if (typeof createProject !== 'function') throw new Error('pages_create_project_adapter_required');

  const current = await getProject(projectName);
  if (current?.ok && current.project) {
    onProgress(formatMessage(
      messages.existing,
      ({ projectName: name }) => `Pages project already exists: ${name}`,
      { projectName, result: current },
    ));
    return { project: current.project, created: false };
  }

  const currentReason = String(current?.reason || 'unknown');
  if (!currentReason.includes(notFoundCode)) {
    throw new Error(formatMessage(
      messages.preflightFailed,
      ({ reason }) => `Pages project preflight failed: ${reason}`,
      { projectName, reason: currentReason, result: current },
    ));
  }

  onProgress(formatMessage(
    messages.creating,
    ({ projectName: name }) => `Pages project is missing; creating: ${name}`,
    { projectName, result: current },
  ));
  const created = await createProject(projectName);
  if (!created?.ok) {
    const reason = String(created?.reason || 'unknown');
    throw new Error(formatMessage(
      messages.createFailed,
      ({ reason: failureReason }) => `Pages project creation failed: ${failureReason}`,
      { projectName, reason, result: created },
    ));
  }
  onProgress(formatMessage(
    messages.created,
    ({ projectName: name }) => `Pages project created: ${name}`,
    { projectName, result: created },
  ));

  const checked = await getProject(projectName);
  if (!checked?.ok || !checked.project) {
    const reason = String(checked?.reason || 'unknown');
    throw new Error(formatMessage(
      messages.verifyFailed,
      ({ reason: failureReason }) => `Pages project verification failed: ${failureReason}`,
      { projectName, reason, result: checked },
    ));
  }

  return { project: checked.project, created: true };
}

async function runDeploymentSteps(steps, options = {}) {
  const normalizedSteps = Array.isArray(steps) ? steps : [];
  const resumeState = normalizeDeploymentResumeState({
    results: options.initialResults,
    completedSteps: options.completedSteps,
  });
  const results = resumeState.results;
  const completedSteps = [];
  const onStep = typeof options.onStep === 'function' ? options.onStep : () => {};
  const resumedSteps = new Set(resumeState.completedSteps);
  const seen = new Set();

  for (let index = 0; index < normalizedSteps.length; index += 1) {
    const step = normalizedSteps[index] || {};
    const id = String(step.id || '').trim();
    if (!id) throw new Error('deployment_step_id_required');
    if (seen.has(id)) throw new Error(`deployment_step_id_duplicate:${id}`);
    if (typeof step.run !== 'function') throw new Error(`deployment_step_runner_required:${id}`);
    seen.add(id);

    if (resumedSteps.has(id)) {
      if (!Object.prototype.hasOwnProperty.call(results, id)) {
        throw new Error(`deployment_resume_result_missing:${id}`);
      }
      completedSteps.push(id);
      onStep({
        id,
        index,
        total: normalizedSteps.length,
        results,
        completedSteps: [...completedSteps],
        status: 'resumed',
        result: results[id],
      });
      continue;
    }

    const context = {
      id,
      index,
      total: normalizedSteps.length,
      results,
      completedSteps: [...completedSteps],
    };
    onStep({ ...context, status: 'started' });
    try {
      results[id] = await step.run(context);
      completedSteps.push(id);
      onStep({ ...context, status: 'completed', result: results[id], completedSteps: [...completedSteps] });
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      failure.deploymentStep = id;
      failure.completedSteps = [...completedSteps];
      failure.deploymentResults = { ...results };
      failure.deploymentState = normalizeDeploymentResumeState(failure);
      onStep({ ...context, status: 'failed', error: failure });
      throw failure;
    }
  }

  return { results, completedSteps };
}

function createDeploymentRun(options = {}) {
  const resumeState = normalizeDeploymentResumeState({
    results: options.initialResults,
    completedSteps: options.completedSteps,
  });
  let results = resumeState.results;
  const completedSteps = resumeState.completedSteps;
  const pendingResumedSteps = new Set(completedSteps);
  const onStep = typeof options.onStep === 'function' ? options.onStep : () => {};

  return {
    async run(id, runner) {
      const stepId = String(id || '').trim();
      if (!stepId) throw new Error('deployment_step_id_required');
      if (pendingResumedSteps.has(stepId)) {
        if (!Object.prototype.hasOwnProperty.call(results, stepId)) {
          throw new Error(`deployment_resume_result_missing:${stepId}`);
        }
        pendingResumedSteps.delete(stepId);
        onStep({
          id: stepId,
          index: completedSteps.indexOf(stepId),
          total: completedSteps.length,
          results,
          completedSteps: [...completedSteps],
          status: 'resumed',
          result: results[stepId],
        });
        return results[stepId];
      }
      if (completedSteps.includes(stepId)) throw new Error(`deployment_step_id_duplicate:${stepId}`);
      try {
        const pipeline = await runDeploymentSteps(
          [{ id: stepId, run: runner }],
          { initialResults: results, onStep },
        );
        results = pipeline.results;
        completedSteps.push(...pipeline.completedSteps);
        return results[stepId];
      } catch (error) {
        error.completedSteps = [...completedSteps, ...(error.completedSteps || [])];
        error.deploymentResults = { ...results, ...(error.deploymentResults || {}) };
        error.deploymentState = normalizeDeploymentResumeState(error);
        throw error;
      }
    },
    snapshot() {
      return {
        results: { ...results },
        completedSteps: [...completedSteps],
      };
    },
  };
}

module.exports = {
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
};
