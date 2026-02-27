export function trackClientEvent(
  event: string,
  payload: Record<string, unknown> = {},
  token?: string
) {
  const headers: Record<string, string> = {
    "content-type": "application/json"
  };

  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  fetch("/v1/telemetry/web", {
    method: "POST",
    headers,
    keepalive: true,
    body: JSON.stringify({
      event,
      meta: payload
    })
  }).catch(() => {});
}
