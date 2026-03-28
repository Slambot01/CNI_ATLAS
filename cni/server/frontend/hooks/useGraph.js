'use client';

import { useState, useCallback } from 'react';
import { getGraph } from '../lib/api';

/**
 * Fetches graph data and transforms it into ReactFlow format.
 */
export function useGraph() {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [rawData, setRawData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchGraph = useCallback(async (path) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getGraph(path);
      setRawData(data);

      // Transform to ReactFlow nodes
      const rfNodes = data.nodes.map((n, i) => ({
        id: n.id,
        position: {
          x: Math.cos((2 * Math.PI * i) / data.nodes.length) * 400 + 500,
          y: Math.sin((2 * Math.PI * i) / data.nodes.length) * 400 + 400,
        },
        data: {
          label: n.label,
          indegree: n.indegree,
          outdegree: n.outdegree,
          fullPath: n.id,
        },
        style: {
          background: n.color,
          border: '1px solid #334155',
          borderRadius: '8px',
          padding: '8px 12px',
          fontSize: '11px',
          fontWeight: 500,
          color: '#0f172a',
          minWidth: '80px',
          textAlign: 'center',
        },
      }));

      // Transform to ReactFlow edges
      const rfEdges = data.edges.map((e, i) => ({
        id: `e-${i}`,
        source: e.source,
        target: e.target,
        label: e.label,
        animated: false,
        style: { stroke: '#475569', strokeWidth: 1.5 },
        labelStyle: { fontSize: '9px', fill: '#64748b' },
        markerEnd: { type: 'arrowclosed', color: '#475569' },
      }));

      setNodes(rfNodes);
      setEdges(rfEdges);
    } catch (err) {
      setError(err?.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  return { nodes, edges, rawData, loading, error, fetchGraph, setNodes, setEdges };
}
