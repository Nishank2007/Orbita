import pytest
import httpx
from unittest.mock import AsyncMock, patch

from src.node_client import NodeScheduleClient
from src.server import mcp_server, get_daily_schedule, find_available_slots, create_schedule_block

@pytest.fixture
def client():
    return NodeScheduleClient(base_url="http://testserver:5000")

class MockResponse:
    def __init__(self, status_code: int, json_data: dict, text: str = ""):
        self.status_code = status_code
        self._json_data = json_data
        self.text = text or str(json_data)

    def json(self):
        return self._json_data

# ====================================================================
# NodeScheduleClient Unit Tests (Mocking HTTP Transport)
# ====================================================================

@pytest.mark.asyncio
async def test_get_schedule_success(client):
    mock_payload = {
        "date": "2026-10-22",
        "count": 1,
        "blocks": [
            {
                "id": "blk_1",
                "title": "Team Standup",
                "startTime": "2026-10-22T09:00:00.000Z",
                "endTime": "2026-10-22T10:00:00.000Z",
                "category": "meeting",
                "priority": "medium"
            }
        ]
    }

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = MockResponse(200, mock_payload)

        result = await client.get_schedule("2026-10-22")

        assert result["status"] == "success"
        assert result["date"] == "2026-10-22"
        assert result["count"] == 1
        assert len(result["blocks"]) == 1
        assert result["blocks"][0]["title"] == "Team Standup"

@pytest.mark.asyncio
async def test_find_available_slots_success(client):
    mock_payload = {
        "date": "2026-10-22",
        "durationMinutes": 60,
        "slotsCount": 2,
        "availableSlots": [
            {"startTime": "2026-10-22T08:00:00.000Z", "endTime": "2026-10-22T10:00:00.000Z", "durationMinutes": 120},
            {"startTime": "2026-10-22T12:00:00.000Z", "endTime": "2026-10-22T16:00:00.000Z", "durationMinutes": 240}
        ]
    }

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = MockResponse(200, mock_payload)

        result = await client.find_available_slots("2026-10-22", duration=60)

        assert result["status"] == "success"
        assert result["slotsCount"] == 2
        assert len(result["availableSlots"]) == 2
        assert result["availableSlots"][0]["durationMinutes"] == 120

@pytest.mark.asyncio
async def test_create_schedule_block_success(client):
    mock_payload = {
        "status": "success",
        "block": {
            "id": "blk_new_123",
            "title": "Machine Learning Focus",
            "startTime": "2026-10-22T13:00:00.000Z",
            "endTime": "2026-10-22T14:30:00.000Z",
            "category": "focus",
            "priority": "high"
        }
    }

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = MockResponse(201, mock_payload)

        result = await client.create_schedule_block(
            title="Machine Learning Focus",
            start_time="2026-10-22T13:00:00.000Z",
            end_time="2026-10-22T14:30:00.000Z",
            category="focus",
            priority="high"
        )

        assert result["status"] == "success"
        assert result["block"]["id"] == "blk_new_123"
        assert result["block"]["title"] == "Machine Learning Focus"

@pytest.mark.asyncio
async def test_create_schedule_block_conflict_409(client):
    mock_payload = {
        "error": "SCHEDULE_CONFLICT",
        "message": "The requested block overlaps with an existing schedule block.",
        "conflictingBlock": {
            "id": "blk_existing",
            "title": "Existing Meeting",
            "startTime": "2026-10-22T13:00:00.000Z",
            "endTime": "2026-10-22T14:00:00.000Z"
        }
    }

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = MockResponse(409, mock_payload)

        result = await client.create_schedule_block(
            title="Overlapping Study",
            start_time="2026-10-22T13:30:00.000Z",
            end_time="2026-10-22T15:00:00.000Z"
        )

        assert result["status"] == "conflict"
        assert result["error"] == "SCHEDULE_CONFLICT"
        assert "overlaps" in result["message"]
        assert result["conflictingBlock"]["title"] == "Existing Meeting"

@pytest.mark.asyncio
async def test_create_schedule_block_invalid_interval_400(client):
    mock_payload = {
        "error": "INVALID_INTERVAL",
        "message": "endTime must be strictly after startTime."
    }

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = MockResponse(400, mock_payload)

        result = await client.create_schedule_block(
            title="Invalid Times",
            start_time="2026-10-22T15:00:00.000Z",
            end_time="2026-10-22T14:00:00.000Z"
        )

        assert result["status"] == "error"
        assert result["error"] == "INVALID_INTERVAL"

@pytest.mark.asyncio
async def test_backend_unavailable_handling(client):
    with patch("httpx.AsyncClient.get", side_effect=httpx.ConnectError("Connection refused")):
        result = await client.get_schedule("2026-10-22")

        assert result["status"] == "error"
        assert result["error"] == "NODE_BACKEND_UNAVAILABLE"
        assert "Could not reach Node.js schedule backend" in result["message"]

# ====================================================================
# MCP Server Registration & Tool Call Tests
# ====================================================================

@pytest.mark.asyncio
async def test_mcp_server_lists_all_three_tools():
    tools = await mcp_server.list_tools()
    tool_names = [t.name for t in tools]

    assert "get_daily_schedule" in tool_names
    assert "find_available_slots" in tool_names
    assert "create_schedule_block" in tool_names

    # Verify input_schema exists and requires mandatory fields
    create_tool = next(t for t in tools if t.name == "create_schedule_block")
    assert "title" in create_tool.input_schema["properties"]
    assert "start_time" in create_tool.input_schema["properties"]
    assert "end_time" in create_tool.input_schema["properties"]

@pytest.mark.asyncio
async def test_mcp_call_tool_dispatch():
    with patch("src.server.node_client.get_schedule", new_callable=AsyncMock) as mock_fn:
        mock_fn.return_value = {
            "status": "success",
            "date": "2026-10-22",
            "count": 0,
            "blocks": []
        }

        call_result = await mcp_server.call_tool("get_daily_schedule", {"date": "2026-10-22"})

        assert call_result.is_error is False
        mock_fn.assert_awaited_once_with(date="2026-10-22")
