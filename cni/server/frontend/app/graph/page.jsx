'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useGraph } from '../../hooks/useGraph';
import { useAnalysisContext } from '../client-layout';
import { explainFile } from '../../lib/api';

// Must disable SSR — react-force-graph needs browser Canvas API
const ForceGraph2D = dynamic(() => import('react-force-graph').then(mod => mod.ForceGraph2D), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 border-2 border-cni-border border-t-cni-accent rounded-full animate-spin" />
    </div>
  ),
});

export default function GraphPage() {
  const { repoPath, stats } = useAnalysisContext();
  const { graphData, loading, error, fetchGraph } = useGraph();
  const [selectedNode, setSelectedNode] = useState(null);
  const [nodeDetails, setNodeDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [highlightNodes, setHighlightNodes] = useState(new Set());
  const [highlightLinks, setHighlightLinks] = useState(new Set());
  const [hoverNode, setHoverNode] = useState(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const containerRef = useRef(null);
  const fgRef = useRef(null);

  useEffect(() => {
    if (repoPath && stats) {
      fetchGraph(repoPath);
    }
  }, [repoPath, stats, fetchGraph]);

  // Track container size
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({ width: rect.width, height: rect.height });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Build neighbor maps for highlight on click
  const getNeighbors = useCallback((node) => {
    const nodes = new Set();
    const links = new Set();
    nodes.add(node.id);

    graphData.links.forEach((link) => {
      const srcId = typeof link.source === 'object' ? link.source.id : link.source;
      const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
      if (srcId === node.id || tgtId === node.id) {
        nodes.add(srcId);
        nodes.add(tgtId);
        links.add(link);
      }
    });
    return { nodes, links };
  }, [graphData.links]);

  const handleNodeClick = useCallback(async (node) => {
    const { nodes, links } = getNeighbors(node);
    setHighlightNodes(nodes);
    setHighlightLinks(links);
    setSelectedNode(node);
    setDetailsLoading(true);
    try {
      const details = await explainFile(node.label, repoPath);
      setNodeDetails(details);
    } catch {
      setNodeDetails(null);
    } finally {
      setDetailsLoading(false);
    }
  }, [repoPath, getNeighbors]);

  const handleNodeHover = useCallback((node) => {
    setHoverNode(node || null);
    if (containerRef.current) {
      containerRef.current.style.cursor = node ? 'pointer' : 'default';
    }
  }, []);

  const handleBackgroundClick = useCallback(() => {
    setHighlightNodes(new Set());
    setHighlightLinks(new Set());
    setSelectedNode(null);
    setNodeDetails(null);
  }, []);

  // Custom node painting with glow effect
  const paintNode = useCallback((node, ctx, globalScale) => {
    const isHighlighted = highlightNodes.size === 0 || highlightNodes.has(node.id);
    const isHovered = hoverNode?.id === node.id;
    const radius = Math.max(3, 2 + (node.indegree || 0) * 0.8);
    const alpha = isHighlighted ? 1 : 0.15;

    // Outer glow
    if (isHighlighted) {
      const glowColor = node.indegree >= 5 ? 'rgba(255, 100, 100, 0.25)'
        : node.indegree >= 1 ? 'rgba(99, 140, 255, 0.25)'
        : 'rgba(140, 160, 200, 0.15)';
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius + 4, 0, 2 * Math.PI);
      ctx.fillStyle = glowColor;
      ctx.fill();
    }

    // Extra glow ring on hover
    if (isHovered) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius + 6, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(99, 102, 241, 0.3)';
      ctx.fill();
    }

    // Node circle
    const nodeColor = node.indegree >= 5 ? '#ff8a8a'
      : node.indegree >= 1 ? '#7da8ff'
      : '#8a9bb8';
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = nodeColor;
    ctx.globalAlpha = alpha;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Border
    ctx.strokeStyle = isHovered ? '#818cf8' : 'rgba(100, 116, 139, 0.4)';
    ctx.lineWidth = isHovered ? 1.5 : 0.5;
    ctx.globalAlpha = alpha;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Label (only at sufficient zoom)
    if (globalScale > 1.2 || isHovered || node.indegree >= 3) {
      const fontSize = Math.max(9 / globalScale, 2.5);
      ctx.font = `${fontSize}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = isHighlighted ? 'rgba(226, 232, 240, 0.9)' : 'rgba(226, 232, 240, 0.15)';
      ctx.fillText(node.label, node.x, node.y + radius + 2);
    }
  }, [highlightNodes, hoverNode]);

  if (!repoPath || !stats) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <p className="text-cni-muted text-sm">Analyze a repository first to view the dependency graph.</p>
      </div>
    );
  }

  const panelWidth = selectedNode ? 320 : 0;

  return (
    <div className="h-[calc(100vh-6rem)] flex">
      {/* Graph canvas area */}
      <div className="flex-1 relative" ref={containerRef}>
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

        {/* Node count badge */}
        <div className="absolute top-4 left-4 z-10 px-3 py-1.5 glass-card text-xs text-cni-muted">
          {graphData.nodes.length} nodes · {graphData.links.length} edges
        </div>

        {graphData.nodes.length > 0 && (
          <ForceGraph2D
            ref={fgRef}
            graphData={graphData}
            width={dimensions.width - panelWidth}
            height={dimensions.height}
            backgroundColor="#0a0a0f"
            nodeCanvasObject={paintNode}
            nodePointerAreaPaint={(node, color, ctx) => {
              const r = Math.max(3, 2 + (node.indegree || 0) * 0.8) + 4;
              ctx.beginPath();
              ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
              ctx.fillStyle = color;
              ctx.fill();
            }}
            linkColor={(link) =>
              highlightLinks.size > 0
                ? highlightLinks.has(link) ? 'rgba(129, 140, 248, 0.5)' : 'rgba(30, 30, 46, 0.3)'
                : 'rgba(71, 85, 105, 0.25)'
            }
            linkWidth={(link) => (highlightLinks.has(link) ? 1.5 : 0.5)}
            linkDirectionalParticles={3}
            linkDirectionalParticleWidth={1.5}
            linkDirectionalParticleColor={() => '#6366f1'}
            linkDirectionalParticleSpeed={0.004}
            onNodeClick={handleNodeClick}
            onNodeHover={handleNodeHover}
            onBackgroundClick={handleBackgroundClick}
            warmupTicks={100}
            cooldownTime={3000}
            enableNodeDrag={true}
            enableZoomInteraction={true}
            enablePanInteraction={true}
          />
        )}

        {/* Hover tooltip */}
        {hoverNode && (
          <div
            className="absolute z-20 glass-card px-3 py-2 text-xs pointer-events-none animate-fade-in"
            style={{ left: 16, bottom: 16 }}
          >
            <p className="font-mono text-cni-text font-semibold">{hoverNode.label}</p>
            <p className="text-cni-muted mt-0.5">
              in: <span className="text-indigo-400">{hoverNode.indegree}</span>
              {' · '}
              out: <span className="text-cyan-400">{hoverNode.outdegree}</span>
            </p>
          </div>
        )}
      </div>

      {/* Details panel */}
      {selectedNode && (
        <div className="w-80 bg-cni-surface border-l border-cni-border p-5 overflow-y-auto animate-fade-in flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-cni-text">Node Details</h3>
            <button
              onClick={handleBackgroundClick}
              className="text-cni-muted hover:text-cni-text text-lg leading-none"
            >×</button>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-xs text-cni-muted mb-1">Filename</p>
              <p className="text-sm font-mono text-cni-text">{selectedNode.label}</p>
            </div>
            <div>
              <p className="text-xs text-cni-muted mb-1">Full Path</p>
              <p className="text-xs font-mono text-cni-muted break-all">{selectedNode.id}</p>
            </div>
            <div className="flex gap-4">
              <div>
                <p className="text-xs text-cni-muted mb-1">In-degree</p>
                <p className="text-lg font-bold text-indigo-400">{selectedNode.indegree}</p>
              </div>
              <div>
                <p className="text-xs text-cni-muted mb-1">Out-degree</p>
                <p className="text-lg font-bold text-cyan-400">{selectedNode.outdegree}</p>
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
              href={`/impact?file=${encodeURIComponent(selectedNode.label)}`}
              className="btn-primary text-xs w-full text-center block mt-4"
            >⚡ Show Impact</a>
          </div>
        </div>
      )}
    </div>
  );
}
