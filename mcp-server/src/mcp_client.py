import json
import logging
from typing import Any, Dict, List, Optional
from mcp.client.streamable_http import streamable_http_client
from mcp.client.session import ClientSession
from src.config import settings

logger = logging.getLogger("orbita.mcp_client")

class MCPConnectionError(Exception):
    """Raised when unable to establish a session with the MCP Server."""
    pass

class MCPClientBridge:
    """Official MCP Python SDK Client communicating via Streamable HTTP."""

    def __init__(self, server_url: Optional[str] = None):
        self.server_url = server_url or settings.MCP_SERVER_URL

    async def list_tools(self) -> List[Dict[str, Any]]:
        """List all available tools exposed by the MCP server."""
        try:
            async with streamable_http_client(self.server_url) as (read, write):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    res = await session.list_tools()
                    return [
                        {
                            "name": t.name,
                            "description": t.description,
                            "input_schema": t.input_schema
                        }
                        for t in res.tools
                    ]
        except Exception as exc:
            logger.error(f"Failed to list tools from MCP server at {self.server_url}: {exc}")
            raise MCPConnectionError(f"Cannot connect to MCP Server at {self.server_url}: {exc}") from exc

    async def call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Call a specific tool on the MCP server and parse the structured output."""
        try:
            async with streamable_http_client(self.server_url) as (read, write):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    call_res = await session.call_tool(tool_name, arguments=arguments)

                    if call_res.is_error:
                        raw_err = call_res.content[0].text if call_res.content else "Tool execution error"
                        try:
                            return json.loads(raw_err)
                        except Exception:
                            return {"status": "error", "error": "TOOL_ERROR", "message": raw_err}

                    if not call_res.content:
                        return {"status": "success"}

                    raw_text = call_res.content[0].text
                    try:
                        return json.loads(raw_text)
                    except Exception:
                        return {"status": "success", "raw": raw_text}

        except MCPConnectionError:
            raise
        except Exception as exc:
            logger.error(f"Failed to call MCP tool '{tool_name}' at {self.server_url}: {exc}")
            raise MCPConnectionError(f"Cannot reach MCP server during tool '{tool_name}': {exc}") from exc
