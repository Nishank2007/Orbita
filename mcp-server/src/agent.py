import json
import logging
import re
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

from src.config import settings
from src.mcp_client import MCPClientBridge, MCPConnectionError

logger = logging.getLogger("orbita.agent")

class OrbitaAgent:
    """ORBITA Productivity Agent coordinating tools via Model Context Protocol."""

    def __init__(self, mcp_client: Optional[MCPClientBridge] = None):
        self.mcp_client = mcp_client or MCPClientBridge()
        self.mode = self._resolve_mode()

    def _resolve_mode(self) -> str:
        """Determine whether to operate in 'live' LLM mode or 'mock' deterministic mode."""
        requested = settings.AGENT_MODE.lower()
        has_key = bool(settings.GEMINI_API_KEY and len(settings.GEMINI_API_KEY.strip()) > 5)

        if requested == "mock":
            return "mock"
        if requested == "live":
            if not has_key:
                logger.warning("AGENT_MODE='live' but GEMINI_API_KEY is not configured.")
            return "live"
        # 'auto' mode: default to live if key available, else mock
        return "live" if has_key else "mock"

    async def plan(
        self,
        prompt: str,
        timezone_str: str = "UTC",
        target_date: Optional[str] = None,
        history: Optional[List[Dict[str, str]]] = None
    ) -> Dict[str, Any]:
        """Process a natural language request (general AI or scheduling) and execute tool workflows."""
        if not prompt or not isinstance(prompt, str) or len(prompt.strip()) < 3:
            return {
                "message": "Prompt is too short or empty. Please ask a question or provide a scheduling request.",
                "mode": self.mode,
                "status": "clarification",
                "auditLog": [],
                "block": None,
                "schedule": None
            }

        # Resolve current target date in UTC if not explicitly provided
        if not target_date:
            target_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        # Live mode check
        current_mode = self.mode
        if current_mode == "live":
            if not settings.GEMINI_API_KEY:
                return {
                    "message": "Agent configured for 'live' mode, but GEMINI_API_KEY is not configured.",
                    "mode": "live",
                    "status": "error",
                    "auditLog": [],
                    "block": None,
                    "schedule": None
                }
            return await self._execute_live_mode(prompt, timezone_str, target_date, history)

        # Deterministic mock mode
        return await self._execute_mock_mode(prompt, timezone_str, target_date)

    # =========================================================================
    # Deterministic Mock Agent Engine
    # =========================================================================

    async def _execute_mock_mode(
        self,
        prompt: str,
        timezone_str: str,
        target_date: str
    ) -> Dict[str, Any]:
        """Deterministic parsing and tool orchestration without external LLM dependencies."""
        audit_log: List[Dict[str, Any]] = []

        parsed = self._parse_intent(prompt)
        if not parsed["is_valid"]:
            return {
                "message": parsed["clarification_message"],
                "mode": "mock",
                "status": "clarification",
                "auditLog": [],
                "block": None,
                "schedule": None
            }

        intent_type = parsed.get("intent_type", "schedule")
        if intent_type == "view_schedule":
            try:
                sched_resp = await self._call_mcp_with_audit(
                    tool_name="get_daily_schedule",
                    arguments={"date": target_date},
                    audit_log=audit_log
                )
                blocks = sched_resp.get("blocks", [])
                if not blocks:
                    msg = f"Your schedule for {target_date} is clear! No blocks scheduled."
                else:
                    titles = [f"{b.get('title', 'Event')} ({b.get('startTime', '')[11:16]} - {b.get('endTime', '')[11:16]})" for b in blocks]
                    msg = f"Schedule for {target_date} ({len(blocks)} blocks):\n" + "\n".join(f"• {t}" for t in titles)
                return {
                    "message": msg,
                    "mode": "mock",
                    "status": "info",
                    "auditLog": audit_log,
                    "block": None,
                    "schedule": blocks
                }
            except Exception as exc:
                return {
                    "message": f"Could not retrieve schedule: {exc}",
                    "mode": "mock",
                    "status": "error",
                    "auditLog": audit_log,
                    "block": None,
                    "schedule": None
                }

        if intent_type == "find_slots":
            try:
                slots_resp = await self._call_mcp_with_audit(
                    tool_name="find_available_slots",
                    arguments={
                        "date": target_date,
                        "duration": parsed["duration"],
                        "earliest": parsed["earliest"],
                        "latest": parsed["latest"]
                    },
                    audit_log=audit_log
                )
                avail = slots_resp.get("availableSlots", [])
                if not avail:
                    msg = f"No available {parsed['duration']}-minute slots found on {target_date} between {parsed['earliest']} and {parsed['latest']}."
                else:
                    slot_desc = [f"{s.get('startTime', '')[11:16]} to {s.get('endTime', '')[11:16]} ({s.get('durationMinutes')}m free)" for s in avail]
                    msg = f"Available slots on {target_date}:\n" + "\n".join(f"• {s}" for s in slot_desc)
                return {
                    "message": msg,
                    "mode": "mock",
                    "status": "info",
                    "auditLog": audit_log,
                    "block": None,
                    "schedule": None
                }
            except Exception as exc:
                return {
                    "message": f"Could not query slots: {exc}",
                    "mode": "mock",
                    "status": "error",
                    "auditLog": audit_log,
                    "block": None,
                    "schedule": None
                }

        if intent_type == "general_qa":
            return {
                "message": (
                    f"I am ORBITA, your voice-first AI assistant. Live AI is currently unavailable because GEMINI_API_KEY is not configured. "
                    "ORBITA is running in offline mock mode, which only supports calendar scheduling commands (such as viewing your schedule or booking slots). "
                    "Please configure your GEMINI_API_KEY in mcp-server/.env to enable live answers for general questions and coding help."
                ),
                "mode": "mock",
                "status": "info",
                "auditLog": [],
                "block": None,
                "schedule": None
            }

        title = parsed["title"]
        duration = parsed["duration"]
        earliest = parsed["earliest"]
        latest = parsed["latest"]
        category = parsed["category"]
        priority = parsed["priority"]

        # Validate time boundary constraints
        if earliest >= latest:
            return {
                "message": f"Invalid time window: 'after {earliest}' cannot be at or after deadline 'before {latest}'.",
                "mode": "mock",
                "status": "clarification",
                "auditLog": [],
                "block": None,
                "schedule": None
            }

        # 1. Discover and query free slots via MCP Server
        try:
            slots_resp = await self._call_mcp_with_audit(
                tool_name="find_available_slots",
                arguments={
                    "date": target_date,
                    "duration": duration,
                    "earliest": earliest,
                    "latest": latest
                },
                audit_log=audit_log
            )
        except MCPConnectionError as exc:
            return {
                "message": f"Failed to connect to MCP tool server: {exc}",
                "mode": "mock",
                "status": "error",
                "auditLog": audit_log,
                "block": None,
                "schedule": None
            }

        if slots_resp.get("status") == "error":
            return {
                "message": f"Error querying available slots: {slots_resp.get('message')}",
                "mode": "mock",
                "status": "error",
                "auditLog": audit_log,
                "block": None,
                "schedule": None
            }

        available_slots = slots_resp.get("availableSlots", [])
        if not available_slots or slots_resp.get("slotsCount", 0) == 0:
            return {
                "message": f"I couldn't find an available {duration}-minute slot on {target_date} between {earliest} and {latest}.",
                "mode": "mock",
                "status": "no_slot",
                "auditLog": audit_log,
                "block": None,
                "schedule": None
            }

        # 2. Select first slot satisfying deadline and calculate candidate interval
        selected_slot = None
        candidate_start_iso = None
        candidate_end_iso = None

        for slot in available_slots:
            try:
                s_start = datetime.fromisoformat(slot["startTime"].replace("Z", "+00:00"))
                s_end = datetime.fromisoformat(slot["endTime"].replace("Z", "+00:00"))
                block_end = s_start + timedelta(minutes=duration)

                # Check if block_end exceeds slot end
                if block_end > s_end:
                    continue

                # Check deadline constraint (e.g. latest "16:00")
                l_hour, l_min = map(int, latest.split(":"))
                deadline_dt = datetime(s_start.year, s_start.month, s_start.day, l_hour, l_min, tzinfo=timezone.utc)
                if block_end > deadline_dt:
                    continue

                selected_slot = slot
                candidate_start_iso = s_start.strftime("%Y-%m-%dT%H:%M:%S.000Z")
                candidate_end_iso = block_end.strftime("%Y-%m-%dT%H:%M:%S.000Z")
                break
            except Exception as e:
                logger.warning(f"Error parsing slot {slot}: {e}")
                continue

        if not selected_slot:
            return {
                "message": f"No available {duration}-minute slot on {target_date} satisfies your deadline of {latest}.",
                "mode": "mock",
                "status": "no_slot",
                "auditLog": audit_log,
                "block": None,
                "schedule": None
            }

        # 3. Create schedule block via MCP Server
        try:
            create_resp = await self._call_mcp_with_audit(
                tool_name="create_schedule_block",
                arguments={
                    "title": title,
                    "start_time": candidate_start_iso,
                    "end_time": candidate_end_iso,
                    "category": category,
                    "priority": priority
                },
                audit_log=audit_log
            )
        except MCPConnectionError as exc:
            return {
                "message": f"Failed to connect to MCP tool server: {exc}",
                "mode": "mock",
                "status": "error",
                "auditLog": audit_log,
                "block": None,
                "schedule": None
            }

        if create_resp.get("status") == "conflict":
            conflicting = create_resp.get("conflictingBlock", {})
            return {
                "message": f"Could not schedule '{title}' from {candidate_start_iso} to {candidate_end_iso} because it overlaps with '{conflicting.get('title', 'an existing block')}'.",
                "mode": "mock",
                "status": "conflict",
                "auditLog": audit_log,
                "block": None,
                "schedule": None
            }

        if create_resp.get("status") != "success":
            return {
                "message": f"Failed to create schedule block: {create_resp.get('message', 'Unknown error')}",
                "mode": "mock",
                "status": "error",
                "auditLog": audit_log,
                "block": None,
                "schedule": None
            }

        created_block = create_resp.get("block")

        # 4. Refresh full schedule via MCP Server
        schedule_blocks = []
        try:
            sched_resp = await self._call_mcp_with_audit(
                tool_name="get_daily_schedule",
                arguments={"date": target_date},
                audit_log=audit_log
            )
            schedule_blocks = sched_resp.get("blocks", [])
        except Exception as exc:
            logger.warning(f"Failed to fetch updated schedule: {exc}")

        # Human-readable time display
        start_fmt = candidate_start_iso[11:16] + " UTC"
        end_fmt = candidate_end_iso[11:16] + " UTC"

        return {
            "message": f"I have scheduled '{title}' on {target_date} from {start_fmt} to {end_fmt}.",
            "mode": "mock",
            "status": "success",
            "auditLog": audit_log,
            "block": created_block,
            "schedule": schedule_blocks
        }

    async def _call_mcp_with_audit(
        self,
        tool_name: str,
        arguments: Dict[str, Any],
        audit_log: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Wrapper executing an MCP tool and appending structured telemetry to the audit log."""
        try:
            result = await self.mcp_client.call_tool(tool_name, arguments)
            audit_log.append({
                "tool": tool_name,
                "arguments": arguments,
                "result": result,
                "status": "ok" if result.get("status") in ("success", "conflict") else "error"
            })
            return result
        except Exception as exc:
            audit_log.append({
                "tool": tool_name,
                "arguments": arguments,
                "result": {"error": str(exc)},
                "status": "error"
            })
            raise

    # =========================================================================
    # Natural Language Intent Parser
    # =========================================================================

    def _parse_intent(self, text: str) -> Dict[str, Any]:
        """Extract scheduling parameters from natural-language prompts."""
        lower = text.lower().strip()

        # Reject purely conversational / ambiguous phrases
        ambiguous_keywords = {"hello", "hi", "hey", "help", "who are you", "what can you do", "book something", "schedule"}
        if lower in ambiguous_keywords or len(lower.split()) <= 1:
            return {
                "is_valid": False,
                "clarification_message": "Please specify the task and duration (e.g. 'Schedule 60 minutes for Physics study after 2 PM today')."
            }

        # Check if intent is viewing current schedule
        if any(w in lower for w in [
            "what is on my schedule", "what is my schedule", "show my schedule", "view schedule",
            "today's schedule", "my agenda", "show schedule", "kya schedule hai", "mera schedule",
            "aaj ka schedule", "aaj kya plan hai"
        ]):
            return {
                "is_valid": True,
                "intent_type": "view_schedule",
                "title": "View Schedule",
                "duration": 0,
                "earliest": "08:00",
                "latest": "20:00",
                "priority": "medium",
                "category": "routine"
            }

        # Check if intent is finding available free slots
        if any(w in lower for w in [
            "free slots", "available slots", "when am i free", "free time", "available time",
            "khali slot", "kab free hu", "kab free hoon", "free time kab hai"
        ]):
            return {
                "is_valid": True,
                "intent_type": "find_slots",
                "title": "Find Available Slots",
                "duration": 60,
                "earliest": "08:00",
                "latest": "20:00",
                "priority": "medium",
                "category": "focus"
            }

        # Check for scheduling action triggers
        schedule_action_verbs = [
            "schedule", "book", "block", "reserve", "set up a meeting", "create a block",
            "schedule karo", "book karo", "slot banao", "block karo", "meeting fix karo"
        ]
        has_schedule_action = any(v in lower for v in schedule_action_verbs)

        is_informational_question = any(lower.startswith(q) for q in [
            "what is ", "what are ", "who is ", "who was ", "explain ", "how to ", "how does ", "why do ",
            "why does ", "tell me about ", "can you explain", "difference between", "give me ", "write a ",
            "write me ", "solve ", "kya hota hai", "kaise karein", "kaise hota"
        ])

        # Imperative scheduling requires a schedule action verb and is not purely a general question without explicit scheduling request
        is_scheduling_request = has_schedule_action and not (
            is_informational_question and not any(k in lower for k in ["my day", "for me", "session today", "slot today", "meeting today", "today", "tomorrow"])
        )

        if not is_scheduling_request:
            return {
                "is_valid": True,
                "intent_type": "general_qa",
                "title": "General Q&A",
                "duration": 0,
                "earliest": "08:00",
                "latest": "20:00",
                "priority": "medium",
                "category": "routine"
            }

        # 1. Duration extraction (minutes or hours, including Hindi/Hinglish terms)
        duration = 60
        if "aadha ghanta" in lower or "half an hour" in lower:
            duration = 30
        elif "ek ghanta" in lower or "one hour" in lower:
            duration = 60
        elif "do ghante" in lower or "two hours" in lower:
            duration = 120
        else:
            hour_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:hour|hr|ghante|ghanta)s?", lower)
            min_match = re.search(r"(\d+)[-\s]*(?:minute|min)s?", lower)

            if hour_match:
                duration = int(float(hour_match.group(1)) * 60)
            elif min_match:
                duration = int(min_match.group(1))

        # 2. Earliest start boundary ('after 2 PM', 'from 10 AM', '2 baje ke baad')
        earliest = "08:00"
        after_match = re.search(r"(?:after|from)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?", lower)
        hindi_after_match = re.search(r"(\d{1,2})(?::(\d{2}))?\s*(?:baje)?\s*(?:ke\s+baad|baad)", lower)

        match_earliest = after_match or hindi_after_match
        if match_earliest:
            hour = int(match_earliest.group(1))
            minute = int(match_earliest.group(2) or 0)
            meridiem = match_earliest.group(3) if after_match else None

            if meridiem == "pm" and hour < 12:
                hour += 12
            elif meridiem == "am" and hour == 12:
                hour = 0
            elif not meridiem and hour < 8:
                # Assume afternoon if small number like 'after 2'
                hour += 12

            earliest = f"{hour:02d}:{minute:02d}"

        # 3. Latest end boundary ('before 4 PM', 'by 15:30', '4 baje se pehle')
        latest = "20:00"
        before_match = re.search(r"(?:before|by|until)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?", lower)
        hindi_before_match = re.search(r"(\d{1,2})(?::(\d{2}))?\s*(?:baje)?\s*(?:se\s+pehle|pehle|tak)", lower)

        match_latest = before_match or hindi_before_match
        if match_latest:
            hour = int(match_latest.group(1))
            minute = int(match_latest.group(2) or 0)
            meridiem = match_latest.group(3) if before_match else None

            if meridiem == "pm" and hour < 12:
                hour += 12
            elif meridiem == "am" and hour == 12:
                hour = 0
            elif not meridiem and hour < 8:
                hour += 12

            latest = f"{hour:02d}:{minute:02d}"

        # 4. Priority
        priority = "medium"
        if "high priority" in lower or "urgent" in lower:
            priority = "high"
        elif "low priority" in lower:
            priority = "low"

        # 5. Category
        category = "focus"
        if any(w in lower for w in ["meeting", "sync", "standup", "call"]):
            category = "meeting"
        elif any(w in lower for w in ["break", "lunch", "coffee", "walk"]):
            category = "break"
        elif any(w in lower for w in ["routine", "gym", "workout", "dinner"]):
            category = "routine"

        # 6. Title extraction
        title = None

        # Pattern A: 'for <title> after/before/at/today'
        m_for = re.search(r"(?:for|to)\s+([a-zA-Z0-9\s]+?)(?=\s+(?:after|before|by|from|at|today|tomorrow|with|high|low)|$)", text, re.IGNORECASE)
        if m_for:
            title = m_for.group(1).strip()

        # Pattern B: 'schedule a/an <duration> <title> before/after/today'
        if not title:
            m_sched = re.search(r"(?:schedule|book|block)\s+(?:a\s+|an\s+)?(?:\d+[-\s]*(?:minute|min|hour|hr)s?\s+)?([a-zA-Z0-9\s]+?)(?=\s+(?:after|before|by|from|at|today|tomorrow|high|low)|$)", text, re.IGNORECASE)
            if m_sched:
                title = m_sched.group(1).strip()

        # Clean title
        if title:
            # Strip leftover noise words
            title = re.sub(r"^(?:a|an|the)\s+", "", title, flags=re.IGNORECASE)
            title = title.strip()

        if not title or len(title) < 2 or title.lower() in {"it", "something", "a session"}:
            title = "Focus Session"

        return {
            "is_valid": True,
            "intent_type": "schedule",
            "title": title,
            "duration": duration,
            "earliest": earliest,
            "latest": latest,
            "priority": priority,
            "category": category
        }

    # =========================================================================
    # Live LLM Agent Engine (Google GenAI)
    # =========================================================================

    async def _execute_live_mode(
        self,
        prompt: str,
        timezone_str: str,
        target_date: str,
        history: Optional[List[Dict[str, str]]] = None
    ) -> Dict[str, Any]:
        """Live tool-calling loop using Google GenAI SDK."""
        try:
            from google import genai
            from google.genai import types
        except ImportError:
            return {
                "message": "google-genai SDK not installed.",
                "mode": "live",
                "status": "error",
                "auditLog": [],
                "block": None,
                "schedule": None
            }

        client = genai.Client(api_key=settings.GEMINI_API_KEY)
        audit_log: List[Dict[str, Any]] = []

        system_instruction = (
            f"You are ORBITA, an intelligent voice-first AI assistant running locally on the user's laptop, similar to Alexa in interaction style. "
            f"Today's date is {target_date} UTC. The user's timezone is {timezone_str}. "
            "You are a versatile, general-purpose AI assistant and productivity companion. You have two primary roles:\n\n"
            "1. GENERAL-PURPOSE ASSISTANT: Answer ANY arbitrary questions the user asks across all domains:\n"
            "   - Educational concepts and learning\n"
            "   - Coding and computer science (e.g. Java polymorphism, prime number algorithms, arrays vs linked lists, debugging)\n"
            "   - Factual knowledge (geography, capitals, history, science)\n"
            "   - Productivity advice (stopping procrastination, focus methods, time blocking)\n"
            "   - General reasoning and everyday conversation\n"
            "   Provide direct, accurate, engaging, and genuinely relevant answers. "
            "   When giving code, explain the logic clearly and supply concise, working code snippets.\n\n"
            "2. CALENDAR & SCHEDULE MANAGEMENT: You have access to scheduling tools via the Model Context Protocol (MCP):\n"
            "   - get_daily_schedule: Retrieve scheduled blocks for a date (YYYY-MM-DD).\n"
            "   - find_available_slots: Find free time windows for a requested duration (in minutes).\n"
            "   - create_schedule_block: Create a confirmed schedule block (title, start_time, end_time, category, priority).\n"
            "   CRITICAL SCHEDULING CONSTRAINTS:\n"
            "   - ONLY call scheduling tools when the user explicitly asks to schedule, book, check, or view their calendar/schedule.\n"
            "   - NEVER call scheduling tools for general questions, coding problems, advice, or general conversation.\n"
            "   - When asked to schedule or book time, ALWAYS call find_available_slots first to locate a free window before calling create_schedule_block.\n"
            "   - Never claim a booking succeeded unless create_schedule_block returns status 'success'.\n"
            "   - If a conflict occurs or no slot is available, inform the user clearly.\n\n"
            "3. SPOKEN VOICE & CONVERSATION STYLE:\n"
            "   - Your responses are displayed in the dashboard and spoken aloud via speech synthesis.\n"
            "   - Keep spoken explanations natural, conversational, and direct, like Alexa.\n"
            "   - Language: Respond in the language used by the user. If the user asks in Hindi or Hinglish, respond naturally in Hindi/Hinglish. If in English, respond in English.\n"
            "   - Multi-turn awareness: Answer each question with a fresh, distinct, relevant answer. Never blindly repeat a previous response."
        )

        tools_def = [
            types.Tool(
                function_declarations=[
                    types.FunctionDeclaration(
                        name="find_available_slots",
                        description="Find free continuous time windows for a requested duration.",
                        parameters={
                            "type": "OBJECT",
                            "properties": {
                                "date": {"type": "STRING", "description": "Date YYYY-MM-DD"},
                                "duration": {"type": "INTEGER", "description": "Duration in minutes"},
                                "earliest": {"type": "STRING", "description": "Earliest start HH:mm (default '08:00')"},
                                "latest": {"type": "STRING", "description": "Latest end HH:mm (default '20:00')"}
                            },
                            "required": ["date", "duration"]
                        }
                    ),
                    types.FunctionDeclaration(
                        name="create_schedule_block",
                        description="Create a confirmed schedule block.",
                        parameters={
                            "type": "OBJECT",
                            "properties": {
                                "title": {"type": "STRING", "description": "Block title"},
                                "start_time": {"type": "STRING", "description": "ISO-8601 string"},
                                "end_time": {"type": "STRING", "description": "ISO-8601 string"},
                                "category": {"type": "STRING", "enum": ["focus", "meeting", "break", "routine"]},
                                "priority": {"type": "STRING", "enum": ["low", "medium", "high"]}
                            },
                            "required": ["title", "start_time", "end_time"]
                        }
                    ),
                    types.FunctionDeclaration(
                        name="get_daily_schedule",
                        description="Retrieve full schedule blocks for a specific calendar date.",
                        parameters={
                            "type": "OBJECT",
                            "properties": {
                                "date": {"type": "STRING", "description": "Date YYYY-MM-DD"}
                            },
                            "required": ["date"]
                        }
                    )
                ]
            )
        ]

        # Format history if provided
        formatted_history = []
        if history and isinstance(history, list):
            for h in history:
                if isinstance(h, dict):
                    role = "user" if h.get("role") in ("user", "human") else "model"
                    content = h.get("content") or h.get("text") or ""
                    if content and isinstance(content, str) and content.strip():
                        formatted_history.append(
                            types.Content(
                                role=role,
                                parts=[types.Part.from_text(text=content.strip())]
                            )
                        )

        try:
            model_name = getattr(settings, "GEMINI_MODEL", "gemini-2.5-flash")
            chat = client.aio.chats.create(
                model=model_name,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    tools=tools_def,
                    temperature=0.3
                ),
                history=formatted_history if formatted_history else None
            )

            response = await chat.send_message(prompt)
            max_turns = 5
            turn = 0
            created_block = None
            schedule_blocks = []

            while response.function_calls and turn < max_turns:
                turn += 1
                function_responses = []
                for call in response.function_calls:
                    call_name = call.name
                    call_args = dict(call.args) if call.args else {}

                    tool_res = await self._call_mcp_with_audit(
                        tool_name=call_name,
                        arguments=call_args,
                        audit_log=audit_log
                    )

                    if call_name == "create_schedule_block" and tool_res.get("status") == "success":
                        created_block = tool_res.get("block")
                    elif call_name == "get_daily_schedule" and tool_res.get("status") == "success":
                        schedule_blocks = tool_res.get("blocks", [])

                    function_responses.append(
                        types.Part.from_function_response(
                            name=call_name,
                            response={"result": tool_res}
                        )
                    )

                response = await chat.send_message(function_responses)

            # If a block was successfully created and schedule was not yet fetched, refresh it
            if created_block and not schedule_blocks:
                try:
                    sched_resp = await self._call_mcp_with_audit(
                        tool_name="get_daily_schedule",
                        arguments={"date": target_date},
                        audit_log=audit_log
                    )
                    if sched_resp.get("status") == "success":
                        schedule_blocks = sched_resp.get("blocks", [])
                except Exception as exc:
                    logger.warning(f"Could not refresh schedule after block creation: {exc}")

            # Ensure we have a non-empty textual response. Gemini may return a response object with no text when it only emitted tool calls or an empty payload.
            final_text = (getattr(response, "text", "") or "").strip()
            if not final_text:
                # Fallback to a generic helpful answer instead of propagating an empty payload.
                final_text = "I couldn't generate a direct answer. Please try rephrasing your question or ask something else."
                logger.warning("Gemini returned empty text; using fallback response.")
            status = "success" if created_block else ("conflict" if any(a.get("result", {}).get("status") == "conflict" for a in audit_log) else "info")

            return {
                "message": final_text,
                "mode": "live",
                "status": status,
                "auditLog": audit_log,
                "block": created_block,
                "schedule": schedule_blocks
            }
        except Exception as exc:
            logger.error(f"Live Gemini LLM error: {exc}", exc_info=True)
            return {
                "message": f"AI model error: {str(exc)}. Please verify your GEMINI_API_KEY and network connection.",
                "mode": "live",
                "status": "error",
                "auditLog": audit_log,
                "block": None,
                "schedule": None
            }
