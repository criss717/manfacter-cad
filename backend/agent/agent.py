"""ManfacterCAD Agent — ADK-powered CAD generation agent."""

import os
from pathlib import Path

from google.adk import Agent
from agent.tools import TOOLS
from agent.prompt import CAD_AGENT_PROMPT

env_file = Path(__file__).parent.parent.parent / ".env"
if env_file.exists():
    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and value and key not in os.environ:
                    os.environ[key] = value

if not os.environ.get("GOOGLE_API_KEY"):
    os.environ["GOOGLE_API_KEY"] = os.environ.get("GOOGLE_GENERATIVE_AI_API_KEY", "")

cad_agent = Agent(
    name="manfacter_cad",
    model="gemini-3.5-flash",
    instruction=CAD_AGENT_PROMPT,
    tools=TOOLS,
)
