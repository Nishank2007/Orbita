/**
 * ORBITA Client API Service
 * Gateway client connecting the React UI to the Node.js domain backend.
 */

const RAW_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000';
export const API_BASE_URL = RAW_BASE_URL.replace(/\/+$/, '');

const DEFAULT_TIMEOUT_MS = 15000;

/**
 * Fetch wrapper with timeout and standard error normalization.
 */
async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const contentType = response.headers.get('content-type') || '';
    let data;
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      data = { message: text };
    }

    if (!response.ok) {
      const error = new Error(data.message || `HTTP ${response.status}: Request failed`);
      error.status = response.status;
      error.code = data.error || `HTTP_${response.status}`;
      error.details = data;
      throw error;
    }

    return data;
  } catch (err) {
    clearTimeout(timeoutId);

    if (err.name === 'AbortError') {
      const timeoutErr = new Error(`Request timed out after ${timeoutMs}ms.`);
      timeoutErr.code = 'REQUEST_TIMEOUT';
      timeoutErr.status = 504;
      throw timeoutErr;
    }

    if (!err.status) {
      const netErr = new Error(`Unable to connect to Node.js backend at ${API_BASE_URL}. Ensure the server is running.`);
      netErr.code = 'NETWORK_ERROR';
      netErr.status = 503;
      throw netErr;
    }

    throw err;
  }
}

/**
 * Retrieve all schedule blocks for a given date (YYYY-MM-DD).
 */
export async function getDailySchedule(date) {
  return request(`/api/schedule?date=${encodeURIComponent(date)}`);
}

/**
 * Find available continuous free slots for a given date and duration.
 */
export async function findFreeSlots(date, duration, earliest = '08:00', latest = '20:00') {
  const query = new URLSearchParams({
    date,
    duration: String(duration),
    earliest,
    latest
  });
  return request(`/api/schedule/free-slots?${query.toString()}`);
}

/**
 * Submit natural-language scheduling request to the agent gateway.
 */
export async function submitAgentPlan(prompt, timezone = 'UTC', targetDate = null, history = []) {
  const body = {
    prompt,
    timezone,
    ...(targetDate ? { target_date: targetDate } : {}),
    ...(Array.isArray(history) && history.length > 0 ? { history } : {})
  };

  return request('/api/agent/plan', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

/**
 * Check backend and MongoDB connection status.
 */
export async function checkBackendHealth() {
  return request('/health');
}
