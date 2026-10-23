import logging
from typing import Any, Dict, Optional
import httpx
from src.config import settings

logger = logging.getLogger("orbita.node_client")

class NodeScheduleClient:
    """Async HTTP client calling the Node.js Schedule API."""

    def __init__(self, base_url: Optional[str] = None, timeout: float = 5.0):
        self.base_url = (base_url or settings.NODE_API_BASE_URL).rstrip("/")
        self.timeout = timeout

    async def get_schedule(self, date: str) -> Dict[str, Any]:
        """Query schedule blocks for a specific calendar date (YYYY-MM-DD)."""
        url = f"{self.base_url}/api/schedule"
        params = {"date": date}

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(url, params=params)

                if resp.status_code == 200:
                    data = resp.json()
                    return {
                        "status": "success",
                        "date": data.get("date"),
                        "count": data.get("count", 0),
                        "blocks": data.get("blocks", [])
                    }
                
                try:
                    err_json = resp.json()
                    return {
                        "status": "error",
                        "error": err_json.get("error", f"HTTP_{resp.status_code}"),
                        "message": err_json.get("message", resp.text)
                    }
                except Exception:
                    return {
                        "status": "error",
                        "error": f"HTTP_{resp.status_code}",
                        "message": resp.text
                    }

        except (httpx.ConnectError, httpx.TimeoutException) as exc:
            logger.warning(f"Failed to connect to Node.js backend: {exc}")
            return {
                "status": "error",
                "error": "NODE_BACKEND_UNAVAILABLE",
                "message": f"Could not reach Node.js schedule backend at {self.base_url}."
            }
        except Exception as exc:
            logger.error(f"Unexpected error in get_schedule: {exc}")
            return {
                "status": "error",
                "error": "INTERNAL_CLIENT_ERROR",
                "message": str(exc)
            }

    async def find_available_slots(
        self,
        date: str,
        duration: int,
        earliest: str = "08:00",
        latest: str = "20:00"
    ) -> Dict[str, Any]:
        """Find free time slots satisfying requested duration (minutes)."""
        url = f"{self.base_url}/api/schedule/free-slots"
        params = {
            "date": date,
            "duration": duration,
            "earliest": earliest,
            "latest": latest
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(url, params=params)

                if resp.status_code == 200:
                    data = resp.json()
                    return {
                        "status": "success",
                        "date": data.get("date"),
                        "durationMinutes": data.get("durationMinutes"),
                        "slotsCount": data.get("slotsCount", 0),
                        "availableSlots": data.get("availableSlots", [])
                    }

                try:
                    err_json = resp.json()
                    return {
                        "status": "error",
                        "error": err_json.get("error", f"HTTP_{resp.status_code}"),
                        "message": err_json.get("message", resp.text)
                    }
                except Exception:
                    return {
                        "status": "error",
                        "error": f"HTTP_{resp.status_code}",
                        "message": resp.text
                    }

        except (httpx.ConnectError, httpx.TimeoutException) as exc:
            logger.warning(f"Failed to connect to Node.js backend: {exc}")
            return {
                "status": "error",
                "error": "NODE_BACKEND_UNAVAILABLE",
                "message": f"Could not reach Node.js schedule backend at {self.base_url}."
            }
        except Exception as exc:
            logger.error(f"Unexpected error in find_available_slots: {exc}")
            return {
                "status": "error",
                "error": "INTERNAL_CLIENT_ERROR",
                "message": str(exc)
            }

    async def create_schedule_block(
        self,
        title: str,
        start_time: str,
        end_time: str,
        category: str = "focus",
        priority: str = "medium"
    ) -> Dict[str, Any]:
        """Create a scheduled block in the Node.js backend with conflict validation."""
        url = f"{self.base_url}/api/schedule/blocks"
        payload = {
            "title": title,
            "startTime": start_time,
            "endTime": end_time,
            "category": category,
            "priority": priority
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(url, json=payload)

                if resp.status_code == 201:
                    data = resp.json()
                    return {
                        "status": "success",
                        "block": data.get("block")
                    }

                if resp.status_code == 409:
                    data = resp.json()
                    return {
                        "status": "conflict",
                        "error": "SCHEDULE_CONFLICT",
                        "message": data.get("message", "Schedule block overlaps with an existing commitment."),
                        "conflictingBlock": data.get("conflictingBlock")
                    }

                try:
                    err_json = resp.json()
                    return {
                        "status": "error",
                        "error": err_json.get("error", f"HTTP_{resp.status_code}"),
                        "message": err_json.get("message", resp.text)
                    }
                except Exception:
                    return {
                        "status": "error",
                        "error": f"HTTP_{resp.status_code}",
                        "message": resp.text
                    }

        except (httpx.ConnectError, httpx.TimeoutException) as exc:
            logger.warning(f"Failed to connect to Node.js backend: {exc}")
            return {
                "status": "error",
                "error": "NODE_BACKEND_UNAVAILABLE",
                "message": f"Could not reach Node.js schedule backend at {self.base_url}."
            }
        except Exception as exc:
            logger.error(f"Unexpected error in create_schedule_block: {exc}")
            return {
                "status": "error",
                "error": "INTERNAL_CLIENT_ERROR",
                "message": str(exc)
            }
