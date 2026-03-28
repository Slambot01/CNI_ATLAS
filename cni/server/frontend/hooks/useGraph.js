'use client';

import { useState, useCallback } from 'react';
import { getGraph } from '../lib/api';

/**
 * Fetches graph data for react-force-graph.
 * Returns { nodes, links } format expected by ForceGraph2D.
 */
export function useGraph() {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchGraph = useCallback(async (path) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getGraph(path);

      // Transform to react-force-graph format
      const nodes = data.nodes.map((n) => ({
        id: n.id,
        label: n.label,
        indegree: n.indegree,
        outdegree: n.outdegree,
        color: n.color,
        // Size scaled by in-degree: base 4, grows with imports
        val: Math.max(2, 2 + n.indegree * 1.5),
      }));

      const links = data.edges.map((e) => ({
        source: e.source,
        target: e.target,
        label: e.label,
      }));

      setGraphData({ nodes, links });
    } catch (err) {
      setError(err?.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  return { graphData, loading, error, fetchGraph };
}
