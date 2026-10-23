import React, { useState } from 'react';

export default function AuditPanel({ auditLog = [], mode = 'mock', agentMessage = null, userQuestion = null }) {
  const [expandedIndices, setExpandedIndices] = useState({});
  const [copiedIndex, setCopiedIndex] = useState(null);

  const toggleExpand = (idx) => {
    setExpandedIndices(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  const handleCopyJson = (item, idx) => {
    navigator.clipboard?.writeText(JSON.stringify(item, null, 2));
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="audit-card glass-panel" id="tool-audit-panel">
      <div className="audit-header">
        <div className="audit-title-wrap">
          <span className="audit-icon">⚡</span>
          <div>
            <h3 className="section-title">Tool Execution Audit Panel</h3>
            <p className="section-subtitle">
              Live telemetry: Tool invocations via MCP Streamable HTTP
            </p>
          </div>
        </div>

        <div className="audit-meta-group">
          <span className={`mode-badge mode-${mode}`} id="agent-mode-badge">
            Mode: {mode.toUpperCase()}
          </span>
          <span className="step-count-badge">
            {auditLog.length} {auditLog.length === 1 ? 'Step' : 'Steps'}
          </span>
        </div>
      </div>

      {userQuestion && (
        <div className="user-question-bubble" id="user-question-message">
          <div className="speech-avatar">👤</div>
          <div className="speech-text">
            <span className="speech-sender user-sender">User Question:</span>
            <p>{userQuestion}</p>
          </div>
        </div>
      )}

      {agentMessage && (
        <div className="agent-speech-bubble" id="agent-response-message">
          <div className="speech-avatar">🤖</div>
          <div className="speech-text">
            <span className="speech-sender">ORBITA Agent:</span>
            <p>{agentMessage}</p>
          </div>
        </div>
      )}

      {auditLog.length === 0 ? (
        <div className="audit-empty-state" id="audit-empty-state">
          <div className="audit-empty-icon">🔍</div>
          <h4 className="empty-title">Awaiting Agent Execution</h4>
          <p className="empty-desc">
            Submit a scheduling prompt above to watch ORBITA coordinate tools in real time across the Model Context Protocol.
          </p>
        </div>
      ) : (
        <div className="audit-steps-list" id="audit-steps-list">
          {auditLog.map((step, idx) => {
            const isExpanded = !!expandedIndices[idx];
            const isSuccess = step.status === 'ok';
            const isConflict = step.status === 'conflict' || step.result?.status === 'conflict';
            const statusClass = isSuccess ? 'status-ok' : isConflict ? 'status-conflict' : 'status-err';

            return (
              <div key={idx} className={`audit-step-item ${statusClass}`} data-testid="audit-step">
                <div className="step-bar" onClick={() => toggleExpand(idx)} role="button" tabIndex={0}>
                  <div className="step-left">
                    <span className="step-number">Step {idx + 1}</span>
                    <code className="step-tool-name">{step.tool}</code>
                  </div>

                  <div className="step-right">
                    <span className={`step-status-tag ${statusClass}`}>
                      {isConflict ? 'CONFLICT' : step.status.toUpperCase()}
                    </span>
                    <button
                      type="button"
                      className="step-copy-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyJson(step, idx);
                      }}
                      title="Copy step JSON"
                    >
                      {copiedIndex === idx ? '✓ Copied' : 'Copy'}
                    </button>
                    <span className="step-caret">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="step-details-body">
                    <div className="json-block">
                      <span className="json-label">Arguments (MCP Tool Call):</span>
                      <pre className="json-pre">
                        <code>{JSON.stringify(step.arguments, null, 2)}</code>
                      </pre>
                    </div>

                    <div className="json-block">
                      <span className="json-label">Result (Returned via MCP):</span>
                      <pre className="json-pre">
                        <code>{JSON.stringify(step.result, null, 2)}</code>
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
