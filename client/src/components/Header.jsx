import React from 'react';

export default function Header({ health, isOnline }) {
  const dbStatus = health?.database?.status || 'connecting';
  const isDbConnected = dbStatus === 'connected';

  return (
    <header className="orbita-header">
      <div className="header-brand">
        <div className="brand-logo-wrap">
          <div className="brand-orb" aria-hidden="true">
            <span className="brand-orb-inner"></span>
          </div>
          <div>
            <div className="brand-title-row">
              <h1 className="brand-title">ORBITA</h1>
              <span className="simulation-badge" id="alexa-simulation-badge">
                Voice-First AI Assistant
              </span>
            </div>
            <p className="brand-subtitle">
              Autonomous Calendar Agent via Model Context Protocol &amp; Node.js Domain Gateway
            </p>
          </div>
        </div>
      </div>

      <div className="header-status-group">
        <div className="status-pill" title={`MongoDB status: ${dbStatus}`}>
          <span className={`status-dot ${isDbConnected ? 'dot-active' : 'dot-warning'}`}></span>
          <span className="status-label">MongoDB:</span>
          <span className="status-val">{isDbConnected ? 'Connected' : dbStatus}</span>
        </div>

        <div className="status-pill" title="Python Streamable HTTP MCP & Agent Gateway">
          <span className={`status-dot ${isOnline ? 'dot-active' : 'dot-error'}`}></span>
          <span className="status-label">Backend:</span>
          <span className="status-val">{isOnline ? 'Online (5000)' : 'Unreachable'}</span>
        </div>

        <div className="status-pill mcp-pill" title="Model Context Protocol Transport">
          <span className="status-dot dot-cyan"></span>
          <span className="status-label">MCP:</span>
          <span className="status-val">Streamable HTTP</span>
        </div>
      </div>
    </header>
  );
}
