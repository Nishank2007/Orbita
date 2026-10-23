import logging
import sys
from pathlib import Path
from typing import Literal

# Ensure project root is in sys.path when executed directly
_root = Path(__file__).resolve().parent.parent
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

import uvicorn
from mcp.server.mcpserver import MCPServer
from starlette.requests import Request
from starlette.responses import JSONResponse
from src.config import settings
from src.node_client import NodeScheduleClient
from src.agent import OrbitaAgent

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s in %(name)s: %(message)s"
)
logger = logging.getLogger("orbita.mcp")

# Instantiate official MCP Server
mcp_server = MCPServer(
    name="orbita-schedule-server",
    version="0.1.0",
    description="ORBITA Streamable HTTP MCP Server managing calendar schedule tools"
)

# Instantiate client pointing to validated Node.js API
node_client = NodeScheduleClient(base_url=settings.NODE_API_BASE_URL)

@mcp_server.tool(
    name="get_daily_schedule",
    description="Retrieve all scheduled blocks and commitments for a specific calendar date (YYYY-MM-DD)."
)
async def get_daily_schedule(date: str) -> dict:
    """Retrieve schedule blocks for a specific calendar date.

    Args:
        date: The target calendar date in YYYY-MM-DD format (e.g. '2026-10-22').
    """
    logger.info(f"Tool call: get_daily_schedule(date='{date}')")
    return await node_client.get_schedule(date=date)

@mcp_server.tool(
    name="find_available_slots",
    description="Find continuous free time windows matching a requested duration (in minutes) within daily working hours."
)
async def find_available_slots(
    date: str,
    duration: int,
    earliest: str = "08:00",
    latest: str = "20:00"
) -> dict:
    """Find available continuous time slots.

    Args:
        date: The target calendar date in YYYY-MM-DD format.
        duration: Minimum required slot duration in minutes (positive integer, e.g. 60 or 90).
        earliest: Earliest acceptable starting time (HH:mm, default '08:00').
        latest: Latest acceptable finishing time (HH:mm, default '20:00').
    """
    logger.info(f"Tool call: find_available_slots(date='{date}', duration={duration}, earliest='{earliest}', latest='{latest}')")
    return await node_client.find_available_slots(
        date=date,
        duration=duration,
        earliest=earliest,
        latest=latest
    )

@mcp_server.tool(
    name="create_schedule_block",
    description="Create a confirmed schedule block (e.g. focus session, meeting, study block) with conflict detection."
)
async def create_schedule_block(
    title: str,
    start_time: str,
    end_time: str,
    category: Literal["focus", "meeting", "break", "routine"] = "focus",
    priority: Literal["low", "medium", "high"] = "medium"
) -> dict:
    """Create a new schedule block.

    Args:
        title: Descriptive title for the schedule block (e.g. 'Machine Learning Study').
        start_time: ISO-8601 timestamp string for block start (e.g. '2026-10-22T13:00:00.000Z').
        end_time: ISO-8601 timestamp string for block end (must be strictly after start_time).
        category: Block category ('focus', 'meeting', 'break', 'routine').
        priority: Block priority level ('low', 'medium', 'high').
    """
    logger.info(f"Tool call: create_schedule_block(title='{title}', start_time='{start_time}', end_time='{end_time}', category='{category}', priority='{priority}')")
    return await node_client.create_schedule_block(
        title=title,
        start_time=start_time,
        end_time=end_time,
        category=category,
        priority=priority
    )

# Instantiate agent instance
agent = OrbitaAgent()

async def agent_plan_endpoint(request: Request) -> JSONResponse:
    """Internal HTTP endpoint for agent natural-language planning."""
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(
            {"error": "BAD_JSON", "message": "Malformed JSON in agent request body."},
            status_code=400
        )

    prompt = body.get("prompt")
    timezone_str = body.get("timezone", "UTC")
    target_date = body.get("target_date")
    history = body.get("history")

    try:
        agent.mode = agent._resolve_mode()
        result = await agent.plan(
            prompt=prompt,
            timezone_str=timezone_str,
            target_date=target_date,
            history=history
        )
        return JSONResponse(result, status_code=200)
    except Exception as exc:
        logger.error(f"Error handling agent plan request: {exc}", exc_info=True)
        return JSONResponse(
            {
                "error": "INTERNAL_AGENT_ERROR",
                "message": f"Agent processing failed: {str(exc)}",
                "status": "error"
            },
            status_code=500
        )

def create_app():
    """Create and return the Streamable HTTP Starlette application with agent plan endpoint."""
    app = mcp_server.streamable_http_app(streamable_http_path=settings.MCP_PATH)
    app.add_route("/agent/plan", agent_plan_endpoint, methods=["POST"])
    return app

if __name__ == "__main__":
    print(f"[ORBITA MCP] Starting Streamable HTTP MCP Server on http://{settings.MCP_HOST}:{settings.MCP_PORT}{settings.MCP_PATH}")
    print(f"[ORBITA Agent] Internal Agent Endpoint on http://{settings.MCP_HOST}:{settings.MCP_PORT}/agent/plan (Mode: {agent.mode})")
    app = create_app()
    uvicorn.run(app, host=settings.MCP_HOST, port=settings.MCP_PORT)
