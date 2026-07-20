export async function buildVerificationSessionPayloadResponse(context = {}, handlers = {}) {
  const { state } = context;
  if (state?.verified) {
    return {
      status: 'verified',
      verifiedAt: state.verifiedAt || null,
    };
  }

  const blockedUntilMs = state?.blockedUntil ? new Date(state.blockedUntil).getTime() : 0;
  if (blockedUntilMs && blockedUntilMs > handlers.nowMs()) {
    return {
      status: 'blocked',
      blockedUntil: state.blockedUntil,
      retryAfterMs: Math.max(1000, blockedUntilMs - handlers.nowMs()),
    };
  }

  const flowMode = state?.flowMode === 'numeric-choice' ? 'numeric-choice' : 'graphic-two-step';
  const stage = flowMode === 'numeric-choice' ? 'choice' : state?.stage === 'grid' ? 'grid' : 'slider';
  const maxAttempts = handlers.getMaxAttempts();
  const payload = {
    status: 'in_progress',
    flowMode,
    stage,
    sessionExpiresAt: state?.sessionExpiresAt || null,
    stageMaxAttempts: maxAttempts,
  };

  if (stage === 'choice') {
    const choice = state?.choice || handlers.createChoiceChallenge();
    payload.choiceAttemptsLeft = Math.max(0, maxAttempts - Number(choice?.attempts || 0));
    payload.choice = {
      question: String(choice?.question || '请选择图片中的数字验证码'),
      image: handlers.buildChoiceImage(choice, context.publicBaseUrl),
      options: Array.isArray(choice?.options) ? choice.options.slice(0, 4).map((item) => String(item)) : [],
      attemptsUsed: Number(choice?.attempts || 0),
    };
    return payload;
  }

  payload.sliderAttemptsLeft = Math.max(0, maxAttempts - Number(state?.slider?.attempts || 0));
  payload.gridAttemptsLeft = Math.max(0, maxAttempts - Number(state?.grid?.attempts || 0));

  if (stage === 'slider') {
    const slider = state?.slider || handlers.createSliderChallenge();
    const proof = await handlers.buildSliderProof(state, slider);
    payload.slider = slider?.type === 'rotation'
      ? {
          type: 'rotation',
          size: Number(slider.size || 240),
          maxAngle: Number(slider.maxAngle || 360),
          image: handlers.buildRotationImage(slider),
          nonce: proof.nonce,
          signature: proof.signature,
          attemptsUsed: Number(slider.attempts || 0),
        }
      : {
          type: 'puzzle',
          width: Number(slider.width || 320),
          height: Number(slider.height || 180),
          piece: Number(slider.piece || 46),
          targetY: Number(slider.targetY || 52),
          maxX: Number(slider.maxX || 250),
          background: handlers.buildPuzzleImage(slider),
          nonce: proof.nonce,
          signature: proof.signature,
          attemptsUsed: Number(slider.attempts || 0),
        };
    return payload;
  }

  const grid = state?.grid || handlers.createGridChallenge();
  payload.grid = {
    promptSymbols: Array.isArray(grid.targetSymbols) ? grid.targetSymbols.slice(0, 2) : [],
    requiredCount: 2,
    attemptsUsed: Number(grid.attempts || 0),
    cells: Array.isArray(grid.cells)
      ? grid.cells.slice(0, 9).map((item, index) => ({
          index,
          symbol: String(item?.symbol || ''),
          token: String(item?.token || ''),
        }))
      : [],
  };
  return payload;
}
