'use client';

import { useState, useCallback } from 'react';
import { getGraph } from '../lib/api';

/**
 * Fetches graph data for react-force-graph.
 * Returns { nodes, links } format expected by ForceGraph2D.
 * Detects 400 "not analyzed" responses from the backend.
 */
export function useGraph() {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notAnalyzed, setNotAnalyzed] = useState(false);

  const fetchGraph = useCallback(async (path) => {
    setLoading(true);
    setError(null);
    setNotAnalyzed(false);
    try {
      const data = await getGraph(path);

      // Check for error response (400 returned as JSON body)
      if (data?.error) {
        if (data.notAnalyzed) {
          setNotAnalyzed(true);
        } else {
          setError({ message: data.message, hint: data.hint });
        }
        setLoading(false);
        return;
      }

      // Transform to react-force-graph format
      const nodes = data.nodes.map((n) => ({
        id: n.id,
        label: n.label,
        indegree: n.indegree,
        outdegree: n.outdegree,
        color: n.color,
        val: Math.max(2, 2 + n.indegree * 1.5),
      }));

      const links = data.edges.map((e) => ({
        source: e.source,
        target: e.target,
        label: e.label,
      }));

      setGraphData({ nodes, links });
    } catch (err) {
      setError({
        message: err?.message || 'Failed to load graph',
        hint: err?.hint || '',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  return { graphData, loading, error, notAnalyzed, fetchGraph };
}
