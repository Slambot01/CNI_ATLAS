"""
cni/llm/llm_client.py

LLM client for querying code context using Ollama or other API models.
"""

from __future__ import annotations

from typing import Optional

import requests


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

OLLAMA_BASE_URL = "http://localhost:11434"
DEFAULT_MODEL = "mistral"


# ---------------------------------------------------------------------------
# LLM Interface
# ---------------------------------------------------------------------------

def ask_llm(
    context: str,
    question: str,
    model: str = DEFAULT_MODEL,
    base_url: str = OLLAMA_BASE_URL,
) -> Optional[str]:
    """
    Ask a question about code context using an LLM (Ollama by default).

    Args:
        context:  Code or documentation context to provide to the model.
        question: The question to ask about the context.
        model:    Name of the model (default: "mistral" for Ollama).
        base_url: Base URL of the LLM service (default: Ollama localhost).

    Returns:
        The model's response as a string, or None if the request fails.
    """
    if not context.strip():
        return "No context provided."

    if not question.strip():
        return "No question provided."

    prompt = f"""You are a code understanding assistant. Based on the provided code context, answer the following question as concisely and clearly as possible.

CONTEXT:
{context}

QUESTION:
{question}

ANSWER:"""

    try:
        # Ollama API endpoint
        response = requests.post(
            f"{base_url}/api/generate",
            json={
                "model": model,
                "prompt": prompt,
                "stream": False,
            },
            timeout=60,
        )
        response.raise_for_status()

        result = response.json()
        return result.get("response", "No response from model").strip()

    except requests.exceptions.ConnectionError:
        return f"Error: Could not connect to LLM at {base_url}. Make sure Ollama is running."
    except requests.exceptions.Timeout:
        return "Error: LLM request timed out."
    except requests.exceptions.RequestException as e:
        return f"Error communicating with LLM: {e}"
