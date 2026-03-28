'use client';

import { useCallback, useState, useEffect } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useGraph } from '../../hooks/useGraph';
import { useAnalysisContext } from '../client-layout';
import { explainFile } from '../../lib/api';

export default function GraphPage() {
  const { repoPath, stats } = useAnalysisContext();
  const { nodes: initialNodes, edges: initialEdges, loading, error, fetchGraph } = useGraph();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [nodeDetails, setNodeDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    if (repoPath && stats) {
      fetchGraph(repoPath);
    }
  }, [repoPath, stats, fetchGraph]);

  useEffect(() => {
    if (initialNodes.length) setNodes(initialNodes);
    if (initialEdges.length) setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const onNodeClick = useCallback(async (_event, node) => {
    setSelectedNode(node);
    setDetailsLoading(true);
    try {
      const details = await explainFile(node.data.label, repoPath);
      setNodeDetails(details);
    } catch {
      setNodeDetails(null);
    } finally {
      setDetailsLoading(false);
    }
  }, [repoPath]);

  if (!repoPath || !stats) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <p className="text-cni-muted text-sm">Analyze a repository first to view the dependency graph.</p>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-6rem)] flex">
      {/* Graph area */}
      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-cni-bg/80 z-10">
            <div className="text-center space-y-3">
              <div className="w-8 h-8 mx-auto border-2 border-cni-border border-t-cni-accent rounded-full animate-spin" />
              <p className="text-sm text-cni-muted">Building graph…</p>
            </div>
          </div>
        )}
        {error && (
          <div className="absolute top-4 left-4 right-4 z-10 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          fitView
          minZoom={0.1}
          maxZoom={3}
          className="bg-cni-bg"
        >
          <Controls />
          <MiniMap
            nodeColor={(n) => n.style?.background || '#64748b'}
            maskColor="rgba(10, 10, 15, 0.8)"
            style={{ backgroundColor: '#12121a' }}
          />
          <Background variant="dots" gap={20} size={1} color="#1e1e2e" />
        </ReactFlow>
      </div>

      {/* Details panel */}
      {selectedNode && (
        <div className="w-80 bg-cni-surface border-l border-cni-border p-5 overflow-y-auto animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-cni-text">Node Details</h3>
            <button
              onClick={() => { setSelectedNode(null); setNodeDetails(null); }}
              className="text-cni-muted hover:text-cni-text text-lg"
            >
              ×
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-xs text-cni-muted mb-1">Filename</p>
              <p className="text-sm font-mono text-cni-text">{selectedNode.data.label}</p>
            </div>
            <div>
              <p className="text-xs text-cni-muted mb-1">Full Path</p>
              <p className="text-xs font-mono text-cni-muted break-all">{selectedNode.data.fullPath}</p>
            </div>
            <div className="flex gap-4">
              <div>
                <p className="text-xs text-cni-muted mb-1">In-degree</p>
                <p className="text-lg font-bold text-indigo-400">{selectedNode.data.indegree}</p>
              </div>
              <div>
                <p className="text-xs text-cni-muted mb-1">Out-degree</p>
                <p className="text-lg font-bold text-cyan-400">{selectedNode.data.outdegree}</p>
              </div>
            </div>

            {detailsLoading ? (
              <div className="flex items-center gap-2 text-xs text-cni-muted">
                <div className="w-3 h-3 border border-cni-border border-t-cni-accent rounded-full animate-spin" />
                Loading details…
              </div>
            ) : nodeDetails ? (
              <>
                <div>
                  <p className="text-xs text-cni-muted mb-2">Imports ({nodeDetails.imports?.length || 0})</p>
                  <div className="flex flex-wrap gap-1.5">
                    {nodeDetails.imports?.map((imp) => (
                      <span key={imp} className="badge-info">{imp}</span>
                    ))}
                    {(!nodeDetails.imports || nodeDetails.imports.length === 0) && (
                      <span className="text-xs text-cni-muted">(none)</span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-cni-muted mb-2">Imported by ({nodeDetails.imported_by?.length || 0})</p>
                  <div className="flex flex-wrap gap-1.5">
                    {nodeDetails.imported_by?.map((dep) => (
                      <span key={dep} className="badge-warning">{dep}</span>
                    ))}
                    {(!nodeDetails.imported_by || nodeDetails.imported_by.length === 0) && (
                      <span className="text-xs text-cni-muted">(none)</span>
                    )}
                  </div>
                </div>
              </>
            ) : null}

            <a
              href={`/impact?file=${encodeURIComponent(selectedNode.data.label)}`}
              className="btn-primary text-xs w-full text-center block mt-4"
            >
              ⚡ Show Impact
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
