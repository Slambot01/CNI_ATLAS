"""Generate a demo dependency-graph image for the README."""

from __future__ import annotations

from cni.analyzer.repo_scanner import scan_repository
from cni.graph.graph_builder import build_dependency_graph
from cni.graph.export import export_graph

files = scan_repository(".")
graph = build_dependency_graph(files)
export_graph(graph, "docs/example_graph", fmt="png")

print("Demo graph saved to docs/example_graph.png")
