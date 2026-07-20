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
  createDeploymentRun,
  ensurePagesProject,
  normalizeDeploymentResumeState,
  runDeploymentSteps,
};
