'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useGraph } from '../../hooks/useGraph';
import { useAnalysisContext } from '../client-layout';
import { explainFile } from '../../lib/api';
import { ZoomIn, ZoomOut, Maximize, Expand, Shrink, Lock, Unlock, Camera } from 'lucide-react';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--cni-border)', borderTopColor: 'var(--cni-accent)' }} />
    </div>
  ),
});

const FOLDER_COLORS = [
  '#8b5cf6', '#3b82f6', '#22d3ee', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#6366f1', '#14b8a6', '#f97316',
  '#a855f7', '#06b6d4', '#84cc16', '#e879f9', '#fb923c',
];

function getFolderFromId(id) {
  const parts = id.replace(/\\/g, '/').split('/');
  if (parts.length >= 2) return parts[parts.length - 2];
  return 'root';
}

export default function GraphPage() {
  const { repoPath, stats } = useAnalysisContext();
  const { graphData, loading, error, fetchGraph } = useGraph();
  const fgRef = useRef(null);
  const containerRef = useRef(null);

  // Dimensions via ResizeObserver
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Filters
  const [hideTests, setHideTests] = useState(true);
  const [hideIsolated, setHideIsolated] = useState(true);
  const [hideInit, setHideInit] = useState(true);
  const [minConn, setMinConn] = useState(0);
  const [colorMode, setColorMode] = useState('folder');

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchHighlight, setSearchHighlight] = useState(null);

  // Interaction
  const [selectedNode, setSelectedNode] = useState(null);
  const [nodeDetails, setNodeDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [highlightNodes, setHighlightNodes] = useState(new Set());
  const [highlightLinks, setHighlightLinks] = useState(new Set());
  const [hoverNode, setHoverNode] = useState(null);
  const [showLegend, setShowLegend] = useState(false);

  // Controls
  const [physicsLocked, setPhysicsLocked] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [engineStopped, setEngineStopped] = useState(false);

  useEffect(() => {
    if (repoPath && stats) fetchGraph(repoPath);
  }, [repoPath, stats, fetchGraph]);

  // ResizeObserver for container dimensions
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Track fullscreen changes
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Build folder color map
  const folderColorMap = useMemo(() => {
    const folders = new Map();
    graphData.nodes.forEach(n => {
      const f = getFolderFromId(n.id);
      if (!folders.has(f)) folders.set(f, folders.size);
    });
    const map = {};
    folders.forEach((idx, folder) => { map[folder] = FOLDER_COLORS[idx % FOLDER_COLORS.length]; });
    return map;
  }, [graphData.nodes]);

  // Detect circular deps
  const circularPairs = useMemo(() => {
    const edgeSet = new Set();
    graphData.links.forEach(l => {
      const s = typeof l.source === 'object' ? l.source.id : l.source;
      const t = typeof l.target === 'object' ? l.target.id : l.target;
      edgeSet.add(`${s}→${t}`);
    });
    const circular = new Set();
    graphData.links.forEach(l => {
      const s = typeof l.source === 'object' ? l.source.id : l.source;
      const t = typeof l.target === 'object' ? l.target.id : l.target;
      if (edgeSet.has(`${t}→${s}`)) { circular.add(`${s}→${t}`); circular.add(`${t}→${s}`); }
    });
    return circular;
  }, [graphData.links]);

  // Filtered data
  const filteredData = useMemo(() => {
    const isTest = (label) => /\.test\.|_test\.|test_|\.spec\./i.test(label);
    const isInit = (label) => label === '__init__.py';
    const nodeSet = new Set();
    const nodes = graphData.nodes.filter(n => {
      if (hideTests && isTest(n.label)) return false;
      if (hideInit && isInit(n.label)) return false;
      const totalConn = (n.indegree || 0) + (n.outdegree || 0);
      if (hideIsolated && totalConn === 0) return false;
      if (totalConn < minConn) return false;
      nodeSet.add(n.id);
      return true;
    });
    const links = graphData.links.filter(l => {
      const s = typeof l.source === 'object' ? l.source.id : l.source;
      const t = typeof l.target === 'object' ? l.target.id : l.target;
      return nodeSet.has(s) && nodeSet.has(t);
    });
    return { nodes, links };
  }, [graphData, hideTests, hideIsolated, hideInit, minConn]);

  // Search autocomplete
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const q = searchQuery.toLowerCase();
    setSearchResults(filteredData.nodes.filter(n => n.label.toLowerCase().includes(q)).slice(0, 8));
  }, [searchQuery, filteredData.nodes]);

  const getNodeColor = useCallback((node) => {
    if (colorMode === 'folder') return folderColorMap[getFolderFromId(node.id)] || '#64748b';
    if (colorMode === 'importance') {
      if (node.indegree >= 5) return '#f87171';
      if (node.indegree >= 1) return '#60a5fa';
      return '#94a3b8';
    }
    return node.color || '#7da8ff';
  }, [colorMode, folderColorMap]);

  const getNeighbors = useCallback((node) => {
    const nodes = new Set([node.id]);
    const links = new Set();
    filteredData.links.forEach(link => {
      const s = typeof link.source === 'object' ? link.source.id : link.source;
      const t = typeof link.target === 'object' ? link.target.id : link.target;
      if (s === node.id || t === node.id) { nodes.add(s); nodes.add(t); links.add(link); }
    });
    return { nodes, links };
  }, [filteredData.links]);

  const handleNodeClick = useCallback(async (node) => {
    const { nodes, links } = getNeighbors(node);
    setHighlightNodes(nodes);
    setHighlightLinks(links);
    setSelectedNode(node);
    setSearchHighlight(null);
    setDetailsLoading(true);
    try { const details = await explainFile(node.label, repoPath); setNodeDetails(details); }
    catch { setNodeDetails(null); }
    finally { setDetailsLoading(false); }
  }, [repoPath, getNeighbors]);

  const handleNodeHover = useCallback((node) => {
    setHoverNode(node || null);
    if (containerRef.current) containerRef.current.style.cursor = node ? 'pointer' : 'default';
  }, []);

  const handleBgClick = useCallback(() => {
    setHighlightNodes(new Set()); setHighlightLinks(new Set());
    setSelectedNode(null); setNodeDetails(null); setSearchHighlight(null);
  }, []);

  const handleSearchSelect = useCallback((node) => {
    setSearchHighlight(node.id);
    setSearchQuery(node.label);
    setSearchResults([]);
    const { nodes, links } = getNeighbors(node);
    setHighlightNodes(nodes);
    setHighlightLinks(links);
    setSelectedNode(node);
    if (fgRef.current) { fgRef.current.centerAt(node.x, node.y, 500); fgRef.current.zoom(3, 500); }
    setDetailsLoading(true);
    explainFile(node.label, repoPath).then(setNodeDetails).catch(() => setNodeDetails(null)).finally(() => setDetailsLoading(false));
  }, [repoPath, getNeighbors]);

  const handleDetailNodeClick = useCallback((targetLabel) => {
    const node = filteredData.nodes.find(n => n.label === targetLabel || n.id.endsWith(targetLabel));
    if (node && fgRef.current) handleSearchSelect(node);
  }, [filteredData.nodes, handleSearchSelect]);

  // Auto-center on first engine stop
  const handleEngineStop = useCallback(() => {
    if (!engineStopped) {
      setEngineStopped(true);
      fgRef.current?.zoomToFit(400, 50);
    }
  }, [engineStopped]);

  // Custom node painting
  const paintNode = useCallback((node, ctx, globalScale) => {
    const isActive = highlightNodes.size === 0 || highlightNodes.has(node.id);
    const isSearched = searchHighlight === node.id;
    const isHovered = hoverNode?.id === node.id;
    const radius = Math.max(3, Math.min(14, 2 + (node.indegree || 0) * 0.9));
    const alpha = isActive ? 1 : 0.1;
    const color = getNodeColor(node);

    const r = parseInt(color.slice(1, 3), 16) || 100;
    const g = parseInt(color.slice(3, 5), 16) || 150;
    const b = parseInt(color.slice(5, 7), 16) || 250;

    if (isActive || isSearched) {
      const glowAlpha = isSearched ? 0.3 : isHovered ? 0.2 : 0.12;
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius + (isSearched ? 8 : 4), 0, 2 * Math.PI);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${glowAlpha})`;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = isHovered ? '#fff' : 'rgba(255,255,255,0.15)';
    ctx.lineWidth = isHovered ? 1.2 : 0.4;
    ctx.stroke();
    ctx.globalAlpha = 1;

    const showLabel = isHovered || isSearched || node.indegree >= 3 || globalScale > 2;
    if (showLabel && isActive) {
      const fs = Math.max(10 / globalScale, 2.5);
      ctx.font = `${fs}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(226, 232, 240, 0.85)';
      ctx.fillText(node.label, node.x, node.y + radius + 2);
    }
  }, [highlightNodes, hoverNode, searchHighlight, getNodeColor]);

  const getLinkColor = useCallback((link) => {
    const s = typeof link.source === 'object' ? link.source.id : link.source;
    const t = typeof link.target === 'object' ? link.target.id : link.target;
    const key = `${s}→${t}`;
    if (highlightLinks.size > 0) {
      if (highlightLinks.has(link)) {
        if (circularPairs.has(key)) return 'rgba(251, 191, 36, 0.7)';
        return 'rgba(96, 165, 250, 0.6)';
      }
      return 'rgba(30, 34, 53, 0.15)';
    }
    if (circularPairs.has(key)) return 'rgba(251, 191, 36, 0.2)';
    const targetNode = filteredData.nodes.find(n => n.id === t);
    if (targetNode && targetNode.indegree >= 10) return 'rgba(248, 113, 113, 0.15)';
    return 'rgba(71, 85, 105, 0.08)';
  }, [highlightLinks, circularPairs, filteredData.nodes]);

  // === Floating control handlers ===
  const handleZoomIn = useCallback(() => {
    if (!fgRef.current) return;
    const cur = fgRef.current.zoom();
    fgRef.current.zoom(cur * 1.5, 300);
  }, []);

  const handleZoomOut = useCallback(() => {
    if (!fgRef.current) return;
    const cur = fgRef.current.zoom();
    fgRef.current.zoom(cur / 1.5, 300);
  }, []);

  const handleFitView = useCallback(() => {
    fgRef.current?.zoomToFit(400, 50);
  }, []);

  const handleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current.requestFullscreen();
    }
  }, []);

  const handleTogglePhysics = useCallback(() => {
    if (!fgRef.current) return;
    if (physicsLocked) {
      fgRef.current.resumeAnimation();
    } else {
      fgRef.current.pauseAnimation();
    }
    setPhysicsLocked(!physicsLocked);
  }, [physicsLocked]);

  const handleScreenshot = useCallback(() => {
    const canvas = containerRef.current?.querySelector('canvas');
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `cni-graph-${Date.now()}.png`;
    a.click();
  }, []);

  // === Not analyzed state ===
  if (!repoPath || !stats) {
    return (
      <div className="flex items-center justify-center" style={{ height: 'calc(100vh - 5.75rem)' }}>
        <p className="text-sm" style={{ color: 'var(--cni-muted)' }}>Analyze a repository first to view the dependency graph.</p>
      </div>
    );
  }

  const panelOpen = !!selectedNode;

  return (
    <div className="flex flex-col overflow-hidden" style={{ height: 'calc(100vh - 5.75rem)' }}>
      {/* ══════ Filter bar ══════ */}
      <div className="flex items-center gap-3 px-4 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--cni-border)', background: 'var(--cni-surface)' }}>
        {[
          { label: 'Hide tests', value: hideTests, set: setHideTests },
          { label: 'Hide isolated', value: hideIsolated, set: setHideIsolated },
          { label: 'Hide __init__', value: hideInit, set: setHideInit },
        ].map(({ label, value, set }) => (
          <button key={label} onClick={() => set(!value)}
            className="px-3 py-1 text-xs rounded-lg transition-all duration-200"
            style={{
              background: value ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
              border: `1px solid ${value ? 'rgba(59, 130, 246, 0.25)' : 'var(--cni-border)'}`,
              color: value ? '#60a5fa' : 'var(--cni-muted)',
            }}>
            {label}
          </button>
        ))}

        <div className="flex items-center gap-2 ml-2">
          <span className="text-xs" style={{ color: 'var(--cni-muted)' }}>Min conn:</span>
          <input type="range" min="0" max="10" value={minConn} onChange={(e) => setMinConn(parseInt(e.target.value))}
            className="w-20 h-1 rounded-full appearance-none cursor-pointer" style={{ background: 'var(--cni-border)' }} />
          <span className="text-xs w-4" style={{ color: '#60a5fa' }}>{minConn}</span>
        </div>

        <select value={colorMode} onChange={(e) => setColorMode(e.target.value)}
          className="px-2 py-1 text-xs rounded-lg ml-2" style={{ background: 'var(--cni-bg)', border: '1px solid var(--cni-border)', color: 'var(--cni-text)' }}>
          <option value="folder">Color: Folder</option>
          <option value="importance">Color: Importance</option>
          <option value="default">Color: Default</option>
        </select>

        <div className="relative ml-auto">
          <input type="text" placeholder="🔍 Search files..." value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-3 py-1 text-xs rounded-lg w-48" style={{ background: 'var(--cni-bg)', border: '1px solid var(--cni-border)', color: 'var(--cni-text)' }} />
          {searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden z-50 max-h-48 overflow-y-auto"
              style={{ background: 'var(--cni-surface)', border: '1px solid var(--cni-border)' }}>
              {searchResults.map(n => (
                <button key={n.id} onClick={() => handleSearchSelect(n)}
                  className="w-full px-3 py-2 text-left text-xs font-mono flex items-center justify-between transition-colors"
                  style={{ color: 'var(--cni-text)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.1)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <span>{n.label}</span>
                  <span style={{ color: 'var(--cni-muted)' }}>in:{n.indegree}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <span className="text-xs ml-3 flex-shrink-0" style={{ color: 'var(--cni-muted)' }}>
          {filteredData.nodes.length} nodes · {filteredData.links.length} edges
        </span>
      </div>

      {/* ══════ Graph + Side Panel ══════ */}
      <div className="flex flex-1 min-h-0">
        {/* Canvas container — fills all remaining space */}
        <div ref={containerRef} className="flex-1 min-h-0 relative overflow-hidden">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: 'rgba(6, 10, 19, 0.85)' }}>
              <div className="text-center space-y-3">
                <div className="w-8 h-8 mx-auto border-2 rounded-full animate-spin" style={{ borderColor: 'var(--cni-border)', borderTopColor: 'var(--cni-accent)' }} />
                <p className="text-sm" style={{ color: 'var(--cni-muted)' }}>Building graph…</p>
              </div>
            </div>
          )}
          {error && (
            <div className="absolute top-4 left-4 right-4 z-10 px-4 py-3 rounded-xl text-sm"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
              {error}
            </div>
          )}

          {filteredData.nodes.length > 0 && dimensions.width > 0 && (
            <ForceGraph2D
              ref={fgRef}
              graphData={filteredData}
              width={dimensions.width}
              height={dimensions.height}
              backgroundColor="#060a13"
              nodeCanvasObject={paintNode}
              nodePointerAreaPaint={(node, color, ctx) => {
                const r = Math.max(3, Math.min(14, 2 + (node.indegree || 0) * 0.9)) + 5;
                ctx.beginPath(); ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
                ctx.fillStyle = color; ctx.fill();
              }}
              linkColor={getLinkColor}
              linkWidth={(link) => highlightLinks.has(link) ? 1.5 : 0.5}
              linkCurvature={0.15}
              linkDirectionalParticles={2}
              linkDirectionalParticleWidth={2}
              linkDirectionalParticleColor={() => '#22d3ee'}
              linkDirectionalParticleSpeed={0.004}
              onNodeClick={handleNodeClick}
              onNodeHover={handleNodeHover}
              onBackgroundClick={handleBgClick}
              onEngineStop={handleEngineStop}
              warmupTicks={100}
              cooldownTime={3000}
              enableNodeDrag={true}
              enableZoomInteraction={true}
              enablePanInteraction={true}
            />
          )}

          {/* ── Hover tooltip ── */}
          {hoverNode && (
            <div className="absolute z-20 px-3 py-2 rounded-xl text-xs pointer-events-none animate-fade-in"
              style={{ left: 16, bottom: 16, background: 'rgba(12, 18, 32, 0.9)', border: '1px solid var(--cni-border)', backdropFilter: 'blur(8px)' }}>
              <p className="font-mono font-semibold" style={{ color: 'var(--cni-text)' }}>{hoverNode.label}</p>
              <p style={{ color: 'var(--cni-muted)' }} className="mt-0.5">📁 {getFolderFromId(hoverNode.id)}</p>
              <p style={{ color: 'var(--cni-muted)' }}>
                in: <span style={{ color: '#60a5fa' }}>{hoverNode.indegree}</span>{' · '}out: <span style={{ color: '#22d3ee' }}>{hoverNode.outdegree}</span>
              </p>
            </div>
          )}

          {/* ── Color legend ── */}
          <div className="absolute bottom-14 left-3 z-10">
            <button onClick={() => setShowLegend(!showLegend)} className="px-2 py-1 rounded-lg text-xs"
              style={{ background: 'rgba(12, 18, 32, 0.85)', border: '1px solid var(--cni-border)', color: 'var(--cni-muted)' }}>
              {showLegend ? '▼ Legend' : '▶ Legend'}
            </button>
            {showLegend && (
              <div className="mt-1 p-3 rounded-xl animate-fade-in max-h-48 overflow-y-auto"
                style={{ background: 'rgba(12, 18, 32, 0.92)', border: '1px solid var(--cni-border)', minWidth: 140 }}>
                {colorMode === 'folder' ? (
                  Object.entries(folderColorMap).slice(0, 12).map(([folder, color]) => (
                    <div key={folder} className="flex items-center gap-2 py-0.5">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                      <span className="text-xs font-mono truncate" style={{ color: 'var(--cni-muted)' }}>{folder}</span>
                    </div>
                  ))
                ) : colorMode === 'importance' ? (
                  <>
                    <div className="flex items-center gap-2 py-0.5"><div className="w-2.5 h-2.5 rounded-full" style={{ background: '#f87171' }} /><span className="text-xs" style={{ color: 'var(--cni-muted)' }}>High (5+ deps)</span></div>
                    <div className="flex items-center gap-2 py-0.5"><div className="w-2.5 h-2.5 rounded-full" style={{ background: '#60a5fa' }} /><span className="text-xs" style={{ color: 'var(--cni-muted)' }}>Medium (1-4)</span></div>
                    <div className="flex items-center gap-2 py-0.5"><div className="w-2.5 h-2.5 rounded-full" style={{ background: '#94a3b8' }} /><span className="text-xs" style={{ color: 'var(--cni-muted)' }}>Low / isolated</span></div>
                  </>
                ) : <p className="text-xs" style={{ color: 'var(--cni-muted)' }}>Using API colors</p>}
                {circularPairs.size > 0 && (
                  <div className="flex items-center gap-2 py-0.5 mt-1 pt-1" style={{ borderTop: '1px solid var(--cni-border)' }}>
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#fbbf24' }} />
                    <span className="text-xs" style={{ color: '#fbbf24' }}>Circular dep</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ══════ Floating Controls ══════ */}
          <div className="absolute z-50 flex flex-col gap-2" style={{
            bottom: 20, right: 20,
            background: 'rgba(10, 10, 15, 0.85)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 12, padding: 8,
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
          }}>
            {[
              { icon: <ZoomIn size={18} />, label: 'Zoom In', onClick: handleZoomIn },
              { icon: <ZoomOut size={18} />, label: 'Zoom Out', onClick: handleZoomOut },
              { icon: <Maximize size={18} />, label: 'Fit to View', onClick: handleFitView },
              { icon: isFullscreen ? <Shrink size={18} /> : <Expand size={18} />, label: isFullscreen ? 'Exit Fullscreen' : 'Fullscreen', onClick: handleFullscreen },
              { icon: physicsLocked ? <Lock size={18} /> : <Unlock size={18} />, label: physicsLocked ? 'Unlock Physics' : 'Lock Physics', onClick: handleTogglePhysics, active: physicsLocked },
              { icon: <Camera size={18} />, label: 'Screenshot', onClick: handleScreenshot },
            ].map(({ icon, label, onClick, active }) => (
              <button
                key={label}
                onClick={onClick}
                tabIndex={0}
                aria-label={label}
                className="relative group flex items-center justify-center transition-all duration-200"
                style={{
                  width: 36, height: 36,
                  borderRadius: 8, border: 'none',
                  background: active ? 'rgba(255, 150, 50, 0.15)' : 'transparent',
                  color: active ? '#f59e0b' : 'rgba(255, 255, 255, 0.6)',
                  cursor: 'pointer',
                }}
                onMouseEnter={e => {
                  if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'rgba(255,255,255,0.9)'; }
                }}
                onMouseLeave={e => {
                  if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }
                }}
              >
                {icon}
                {/* Tooltip — left side */}
                <span className="absolute right-full mr-2 px-2 py-1 rounded-lg text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 delay-200"
                  style={{ background: 'rgba(12, 18, 32, 0.95)', border: '1px solid var(--cni-border)', color: '#e2e8f0' }}>
                  {label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ══════ Side Panel ══════ */}
        {panelOpen && (
          <div className="w-80 overflow-y-auto animate-slide-in-right flex-shrink-0"
            style={{ background: 'var(--cni-surface)', borderLeft: '1px solid var(--cni-border)' }}>
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--cni-text)' }}>Node Details</h3>
                <button onClick={handleBgClick} className="text-lg leading-none transition-colors" style={{ color: 'var(--cni-muted)' }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--cni-text)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--cni-muted)'}>×</button>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-xs mb-1" style={{ color: 'var(--cni-muted)' }}>📄 Filename</p>
                  <p className="text-sm font-mono font-semibold" style={{ color: 'var(--cni-text)' }}>{selectedNode.label}</p>
                </div>
                <div>
                  <p className="text-xs mb-1" style={{ color: 'var(--cni-muted)' }}>📁 Path</p>
                  <p className="text-xs font-mono break-all" style={{ color: 'var(--cni-muted)' }}>{selectedNode.id}</p>
                </div>

                <div className="flex gap-4">
                  <div className="glass-card p-3 flex-1 text-center">
                    <p className="text-xs mb-0.5" style={{ color: 'var(--cni-muted)' }}>In-degree</p>
                    <p className="text-xl font-bold" style={{ color: '#60a5fa' }}>{selectedNode.indegree}</p>
                  </div>
                  <div className="glass-card p-3 flex-1 text-center">
                    <p className="text-xs mb-0.5" style={{ color: 'var(--cni-muted)' }}>Out-degree</p>
                    <p className="text-xl font-bold" style={{ color: '#22d3ee' }}>{selectedNode.outdegree}</p>
                  </div>
                </div>

                {detailsLoading ? (
                  <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--cni-muted)' }}>
                    <div className="w-3 h-3 border rounded-full animate-spin" style={{ borderColor: 'var(--cni-border)', borderTopColor: 'var(--cni-accent)' }} />
                    Loading…
                  </div>
                ) : nodeDetails ? (
                  <>
                    <div>
                      <p className="text-xs mb-2" style={{ color: 'var(--cni-muted)' }}>Imported by ({nodeDetails.imported_by?.length || 0})</p>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {nodeDetails.imported_by?.map((dep) => (
                          <button key={dep} onClick={() => handleDetailNodeClick(dep)}
                            className="w-full text-left px-2 py-1.5 rounded-lg text-xs font-mono transition-colors"
                            style={{ color: 'var(--cni-text)' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.1)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            {dep}
                          </button>
                        ))}
                        {(!nodeDetails.imported_by || nodeDetails.imported_by.length === 0) && <span className="text-xs" style={{ color: 'var(--cni-muted)' }}>(none)</span>}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs mb-2" style={{ color: 'var(--cni-muted)' }}>Imports ({nodeDetails.imports?.length || 0})</p>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {nodeDetails.imports?.map((imp) => (
                          <button key={imp} onClick={() => handleDetailNodeClick(imp)}
                            className="w-full text-left px-2 py-1.5 rounded-lg text-xs font-mono transition-colors"
                            style={{ color: 'var(--cni-text)' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.1)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            {imp}
                          </button>
                        ))}
                        {(!nodeDetails.imports || nodeDetails.imports.length === 0) && <span className="text-xs" style={{ color: 'var(--cni-muted)' }}>(none)</span>}
                      </div>
                    </div>
                  </>
                ) : null}

                <div className="flex gap-2 pt-2">
                  <a href={`/impact?file=${encodeURIComponent(selectedNode.label)}`}
                    className="btn-primary text-xs flex-1 text-center py-2">⚡ Impact</a>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
