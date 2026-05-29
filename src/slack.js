function createUserError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function hasSlackConfig() {
  return Boolean(process.env.SLACK_BOT_TOKEN && process.env.SLACK_CHANNEL_ID);
}

async function postNewBuildToSlack({
  title,
  summary,
  bundleIdentifier,
  version,
  buildNumber,
  ipaUrl,
  installPageUrl,
  manifestUrl
}) {
  if (!hasSlackConfig()) {
    return;
  }

  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_CHANNEL_ID;
  const textLines = [
    `New iOS build uploaded: ${title}`,
    summary ? `Summary: ${summary}` : null,
    `Bundle: ${bundleIdentifier}`,
    `Version: ${version} (${buildNumber})`,
    `Install page: ${installPageUrl}`,
    `Manifest: ${manifestUrl}`,
    `IPA: ${ipaUrl}`
  ].filter(Boolean);
  const text = textLines.join('\n');

  let response;
  try {
    response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify({
        channel,
        text
      })
    });
  } catch (_e) {
    throw createUserError('Slack notification failed: network error.', 502);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (_e) {
    throw createUserError('Slack notification failed: invalid Slack response.', 502);
  }

  if (!response.ok || !payload.ok) {
    const reason = payload && payload.error ? payload.error : `HTTP ${response.status}`;
    throw createUserError(`Slack notification failed: ${reason}.`, 502);
  }
}

module.exports = {
  hasSlackConfig,
  postNewBuildToSlack
};
