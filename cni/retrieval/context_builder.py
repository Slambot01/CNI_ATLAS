"""
cni/retrieval/context_builder.py

Selects relevant files from the dependency graph to answer a natural
language query using keyword extraction and scored matching.
"""

from __future__ import annotations

import re
import string
from pathlib import Path
from typing import Optional

import networkx as nx


# ---------------------------------------------------------------------------
# Stopwords — filtered out before keyword matching
# ---------------------------------------------------------------------------

_STOPWORDS: frozenset[str] = frozenset({
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "dare", "ought",
    "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
    "as", "into", "through", "about", "between", "how", "what", "where",
    "which", "who", "when", "that", "this", "it", "its", "i", "my",
    "me", "we", "our", "you", "your", "and", "or", "but", "if", "then",
    "there", "here", "show", "tell", "give", "get", "find", "list",
    "explain", "describe", "does", "work", "works", "use", "used",
})


# ---------------------------------------------------------------------------
# Keyword extraction
# ---------------------------------------------------------------------------

def _split_camel_case(token: str) -> list[str]:
    """
    Split a camelCase or PascalCase token into lowercase parts.

    Examples:
        'AuthService'  → ['auth', 'service']
        'parseHTML'    → ['parse', 'html']
        'simple'       → ['simple']
    """
    parts = re.sub(r"([a-z])([A-Z])", r"\1 \2", token).split()
    return [p.lower() for p in parts]


def _tokenize(text: str) -> list[str]:
    """
    Normalize text into a flat list of lowercase tokens, splitting on
    whitespace, punctuation, underscores, hyphens, and camelCase boundaries.
    """
    # Replace common separators with spaces
    text = re.sub(r"[_\-./\\]", " ", text)
    # Remove punctuation (except spaces we just inserted)
    text = text.translate(str.maketrans("", "", string.punctuation.replace(" ", "")))
    # Split on whitespace, then expand camelCase
    raw_tokens = text.split()
    tokens: list[str] = []
    for tok in raw_tokens:
        tokens.extend(_split_camel_case(tok))
    return tokens


def extract_keywords(query: str) -> list[str]:
    """
    Extract meaningful keywords from a natural language query.

    Steps:
      1. Tokenize (handles camelCase, snake_case, punctuation)
      2. Lowercase
      3. Remove stopwords
      4. Deduplicate while preserving order

    Args:
        query: Raw user query string.

    Returns:
        Ordered list of unique, meaningful keyword strings.

    Examples:
        "Where is authentication implemented?"
            → ['authentication', 'implemented']
        "Which modules depend on paymentService?"
            → ['modules', 'depend', 'payment', 'service']
    """
    tokens = _tokenize(query)
    seen: set[str] = set()
    keywords: list[str] = []
    for tok in tokens:
        tok = tok.lower()
        if tok and tok not in _STOPWORDS and tok not in seen:
            seen.add(tok)
            keywords.append(tok)
    return keywords


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

def _score_node(node: str, keywords: list[str]) -> float:
    """
    Compute a relevance score for a graph node against a list of keywords.

    Scoring rules (additive):
      +2.0  exact filename stem match         (auth_service → 'auth_service')
      +1.5  keyword is a substring of stem    ('auth' in 'auth_service')
      +1.0  stem is a substring of keyword    ('auth' keyword, 'auth_helper' stem)
      +0.5  match against parent directory    ('services' dir, 'service' keyword)
      +0.3  partial directory component match

    Scores are summed across all keywords and normalized by keyword count
    so longer queries don't automatically win.

    Args:
        node:     Full file path string (graph node key).
        keywords: List of extracted keywords.

    Returns:
        Float relevance score (0.0 = no match).
    """
    if not keywords:
        return 0.0

    path = Path(node)
    stem = path.stem.lower()
    stem_tokens = set(_tokenize(stem))
    dir_tokens: set[str] = set()
    for part in path.parts[:-1]:
        dir_tokens.update(_tokenize(part.lower()))

    total = 0.0
    for kw in keywords:
        kw_tokens = set(_tokenize(kw))

        # Exact stem match
        if stem == kw:
            total += 2.0
        # Keyword is a substring of stem  ('auth' in 'auth_service')
        elif kw in stem:
            total += 1.5
        # Stem is a substring of keyword  ('auth' kw matches 'authentication')
        elif stem in kw:
            total += 1.0
        # Any stem token matches any keyword token
        elif stem_tokens & kw_tokens:
            total += 0.8

        # Directory-level signals
        if kw in dir_tokens:
            total += 0.5
        elif any(kw in dt or dt in kw for dt in dir_tokens):
            total += 0.3

    return total / len(keywords)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_relevant_files(
    graph: nx.DiGraph,
    query: str,
    top_n: int = 5,
) -> list[str]:
    """
    Return the most relevant files from the dependency graph for a query.

    Strategy:
      1. Extract keywords from the natural language query.
      2. Score every node in the graph against those keywords.
      3. Return the top_n nodes sorted by descending relevance score,
         filtering out any node with a score of zero.

    Args:
        graph: Directed dependency graph (nodes = file path strings).
        query: Natural language query from the user.
        top_n: Maximum number of files to return. Defaults to 5.

    Returns:
        List of file path strings ordered by relevance (most relevant first).
        May be shorter than top_n if fewer files match.

    Examples:
        get_relevant_files(graph, "Where is authentication implemented?")
        → ['/project/auth/auth_service.py', '/project/middleware/auth.py', ...]
    """
    if not query.strip():
        return []
    if graph.number_of_nodes() == 0:
        return []

    keywords = extract_keywords(query)
    if not keywords:
        return []

    scored: list[tuple[float, str]] = [
        (score, node)
        for node in graph.nodes
        if (score := _score_node(node, keywords)) > 0.0
    ]

    scored.sort(key=lambda x: x[0], reverse=True)

    return [node for _, node in scored[:top_n]]


# ---------------------------------------------------------------------------
# Context Building
# ---------------------------------------------------------------------------

def build_context(
    graph: nx.DiGraph,
    query: str,
    top_n: int = 5,
    max_lines: int = 50,
) -> str:
    """
    Build a context string from relevant files for a natural language query.

    Steps:
      1. Find relevant files using keyword matching
      2. Read and load file contents
      3. Combine into a formatted context string

    Args:
        graph: Directed dependency graph (nodes = file path strings).
        query: Natural language query/question from the user.
        top_n: Maximum number of files to include. Defaults to 5.
        max_lines: Maximum lines per file. Defaults to 50.

    Returns:
        Formatted context string ready to send to an LLM.
    """
    relevant_files = get_relevant_files(graph, query, top_n=top_n)

    if not relevant_files:
        return "No relevant files found in the codebase for this query."

    context_parts: list[str] = []

    for file_path in relevant_files:
        try:
            path_obj = Path(file_path)
            if path_obj.exists() and path_obj.is_file():
                content = path_obj.read_text(encoding="utf-8", errors="replace")
                lines = content.splitlines()
                truncated = "\n".join(lines[:max_lines])
                if len(lines) > max_lines:
                    truncated += f"\n... ({len(lines) - max_lines} more lines)"

                context_parts.append(f"FILE: {file_path}\n{truncated}")
        except Exception:
            # Skip files that can't be read
            pass

    return "\n\n".join(context_parts) if context_parts else "Could not read relevant files."
