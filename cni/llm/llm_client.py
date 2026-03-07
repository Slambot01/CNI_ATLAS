"""
cni/llm/llm_client.py

LLM client for querying code context using Ollama or other API models.

Edge cases handled:
  - Ollama not running → ConnectionRefusedError / ConnectionError
  - Ollama timeout → requests.Timeout
  - Malformed response → KeyError / JSONDecodeError
"""

from __future__ import annotations

import json
from typing import Optional

import requests

from cni.utils.errors import abort


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

OLLAMA_BASE_URL = "http://localhost:11434"
DEFAULT_MODEL = "qwen2.5-coder:7b"  # Code-focused model

_TIMEOUT_SECONDS: int = 30


# ---------------------------------------------------------------------------
# Health Check
# ---------------------------------------------------------------------------

def check_ollama_health(base_url: str = OLLAMA_BASE_URL) -> tuple[bool, str]:
    """Check if Ollama is running and healthy.

    Returns:
        ``(is_healthy, status_message)``
    """
    try:
        response = requests.get(f"{base_url}/api/tags", timeout=5)
        if response.status_code == 200:
            return True, "Ollama is running"
        else:
            return False, f"Ollama returned status {response.status_code}"
    except (requests.exceptions.ConnectionError, ConnectionRefusedError):
        return False, f"Cannot connect to Ollama at {base_url}"
    except requests.exceptions.Timeout:
        return False, "Ollama connection timed out"
    except Exception as e:
        return False, f"Error checking Ollama: {e}"


# ---------------------------------------------------------------------------
# LLM Interface
# ---------------------------------------------------------------------------

def ask_llm(
    context: str,
    question: str,
    model: str = DEFAULT_MODEL,
    base_url: str = OLLAMA_BASE_URL,
) -> Optional[str]:
    """Ask a question about code context using an LLM (Ollama by default).

    Args:
        context:  Code or documentation context to provide to the model.
        question: The question to ask about the context.
        model:    Name of the model.
        base_url: Base URL of the LLM service.

    Returns:
        The model's response as a string, or None if the request fails.
    """
    if not context.strip():
        return "No context provided."

    if not question.strip():
        return "No question provided."

    # Check Ollama health first
    is_healthy, status_msg = check_ollama_health(base_url)
    if not is_healthy:
        return f"Error: {status_msg}. Start Ollama with: ollama serve"

    prompt = f"""You are a code understanding assistant. Based on the provided code context, answer the following question as concisely and clearly as possible.

CONTEXT:
{context}

QUESTION:
{question}

ANSWER:"""

    try:
        response = requests.post(
            f"{base_url}/api/generate",
            json={
                "model": model,
                "prompt": prompt,
                "stream": False,
            },
            timeout=_TIMEOUT_SECONDS,
        )

        if response.status_code == 404:
            return f"Error: Model '{model}' not found. Install with: ollama pull {model}"

        response.raise_for_status()

        result = response.json()
        return result.get("response", "No response from model").strip()

    except (requests.exceptions.ConnectionError, ConnectionRefusedError):
        abort(
            "Cannot reach Ollama at http://localhost:11434",
            "Start it with: ollama serve\n   Pull a model: ollama pull deepseek-coder",
        )
    except requests.exceptions.Timeout:
        abort(
            f"Ollama request timed out after {_TIMEOUT_SECONDS} seconds.",
            "Try a smaller model: ollama pull tinyllama",
        )
    except (KeyError, json.JSONDecodeError):
        abort(
            "Ollama returned an unexpected response.",
            "Check that your model is correctly installed.",
        )
    except requests.exceptions.RequestException as e:
        return f"Error communicating with LLM: {e}"

    return None  # unreachable but satisfies type checker
