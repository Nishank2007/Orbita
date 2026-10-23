import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from mcp-server root directory
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

class Settings:
    """Application settings loaded from environment variables."""
    NODE_API_BASE_URL: str = os.getenv("NODE_API_BASE_URL", "http://localhost:5000").rstrip("/")
    MCP_HOST: str = os.getenv("MCP_HOST", "127.0.0.1")
    MCP_PORT: int = int(os.getenv("MCP_PORT", "8000"))
    MCP_PATH: str = os.getenv("MCP_PATH", "/mcp")
    MCP_SERVER_URL: str = os.getenv("MCP_SERVER_URL", "http://127.0.0.1:8000/mcp")

    def reload(self):
        """Reload variables from .env file."""
        if env_path.exists():
            load_dotenv(dotenv_path=env_path, override=True)

    @property
    def AGENT_MODE(self) -> str:
        return os.getenv("AGENT_MODE", "auto").lower()

    @AGENT_MODE.setter
    def AGENT_MODE(self, value: str):
        os.environ["AGENT_MODE"] = str(value)

    @property
    def GEMINI_API_KEY(self) -> str:
        key = os.getenv("GEMINI_API_KEY", "").strip()
        if not key and env_path.exists():
            # Try reloading in case the user edited .env during runtime
            load_dotenv(dotenv_path=env_path, override=True)
            key = os.getenv("GEMINI_API_KEY", "").strip()
        return key

    @GEMINI_API_KEY.setter
    def GEMINI_API_KEY(self, value: str):
        os.environ["GEMINI_API_KEY"] = str(value)

    @property
    def GEMINI_MODEL(self) -> str:
        return os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip() or "gemini-2.5-flash"

    @GEMINI_MODEL.setter
    def GEMINI_MODEL(self, value: str):
        os.environ["GEMINI_MODEL"] = str(value)

settings = Settings()
