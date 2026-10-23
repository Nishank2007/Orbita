const express = require('express');
const config = require('../config/env');

const router = express.Router();

/**
 * POST /api/agent/plan
 * Gateway endpoint for natural-language scheduling requests.
 * Validates input and forwards request to the Python Agent service.
 */
router.post('/plan', async (req, res, next) => {
  try {
    const { prompt, timezone = 'UTC', target_date, targetDate, history } = req.body;
    const resolvedTargetDate = target_date || targetDate;

    // 1. Validation
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'prompt is required and must be a non-empty string.'
      });
    }

    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt.length < 3 || trimmedPrompt.length > 500) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'prompt length must be between 3 and 500 characters.'
      });
    }

    // 2. Forwarding to Python Agent Service with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.agentTimeoutMs);

    try {
      const response = await fetch(config.agentServiceUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: trimmedPrompt,
          timezone: typeof timezone === 'string' ? timezone : 'UTC',
          ...(resolvedTargetDate ? { target_date: resolvedTargetDate } : {}),
          ...(Array.isArray(history) ? { history } : {})
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        return res.status(response.status).json({
          error: data.error || `AGENT_HTTP_${response.status}`,
          message: data.message || 'The agent service returned an error.'
        });
      }

      return res.status(200).json(data);
    } catch (fetchErr) {
      clearTimeout(timeoutId);

      if (fetchErr.name === 'AbortError') {
        return res.status(504).json({
          error: 'AGENT_TIMEOUT',
          message: `The agent request timed out after ${config.agentTimeoutMs}ms.`
        });
      }

      return res.status(503).json({
        error: 'AGENT_SERVICE_UNAVAILABLE',
        message: 'The ORBITA agent service is currently unreachable. Ensure the Python MCP service is running.'
      });
    }
  } catch (error) {
    next(error);
  }
});

module.exports = router;
