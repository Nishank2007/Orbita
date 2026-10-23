import pytest
import anyio
import uvicorn
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone

from src.agent import OrbitaAgent
from src.mcp_client import MCPClientBridge, MCPConnectionError

# ===========================================================================
# Fixtures
# ===========================================================================

def make_agent(mode="mock", gemini_key=""):
    """Create an OrbitaAgent with isolated settings."""
    with patch("src.agent.settings") as mock_settings:
        mock_settings.AGENT_MODE = mode
        mock_settings.GEMINI_API_KEY = gemini_key
        mock_settings.MCP_SERVER_URL = "http://testserver:8000/mcp"
        agent = OrbitaAgent()
    return agent

TEST_DATE = "2026-10-30"  # Fixed future date for determinism

# ===========================================================================
# Intent Parser Unit Tests (no MCP required)
# ===========================================================================

def test_parser_extracts_title_duration_earliest_latest():
    agent = make_agent()
    parsed = agent._parse_intent("Schedule 90 minutes for Machine Learning study after 2 PM before 4 PM today")
    assert parsed["is_valid"] is True
    assert "Machine Learning" in parsed["title"]
    assert parsed["duration"] == 90
    assert parsed["earliest"] == "14:00"
    assert parsed["latest"] == "16:00"

def test_parser_extracts_high_priority():
    agent = make_agent()
    parsed = agent._parse_intent("Schedule 60 minutes for Physics study after 2 PM high priority")
    assert parsed["priority"] == "high"

def test_parser_extracts_hours_as_minutes():
    agent = make_agent()
    parsed = agent._parse_intent("Schedule 1.5 hours for React coding before 6 PM")
    assert parsed["duration"] == 90

def test_parser_detects_meeting_category():
    agent = make_agent()
    parsed = agent._parse_intent("Book 30 minutes for standup sync at 9 AM")
    assert parsed["category"] == "meeting"

def test_parser_rejects_single_word_ambiguous_prompt():
    agent = make_agent()
    parsed = agent._parse_intent("hello")
    assert parsed["is_valid"] is False

def test_parser_rejects_no_actionable_content():
    agent = make_agent()
    parsed = agent._parse_intent("schedule")
    assert parsed["is_valid"] is False

# ===========================================================================
# Mock Mode Agent Tests (MCP client is mocked)
# ===========================================================================

@pytest.mark.asyncio
async def test_mock_mode_valid_request_creates_block():
    agent = make_agent(mode="mock")

    # Inject a fake MCP client
    fake_client = AsyncMock(spec=MCPClientBridge)
    fake_client.call_tool = AsyncMock(side_effect=[
        # Step 1: find_available_slots
        {
            "status": "success",
            "date": TEST_DATE,
            "durationMinutes": 60,
            "slotsCount": 1,
            "availableSlots": [
                {
                    "startTime": f"{TEST_DATE}T14:00:00.000Z",
                    "endTime": f"{TEST_DATE}T20:00:00.000Z",
                    "durationMinutes": 360
                }
            ]
        },
        # Step 2: create_schedule_block
        {
            "status": "success",
            "block": {
                "id": "test-block-id-1",
                "title": "Physics study",
                "startTime": f"{TEST_DATE}T14:00:00.000Z",
                "endTime": f"{TEST_DATE}T15:00:00.000Z",
                "category": "focus",
                "priority": "high"
            }
        },
        # Step 3: get_daily_schedule
        {
            "status": "success",
            "date": TEST_DATE,
            "count": 1,
            "blocks": [{"id": "test-block-id-1", "title": "Physics study"}]
        }
    ])
    agent.mcp_client = fake_client

    result = await agent.plan(
        prompt="Schedule 60 minutes for Physics study after 2 PM high priority",
        timezone_str="UTC",
        target_date=TEST_DATE
    )

    assert result["status"] == "success"
    assert result["block"]["id"] == "test-block-id-1"
    assert result["mode"] == "mock"
    assert len(result["auditLog"]) >= 2
    # Verify find_available_slots and create_schedule_block were called
    called_tools = [c.args[0] for c in fake_client.call_tool.call_args_list]
    assert "find_available_slots" in called_tools
    assert "create_schedule_block" in called_tools

@pytest.mark.asyncio
async def test_mock_mode_deadline_constraint_respected():
    """Slots that would finish after the deadline must be rejected."""
    agent = make_agent(mode="mock")

    fake_client = AsyncMock(spec=MCPClientBridge)
    # Return a slot that starts at 15:30, plus 90 min = 17:00, but deadline is 16:00
    fake_client.call_tool = AsyncMock(return_value={
        "status": "success",
        "date": TEST_DATE,
        "durationMinutes": 90,
        "slotsCount": 1,
        "availableSlots": [
            {
                "startTime": f"{TEST_DATE}T15:30:00.000Z",
                "endTime": f"{TEST_DATE}T20:00:00.000Z",
                "durationMinutes": 270
            }
        ]
    })
    agent.mcp_client = fake_client

    result = await agent.plan(
        prompt="Schedule 90 minutes for ML study after 3:30 PM before 4 PM today",
        timezone_str="UTC",
        target_date=TEST_DATE
    )

    # 15:30 + 90 min = 17:00 which exceeds deadline 16:00 → no_slot
    assert result["status"] == "no_slot"
    assert result["block"] is None
    # No create_schedule_block call should have been made
    called_tools = [c.args[0] for c in fake_client.call_tool.call_args_list]
    assert "create_schedule_block" not in called_tools

@pytest.mark.asyncio
async def test_mock_mode_conflict_response_does_not_claim_success():
    agent = make_agent(mode="mock")

    fake_client = AsyncMock(spec=MCPClientBridge)
    fake_client.call_tool = AsyncMock(side_effect=[
        # Slot is available
        {
            "status": "success",
            "date": TEST_DATE,
            "slotsCount": 1,
            "availableSlots": [{"startTime": f"{TEST_DATE}T14:00:00.000Z", "endTime": f"{TEST_DATE}T18:00:00.000Z", "durationMinutes": 240}]
        },
        # Conflict from Node.js
        {
            "status": "conflict",
            "error": "SCHEDULE_CONFLICT",
            "message": "The requested block overlaps with an existing schedule block.",
            "conflictingBlock": {"id": "abc", "title": "Team Meeting", "startTime": f"{TEST_DATE}T14:00:00.000Z", "endTime": f"{TEST_DATE}T15:00:00.000Z"}
        }
    ])
    agent.mcp_client = fake_client

    result = await agent.plan(
        prompt="Schedule 60 minutes for Physics study after 2 PM",
        timezone_str="UTC",
        target_date=TEST_DATE
    )

    assert result["status"] == "conflict"
    assert result["block"] is None
    assert "overlap" in result["message"].lower() or "conflict" in result["message"].lower()

@pytest.mark.asyncio
async def test_mock_mode_no_available_slot_returns_helpful_message():
    agent = make_agent(mode="mock")

    fake_client = AsyncMock(spec=MCPClientBridge)
    fake_client.call_tool = AsyncMock(return_value={
        "status": "success",
        "date": TEST_DATE,
        "slotsCount": 0,
        "availableSlots": []
    })
    agent.mcp_client = fake_client

    result = await agent.plan(
        prompt="Schedule 60 minutes for Physics study after 2 PM",
        timezone_str="UTC",
        target_date=TEST_DATE
    )

    assert result["status"] == "no_slot"
    assert result["block"] is None
    assert "couldn't find" in result["message"].lower() or "no available" in result["message"].lower()

@pytest.mark.asyncio
async def test_mock_mode_mcp_unavailable_returns_error_not_crash():
    agent = make_agent(mode="mock")

    fake_client = AsyncMock(spec=MCPClientBridge)
    fake_client.call_tool = AsyncMock(side_effect=MCPConnectionError("Connection refused"))
    agent.mcp_client = fake_client

    result = await agent.plan(
        prompt="Schedule 60 minutes for Physics study after 2 PM",
        timezone_str="UTC",
        target_date=TEST_DATE
    )

    assert result["status"] == "error"
    assert result["block"] is None
    # _call_mcp_with_audit appends the error entry before re-raising, so log has exactly 1 error entry
    assert len(result["auditLog"]) == 1
    assert result["auditLog"][0]["status"] == "error"

@pytest.mark.asyncio
async def test_mock_mode_works_without_api_key():
    """Fundamental requirement: mock mode requires no LLM credentials."""
    with patch("src.agent.settings") as mock_settings:
        mock_settings.AGENT_MODE = "mock"
        mock_settings.GEMINI_API_KEY = ""
        mock_settings.MCP_SERVER_URL = "http://testserver:8000/mcp"
        agent = OrbitaAgent()

    assert agent.mode == "mock"

    fake_client = AsyncMock(spec=MCPClientBridge)
    fake_client.call_tool = AsyncMock(side_effect=[
        {"status": "success", "slotsCount": 1, "availableSlots": [
            {"startTime": f"{TEST_DATE}T10:00:00.000Z", "endTime": f"{TEST_DATE}T18:00:00.000Z", "durationMinutes": 480}
        ]},
        {"status": "success", "block": {"id": "x1", "title": "Focus Session"}},
        {"status": "success", "blocks": []}
    ])
    agent.mcp_client = fake_client

    result = await agent.plan(
        prompt="Schedule 60 minutes for Physics study after 10 AM",
        target_date=TEST_DATE
    )
    # Should succeed without any API key
    assert result["status"] == "success"

@pytest.mark.asyncio
async def test_live_mode_without_api_key_returns_explicit_error():
    """live mode without credentials must return an error, not pretend to run."""
    with patch("src.agent.settings") as mock_settings:
        mock_settings.AGENT_MODE = "live"
        mock_settings.GEMINI_API_KEY = ""
        mock_settings.MCP_SERVER_URL = "http://testserver:8000/mcp"
        agent = OrbitaAgent()

    assert agent.mode == "live"

    result = await agent.plan(
        prompt="Schedule 60 minutes for Physics study after 2 PM",
        target_date=TEST_DATE
    )

    assert result["status"] == "error"
    assert result["block"] is None
    assert "GEMINI_API_KEY" in result["message"] or "not configured" in result["message"].lower()

@pytest.mark.asyncio
async def test_invalid_prompt_does_not_create_block():
    agent = make_agent(mode="mock")
    fake_client = AsyncMock(spec=MCPClientBridge)
    agent.mcp_client = fake_client

    result = await agent.plan(
        prompt="hello",
        target_date=TEST_DATE
    )

    assert result["status"] in ("clarification", "no_slot", "error")
    assert result["block"] is None
    fake_client.call_tool.assert_not_awaited()

@pytest.mark.asyncio
async def test_short_prompt_returns_clarification():
    agent = make_agent(mode="mock")
    fake_client = AsyncMock(spec=MCPClientBridge)
    agent.mcp_client = fake_client

    result = await agent.plan(prompt="ok", target_date=TEST_DATE)

    assert result["status"] == "clarification"
    assert result["block"] is None
    fake_client.call_tool.assert_not_awaited()

@pytest.mark.asyncio
async def test_mock_mode_view_schedule():
    agent = make_agent(mode="mock")
    fake_client = AsyncMock(spec=MCPClientBridge)
    fake_client.call_tool = AsyncMock(return_value={
        "status": "success",
        "date": TEST_DATE,
        "count": 1,
        "blocks": [{"id": "b1", "title": "Maths", "startTime": f"{TEST_DATE}T09:00:00.000Z", "endTime": f"{TEST_DATE}T10:00:00.000Z"}]
    })
    agent.mcp_client = fake_client

    result = await agent.plan(prompt="show my schedule", target_date=TEST_DATE)
    assert result["status"] == "info"
    assert "Maths" in result["message"]
    assert len(result["schedule"]) == 1
    fake_client.call_tool.assert_awaited_once_with("get_daily_schedule", {"date": TEST_DATE})

@pytest.mark.asyncio
async def test_mock_mode_find_free_slots():
    agent = make_agent(mode="mock")
    fake_client = AsyncMock(spec=MCPClientBridge)
    fake_client.call_tool = AsyncMock(return_value={
        "status": "success",
        "date": TEST_DATE,
        "slotsCount": 1,
        "availableSlots": [{"startTime": f"{TEST_DATE}T10:00:00.000Z", "endTime": f"{TEST_DATE}T12:00:00.000Z", "durationMinutes": 120}]
    })
    agent.mcp_client = fake_client

    result = await agent.plan(prompt="find available slots", target_date=TEST_DATE)
    assert result["status"] == "info"
    assert "Available slots" in result["message"]
    fake_client.call_tool.assert_awaited_once()

@pytest.mark.asyncio
async def test_live_mode_async_chat():
    with patch("src.agent.settings") as mock_settings:
        mock_settings.AGENT_MODE = "live"
        mock_settings.GEMINI_API_KEY = "test_key_abc123"
        mock_settings.GEMINI_MODEL = "gemini-2.5-flash"
        mock_settings.MCP_SERVER_URL = "http://testserver:8000/mcp"
        agent = OrbitaAgent()

        fake_response = MagicMock()
        fake_response.function_calls = None
        fake_response.text = "Here is the answer to your problem."

        fake_chat = MagicMock()
        fake_chat.send_message = AsyncMock(return_value=fake_response)

        fake_client = MagicMock()
        fake_client.aio.chats.create = MagicMock(return_value=fake_chat)

        with patch("google.genai.Client", return_value=fake_client):
            result = await agent.plan(prompt="How should I organize my study tasks?", target_date=TEST_DATE)

        assert result["status"] == "info"
        assert result["message"] == "Here is the answer to your problem."
        assert result["mode"] == "live"

def test_hindi_hinglish_intent_parsing():
    agent = make_agent()
    # Hindi schedule inquiry
    parsed_view = agent._parse_intent("aaj ka schedule dikhao")
    assert parsed_view["is_valid"] is True
    assert parsed_view["intent_type"] == "view_schedule"

    # Hindi free slot inquiry
    parsed_slots = agent._parse_intent("khali slot kab hai")
    assert parsed_slots["is_valid"] is True
    assert parsed_slots["intent_type"] == "find_slots"

    # Hindi scheduling with "aadha ghanta" and "ke baad"
    parsed_sched = agent._parse_intent("aadha ghanta focus block schedule karo 2 baje ke baad")
    assert parsed_sched["is_valid"] is True
    assert parsed_sched["duration"] == 30
    assert parsed_sched["earliest"] == "14:00"

@pytest.mark.asyncio
async def test_mock_mode_general_qa():
    agent = make_agent(mode="mock")
    fake_client = AsyncMock(spec=MCPClientBridge)
    agent.mcp_client = fake_client

    result = await agent.plan(prompt="What is machine learning?", target_date=TEST_DATE)
    assert result["status"] == "info"
    assert "ORBITA" in result["message"]
    assert "unavailable" in result["message"].lower() or "mock" in result["message"].lower()
    # No scheduling tool should be called for general QA
    fake_client.call_tool.assert_not_awaited()

@pytest.mark.asyncio
async def test_regression_mock_mode_does_not_book_for_coding_or_advice():
    """Verify that coding and advice prompts do NOT schedule a 'Focus Session'."""
    agent = make_agent(mode="mock")
    fake_client = AsyncMock(spec=MCPClientBridge)
    agent.mcp_client = fake_client

    test_questions = [
        "Explain Java polymorphism with an example.",
        "What is the capital of Japan?",
        "Write a Java program to check whether a number is prime.",
        "Give me three practical ways to stop procrastinating.",
        "Explain the difference between an array and a linked list."
    ]

    for q in test_questions:
        result = await agent.plan(prompt=q, target_date=TEST_DATE)
        assert result["block"] is None
        assert result["status"] == "info"
        assert "unavailable" in result["message"].lower() or "mock" in result["message"].lower()
        # Verify no tools were called
        fake_client.call_tool.assert_not_awaited()

@pytest.mark.asyncio
async def test_regression_live_mode_general_qa_no_tool_invocation():
    """General questions in live mode receive direct LLM answers without calling scheduling tools."""
    with patch("src.agent.settings") as mock_settings:
        mock_settings.AGENT_MODE = "live"
        mock_settings.GEMINI_API_KEY = "test_key_valid123"
        mock_settings.GEMINI_MODEL = "gemini-2.5-flash"
        mock_settings.MCP_SERVER_URL = "http://testserver:8000/mcp"
        agent = OrbitaAgent()

        fake_response = MagicMock()
        fake_response.function_calls = None
        fake_response.text = "Polymorphism in Java is the ability of an object to take many forms."

        fake_chat = MagicMock()
        fake_chat.send_message = AsyncMock(return_value=fake_response)

        fake_client = MagicMock()
        fake_client.aio.chats.create = MagicMock(return_value=fake_chat)

        fake_mcp = AsyncMock(spec=MCPClientBridge)
        agent.mcp_client = fake_mcp

        with patch("google.genai.Client", return_value=fake_client):
            result = await agent.plan(
                prompt="Explain Java polymorphism with an example.",
                target_date=TEST_DATE
            )

        assert result["status"] == "info"
        assert "Polymorphism" in result["message"]
        assert result["block"] is None
        # No scheduling tools invoked
        fake_mcp.call_tool.assert_not_awaited()

@pytest.mark.asyncio
async def test_regression_live_mode_passes_history():
    """Verify that multi-turn conversation history is passed to chats.create."""
    with patch("src.agent.settings") as mock_settings:
        mock_settings.AGENT_MODE = "live"
        mock_settings.GEMINI_API_KEY = "test_key_valid123"
        mock_settings.GEMINI_MODEL = "gemini-2.5-flash"
        mock_settings.MCP_SERVER_URL = "http://testserver:8000/mcp"
        agent = OrbitaAgent()

        fake_response = MagicMock()
        fake_response.function_calls = None
        fake_response.text = "Tokyo is the capital."

        fake_chat = MagicMock()
        fake_chat.send_message = AsyncMock(return_value=fake_response)

        fake_client = MagicMock()
        fake_client.aio.chats.create = MagicMock(return_value=fake_chat)

        history = [
            {"role": "user", "content": "What country is Mount Fuji in?"},
            {"role": "model", "content": "Mount Fuji is in Japan."}
        ]

        with patch("google.genai.Client", return_value=fake_client):
            result = await agent.plan(
                prompt="What is its capital?",
                target_date=TEST_DATE,
                history=history
            )

        assert result["status"] == "info"
        assert result["message"] == "Tokyo is the capital."
        create_kwargs = fake_client.aio.chats.create.call_args.kwargs
        assert create_kwargs.get("history") is not None
        assert len(create_kwargs["history"]) == 2

