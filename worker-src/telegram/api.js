async function readTelegramResponse(response) {
  try {
    return await response.json();
  } catch {
    throw new Error(`Telegram API returned an invalid response: ${response.status}`);
  }
}

function assertTelegramResponse(response, data) {
  if (!response.ok || !data?.ok) {
    throw new Error(data?.description || `Telegram API error: ${response.status}`);
  }
  return data.result;
}

export async function telegram(env, method, payload, fetchImpl = fetch) {
  const response = await fetchImpl(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(payload),
  });
  return assertTelegramResponse(response, await readTelegramResponse(response));
}

export async function telegramMultipart(env, method, formData, fetchImpl = fetch) {
  const response = await fetchImpl(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    body: formData,
  });
  return assertTelegramResponse(response, await readTelegramResponse(response));
}

export async function telegramWithThreadFallback(env, method, payload, send = telegram) {
  try {
    return await send(env, method, payload);
  } catch (error) {
    if (!payload?.message_thread_id) throw error;
    const fallbackPayload = { ...payload };
    delete fallbackPayload.message_thread_id;
    return send(env, method, fallbackPayload);
  }
}
