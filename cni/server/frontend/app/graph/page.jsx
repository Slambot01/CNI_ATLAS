'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useGraph } from '../../hooks/useGraph';
import { useAnalysisContext } from '../client-layout';
import { useAppContext } from '../../context/AppContext';
import { explainFile, semanticSearch, findPath } from '../../lib/api';
import { ZoomIn, ZoomOut, Maximize, Expand, Shrink, Lock, Unlock, Camera, Search, Sparkles, X, Route, ArrowRight, RefreshCw, Download, Star } from 'lucide-react';
import { exportGraphData } from '../../lib/exportReport';
import NotAnalyzed from '../../components/NotAnalyzed';
import ErrorMessage from '../../components/ErrorMessage';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import GraphChat from '../../components/GraphChat';

// Manual dynamic import that preserves ref forwarding
function useForceGraph() {
  const [Component, setComponent] = useState(null);
  useEffect(() => {
    import('react-force-graph-2d').then((mod) => {
      setComponent(() => mod.default || mod);
    });
  }, []);
  return Component;
}

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

// ─── Constants for layout math ───
const HEADER_H = 56;
const FILTER_H = 48;
const PATH_PANEL_H = 52;
const STATUS_H = 36;
const PANEL_W = 300;
const CHAT_OPEN_W = 340;
const CHAT_CLOSED_W = 44;

export default function GraphPage() {
  const ForceGraph2D = useForceGraph();
  const { repoPath, stats } = useAnalysisContext();
  const { setSelectedChatFile, bookmarks, addBookmark, removeBookmark, isBookmarked } = useAppContext();
  const { graphData, loading, error, notAnalyzed, fetchGraph } = useGraph();
  const fgRef = useRef(null);

  // ── Chat sidebar state ──
  const [chatOpen, setChatOpen] = useState(false);

  // ── Dimensions: simple window-based calc ──
  const [graphW, setGraphW] = useState(800);
  const [graphH, setGraphH] = useState(600);

  const updateSize = useCallback((panelOpen, isChatOpen, hasPathPanel) => {
    const sidebarW = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width')) || 64;
    const chatW = isChatOpen ? CHAT_OPEN_W : CHAT_CLOSED_W;
    const w = window.innerWidth - sidebarW - (panelOpen ? PANEL_W : 0) - chatW;
    const extraH = hasPathPanel ? PATH_PANEL_H : 0;
    const h = window.innerHeight - HEADER_H - FILTER_H - STATUS_H - extraH;
    setGraphW(Math.max(w, 100));
    setGraphH(Math.max(h, 100));
  }, []);

  // Filters
  const [hideTests, setHideTests] = useState(true);
  const [hideIsolated, setHideIsolated] = useState(true);
  const [hideInit, setHideInit] = useState(true);
  const [minConn, setMinConn] = useState(0);
  const [colorMode, setColorMode] = useState('folder');

  // Search — file mode
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchHighlight, setSearchHighlight] = useState(null);

  // Search — smart mode
  const [searchMode, setSearchMode] = useState('file'); // 'file' | 'smart'
  const [smartSearchResults, setSmartSearchResults] = useState(null); // [{file, path, score}]
  const [smartSearchLoading, setSmartSearchLoading] = useState(false);
  const [smartSearchQuery, setSmartSearchQuery] = useState('');

  // Path finder mode
  const [pathMode, setPathMode] = useState(false);
  const [pathSource, setPathSource] = useState(null);   // node object
  const [pathTarget, setPathTarget] = useState(null);   // node object
  const [pathResult, setPathResult] = useState(null);    // API result
  const [pathLoading, setPathLoading] = useState(false);
  const [pathStep, setPathStep] = useState('source');    // 'source' | 'target' | 'done'

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
  const [hasAutoFit, setHasAutoFit] = useState(false);

  const panelOpen = !!selectedNode;

  // Bookmark note input state
  const [bookmarkNote, setBookmarkNote] = useState('');

  // Set of bookmarked file labels for O(1) lookup in painting
  const bookmarkedFiles = useMemo(() => {
    const set = new Set();
    bookmarks.forEach((b) => set.add(b.file));
    return set;
  }, [bookmarks]);

  // Build a map of filename -> score from smart search results for fast lookup
  const smartScoreMap = useMemo(() => {
    if (!smartSearchResults) return null;
    const map = new Map();
    smartSearchResults.forEach(r => {
      // Match by full path or just filename
      map.set(r.path, r.score);
      map.set(r.file, r.score);
    });
    return map;
  }, [smartSearchResults]);

  // Resize listener
  const hasPathPanel = pathMode && (pathResult !== null || pathLoading);
  useEffect(() => {
    updateSize(panelOpen, chatOpen, hasPathPanel);
    const onResize = () => updateSize(panelOpen, chatOpen, hasPathPanel);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [panelOpen, chatOpen, hasPathPanel, updateSize]);

  useEffect(() => {
    if (repoPath && stats) fetchGraph(repoPath);
  }, [repoPath, stats, fetchGraph]);


  // Fullscreen
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Folder color map
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

  // Circular deps
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
    const isInitFile = (label) => label === '__init__.py';
    const nodeSet = new Set();
    const nodes = graphData.nodes.filter(n => {
      if (hideTests && isTest(n.label)) return false;
      if (hideInit && isInitFile(n.label)) return false;
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

  // File search (instant, local)
  useEffect(() => {
    if (searchMode !== 'file') return;
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const q = searchQuery.toLowerCase();
    setSearchResults(filteredData.nodes.filter(n => n.label.toLowerCase().includes(q)).slice(0, 8));
  }, [searchQuery, filteredData.nodes, searchMode]);

  // Smart search handler (on Enter or button click)
  const handleSmartSearch = useCallback(async () => {
    if (!searchQuery.trim() || !repoPath) return;
    setSmartSearchLoading(true);
    setSmartSearchQuery(searchQuery.trim());
    try {
      const res = await semanticSearch(searchQuery.trim(), repoPath, 10);
      if (res?.results) {
        setSmartSearchResults(res.results);
        // Build a set of matching node IDs for highlighting
        const matchSet = new Set();
        res.results.forEach(r => {
          const node = filteredData.nodes.find(n => n.id === r.path || n.label === r.file);
          if (node) matchSet.add(node.id);
        });
        setHighlightNodes(matchSet);
        setHighlightLinks(new Set());
        setSelectedNode(null);
        setNodeDetails(null);
        setSearchHighlight(null);
      }
    } catch {
      setSmartSearchResults([]);
    } finally {
      setSmartSearchLoading(false);
    }
  }, [searchQuery, repoPath, filteredData.nodes]);

  const clearSmartSearch = useCallback(() => {
    setSmartSearchResults(null);
    setSmartSearchQuery('');
    setSearchQuery('');
    setHighlightNodes(new Set());
    setHighlightLinks(new Set());
  }, []);

  const handleSearchKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && searchMode === 'smart') {
      e.preventDefault();
      handleSmartSearch();
    }
  }, [searchMode, handleSmartSearch]);

  const toggleSearchMode = useCallback(() => {
    const next = searchMode === 'file' ? 'smart' : 'file';
    setSearchMode(next);
    setSearchQuery('');
    setSearchResults([]);
    setSmartSearchResults(null);
    setSmartSearchQuery('');
    setHighlightNodes(new Set());
    setHighlightLinks(new Set());
    // Entering search clears path mode
    if (pathMode) {
      setPathMode(false); setPathSource(null); setPathTarget(null);
      setPathResult(null); setPathStep('source');
    }
  }, [searchMode, pathMode]);

  // ── Path finder ──
  const pathNodeSet = useMemo(() => {
    if (!pathResult?.found || !pathResult.full_path) return null;
    return new Set(pathResult.full_path);
  }, [pathResult]);

  // Build ordered edges set for path highlighting
  const pathEdgeSet = useMemo(() => {
    if (!pathResult?.found || !pathResult.full_path) return null;
    const edges = new Set();
    for (let i = 0; i < pathResult.full_path.length - 1; i++) {
      edges.add(`${pathResult.full_path[i]}→${pathResult.full_path[i + 1]}`);
    }
    return edges;
  }, [pathResult]);

  const clearPath = useCallback(() => {
    setPathMode(false);
    setPathSource(null);
    setPathTarget(null);
    setPathResult(null);
    setPathLoading(false);
    setPathStep('source');
    setHighlightNodes(new Set());
    setHighlightLinks(new Set());
    setSelectedNode(null);
    setNodeDetails(null);
  }, []);

  const togglePathMode = useCallback(() => {
    if (pathMode) {
      clearPath();
    } else {
      // Entering path mode clears smart search
      setSmartSearchResults(null);
      setSmartSearchQuery('');
      setSearchQuery('');
      setSearchResults([]);
      setHighlightNodes(new Set());
      setHighlightLinks(new Set());
      setSelectedNode(null);
      setNodeDetails(null);
      setPathMode(true);
      setPathSource(null);
      setPathTarget(null);
      setPathResult(null);
      setPathStep('source');
    }
  }, [pathMode, clearPath]);

  const runPathFinder = useCallback(async (sourceNode, targetNode) => {
    if (!sourceNode || !targetNode || !repoPath) return;
    setPathLoading(true);
    setPathResult(null);
    try {
      const res = await findPath(sourceNode.label, targetNode.label, repoPath);
      setPathResult(res);
      if (res?.found && res.full_path) {
        setHighlightNodes(new Set(res.full_path));
        setHighlightLinks(new Set());
      }
      setPathStep('done');
    } catch {
      setPathResult({ found: false, path: [], length: 0 });
      setPathStep('done');
    } finally {
      setPathLoading(false);
    }
  }, [repoPath]);

  const handleSwapPath = useCallback(() => {
    if (!pathSource || !pathTarget) return;
    const tmp = pathSource;
    setPathSource(pathTarget);
    setPathTarget(tmp);
    setPathResult(null);
    setPathStep('done');
    runPathFinder(pathTarget, tmp);
  }, [pathSource, pathTarget, runPathFinder]);

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
    // ── Path mode: select source / target ──
    if (pathMode) {
      if (pathStep === 'source') {
        setPathSource(node);
        setPathTarget(null);
        setPathResult(null);
        setPathStep('target');
        setHighlightNodes(new Set([node.id]));
        setHighlightLinks(new Set());
        return;
      }
      if (pathStep === 'target') {
        if (node.id === pathSource?.id) return; // can't pick same node
        setPathTarget(node);
        setPathStep('done');
        setHighlightNodes(new Set([pathSource.id, node.id]));
        runPathFinder(pathSource, node);
        return;
      }
      // If already 'done', clicking a node in the path opens details
    }

    // ── Normal mode ──
    const { nodes, links } = getNeighbors(node);
    setHighlightNodes(nodes);
    setHighlightLinks(links);
    setSelectedNode(node);
    setSearchHighlight(null);
    setSelectedChatFile(node);
    setDetailsLoading(true);
    try { const details = await explainFile(node.label, repoPath); setNodeDetails(details); }
    catch { setNodeDetails(null); }
    finally { setDetailsLoading(false); }
  }, [repoPath, getNeighbors, setSelectedChatFile, pathMode, pathStep, pathSource, runPathFinder]);

  const handleNodeHover = useCallback((node) => {
    setHoverNode(node || null);
  }, []);

  const handleBgClick = useCallback(() => {
    setHighlightNodes(new Set()); setHighlightLinks(new Set());
    setSelectedNode(null); setNodeDetails(null); setSearchHighlight(null);
    // If smart search is active, restore its highlighting after clearing node selection
    if (smartSearchResults && smartSearchResults.length > 0) {
      const matchSet = new Set();
      smartSearchResults.forEach(r => {
        const node = filteredData.nodes.find(n => n.id === r.path || n.label === r.file);
        if (node) matchSet.add(node.id);
      });
      setHighlightNodes(matchSet);
    }
  }, [smartSearchResults, filteredData.nodes]);

  const handleSearchSelect = useCallback((node) => {
    setSearchHighlight(node.id);
    setSearchQuery(node.label);
    setSearchResults([]);
    const { nodes, links } = getNeighbors(node);
    setHighlightNodes(nodes);
    setHighlightLinks(links);
    setSelectedNode(node);
    setSelectedChatFile(node);
    if (fgRef.current) { fgRef.current.centerAt(node.x, node.y, 500); fgRef.current.zoom(3, 500); }
    setDetailsLoading(true);
    explainFile(node.label, repoPath).then(setNodeDetails).catch(() => setNodeDetails(null)).finally(() => setDetailsLoading(false));
  }, [repoPath, getNeighbors, setSelectedChatFile]);

  // Handle ?search= param from sidebar bookmark click
  useEffect(() => {
    if (typeof window === 'undefined' || filteredData.nodes.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const searchFile = params.get('search');
    if (!searchFile) return;
    // Clear the param so it doesn't re-trigger
    window.history.replaceState({}, '', window.location.pathname);
    // Find and select the node
    const node = filteredData.nodes.find(
      (n) => n.label === searchFile || n.id.endsWith(searchFile)
    );
    if (node) {
      setTimeout(() => handleSearchSelect(node), 600);
    }
  }, [filteredData.nodes]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSmartResultClick = useCallback((result) => {
    const node = filteredData.nodes.find(n => n.id === result.path || n.label === result.file);
    if (node && fgRef.current) {
      fgRef.current.centerAt(node.x, node.y, 500);
      fgRef.current.zoom(3, 500);
      // Also select the node for details
      setSelectedNode(node);
      setSelectedChatFile(node);
      setDetailsLoading(true);
      explainFile(node.label, repoPath).then(setNodeDetails).catch(() => setNodeDetails(null)).finally(() => setDetailsLoading(false));
    }
  }, [filteredData.nodes, repoPath, setSelectedChatFile]);

  const handleDetailNodeClick = useCallback((targetLabel) => {
    const node = filteredData.nodes.find(n => n.label === targetLabel || n.id.endsWith(targetLabel));
    if (node) handleSearchSelect(node);
  }, [filteredData.nodes, handleSearchSelect]);

  // Auto-fit once after first render
  const handleEngineStop = useCallback(() => {
    if (!hasAutoFit && fgRef.current) {
      setHasAutoFit(true);
      setTimeout(() => {
        try { fgRef.current?.zoomToFit(400, 60); } catch (_) {}
      }, 300);
    }
  }, [hasAutoFit]);

  // ── Node painting ──
  const paintNode = useCallback((node, ctx, globalScale) => {
    const isSearched = searchHighlight === node.id;
    const isHovered = hoverNode?.id === node.id;
    const radius = Math.max(3, Math.min(14, 2 + (node.indegree || 0) * 0.9));
    const color = getNodeColor(node);

    const cr = parseInt(color.slice(1, 3), 16) || 100;
    const cg = parseInt(color.slice(3, 5), 16) || 150;
    const cb = parseInt(color.slice(5, 7), 16) || 250;

    // Determine alpha and glow based on current mode
    let alpha = 1;
    let glowRadius = 0;
    let glowAlpha = 0;
    let glowColor = null; // custom glow color for path mode

    // ── Path mode rendering ──
    if (pathNodeSet) {
      const isSource = pathSource && node.id === pathSource.id;
      const isTarget = pathTarget && node.id === pathTarget.id;
      const inPath = pathNodeSet.has(node.id);

      if (isSource) {
        alpha = 1; glowRadius = 12; glowAlpha = 0.4;
        glowColor = 'rgba(34, 197, 94, ALPHA)'; // green
      } else if (isTarget) {
        alpha = 1; glowRadius = 12; glowAlpha = 0.4;
        glowColor = 'rgba(239, 68, 68, ALPHA)'; // red
      } else if (inPath) {
        alpha = 1; glowRadius = 8; glowAlpha = 0.3;
        glowColor = 'rgba(250, 204, 21, ALPHA)'; // yellow
      } else {
        alpha = 0.08;
      }
    } else if (pathMode && pathSource && !pathTarget) {
      // Selecting source: highlight source, dim rest slightly
      if (node.id === pathSource.id) {
        alpha = 1; glowRadius = 12; glowAlpha = 0.4;
        glowColor = 'rgba(34, 197, 94, ALPHA)';
      } else {
        alpha = 0.35;
      }
    } else if (smartScoreMap && !selectedNode) {
      // Smart search mode: highlight by score
      const score = smartScoreMap.get(node.id) || smartScoreMap.get(node.label) || 0;
      if (score > 0) {
        alpha = score > 0.8 ? 1.0 : score > 0.5 ? 0.85 : 0.65;
        glowRadius = score > 0.8 ? 10 : score > 0.5 ? 6 : 3;
        glowAlpha = score > 0.8 ? 0.35 : score > 0.5 ? 0.2 : 0.1;
      } else {
        alpha = 0.08;
      }
    } else if (highlightNodes.size > 0) {
      // Click-to-highlight mode
      alpha = highlightNodes.has(node.id) ? 1 : 0.1;
    }

    const isActive = alpha > 0.15;

    // Glow ring
    if ((isActive && glowRadius > 0) || isSearched) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius + (isSearched ? 8 : glowRadius || 4), 0, 2 * Math.PI);
      if (glowColor) {
        ctx.fillStyle = glowColor.replace('ALPHA', String(isSearched ? 0.3 : glowAlpha || 0.12));
      } else {
        ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${isSearched ? 0.3 : glowAlpha || 0.12})`;
      }
      ctx.fill();
    } else if (isActive && (highlightNodes.size === 0 || highlightNodes.has(node.id))) {
      if (isHovered) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius + 4, 0, 2 * Math.PI);
        ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, 0.2)`;
        ctx.fill();
      }
    }

    // Main circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fill();

    // For path nodes, add a colored border
    if (pathNodeSet && pathNodeSet.has(node.id)) {
      const isSource = pathSource && node.id === pathSource.id;
      const isTarget = pathTarget && node.id === pathTarget.id;
      ctx.strokeStyle = isSource ? '#22c55e' : isTarget ? '#ef4444' : '#facc15';
      ctx.lineWidth = 2;
    } else {
      ctx.strokeStyle = isHovered ? '#fff' : 'rgba(255,255,255,0.15)';
      ctx.lineWidth = isHovered ? 1.2 : 0.4;
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    const showLabel = isHovered || isSearched || node.indegree >= 3 || globalScale > 2
      || (smartScoreMap && (smartScoreMap.get(node.id) || smartScoreMap.get(node.label)))
      || (pathNodeSet && pathNodeSet.has(node.id))
      || (pathMode && pathSource && node.id === pathSource.id);
    if (showLabel && isActive) {
      const fs = Math.max(10 / globalScale, 2.5);
      ctx.font = `${fs}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(226, 232, 240, 0.85)';
      ctx.fillText(node.label, node.x, node.y + radius + 2);
    }

    // Draw yellow star on bookmarked nodes
    if (isActive && bookmarkedFiles.has(node.label)) {
      const starSize = Math.max(3, Math.min(5, radius * 0.45));
      const starX = node.x;
      const starY = node.y - radius - starSize - 1;
      const spikes = 5;
      const outerR = starSize;
      const innerR = starSize * 0.45;
      ctx.beginPath();
      for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const angle = (Math.PI * i) / spikes - Math.PI / 2;
        const sx = starX + Math.cos(angle) * r;
        const sy = starY + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.closePath();
      ctx.fillStyle = '#FFD700';
      ctx.globalAlpha = alpha;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }, [highlightNodes, hoverNode, searchHighlight, getNodeColor, smartScoreMap, selectedNode, pathNodeSet, pathMode, pathSource, pathTarget, bookmarkedFiles]);

  // ── Edge color ──
  const getLinkColor = useCallback((link) => {
    const s = typeof link.source === 'object' ? link.source.id : link.source;
    const t = typeof link.target === 'object' ? link.target.id : link.target;
    const key = `${s}→${t}`;

    // ── Path mode: only highlight path edges ──
    if (pathEdgeSet) {
      if (pathEdgeSet.has(key)) return 'rgba(250, 204, 21, 0.9)';
      return 'rgba(30, 34, 53, 0.03)';
    }

    // In smart search mode with no node selected, dim all edges
    if (smartScoreMap && !selectedNode) {
      const sScore = smartScoreMap.get(s) || smartScoreMap.get(link.source?.label) || 0;
      const tScore = smartScoreMap.get(t) || smartScoreMap.get(link.target?.label) || 0;
      if (sScore > 0 && tScore > 0) {
        if (circularPairs.has(key)) return 'rgba(251, 191, 36, 0.4)';
        return 'rgba(96, 165, 250, 0.25)';
      }
      return 'rgba(30, 34, 53, 0.05)';
    }

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
  }, [highlightLinks, circularPairs, filteredData.nodes, smartScoreMap, selectedNode, pathEdgeSet]);

  const getLinkWidth = useCallback((link) => {
    if (pathEdgeSet) {
      const s = typeof link.source === 'object' ? link.source.id : link.source;
      const t = typeof link.target === 'object' ? link.target.id : link.target;
      if (pathEdgeSet.has(`${s}→${t}`)) return 3;
      return 0.3;
    }
    return highlightLinks.has(link) ? 1.5 : 0.5;
  }, [highlightLinks, pathEdgeSet]);

  const getLinkParticleWidth = useCallback((link) => {
    if (pathEdgeSet) {
      const s = typeof link.source === 'object' ? link.source.id : link.source;
      const t = typeof link.target === 'object' ? link.target.id : link.target;
      if (pathEdgeSet.has(`${s}→${t}`)) return 4;
    }
    return 2;
  }, [pathEdgeSet]);

  const getLinkParticleSpeed = useCallback((link) => {
    if (pathEdgeSet) {
      const s = typeof link.source === 'object' ? link.source.id : link.source;
      const t = typeof link.target === 'object' ? link.target.id : link.target;
      if (pathEdgeSet.has(`${s}→${t}`)) return 0.012;
    }
    return 0.004;
  }, [pathEdgeSet]);

  // ── Control handlers ──
  const handleZoomIn = useCallback(() => {
    try {
      const fg = fgRef.current;
      if (!fg) return;
      const cur = fg.zoom();
      if (typeof cur === 'number') fg.zoom(cur * 1.5, 300);
    } catch (_) {}
  }, []);

  const handleZoomOut = useCallback(() => {
    try {
      const fg = fgRef.current;
      if (!fg) return;
      const cur = fg.zoom();
      if (typeof cur === 'number') fg.zoom(cur / 1.5, 300);
    } catch (_) {}
  }, []);

  const handleFitView = useCallback(() => {
    try { fgRef.current?.zoomToFit(400, 60); } catch (_) {}
  }, []);

  const handleFullscreen = useCallback(() => {
    try {
      const el = document.querySelector('.graph-page-root');
      if (!el) return;
      if (document.fullscreenElement) document.exitFullscreen();
      else el.requestFullscreen();
    } catch (_) {}
  }, []);

  const handleTogglePhysics = useCallback(() => {
    const fg = fgRef.current;
    if (!fg) return;
    if (!physicsLocked) {
      filteredData.nodes.forEach(n => { n.fx = n.x; n.fy = n.y; });
    } else {
      filteredData.nodes.forEach(n => { n.fx = undefined; n.fy = undefined; });
      try { fg.d3ReheatSimulation(); } catch (_) {}
    }
    setPhysicsLocked(!physicsLocked);
  }, [physicsLocked, filteredData.nodes]);

  const handleScreenshot = useCallback(() => {
    try {
      const canvas = document.querySelector('.graph-page-root canvas');
      if (!canvas) return;
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `cni-graph-${Date.now()}.png`;
      a.click();
    } catch (_) {}
  }, []);

  // ── Not analyzed state ──
  if (!repoPath || !stats || notAnalyzed) {
    return <NotAnalyzed />;
  }

  // ── Error state ──
  if (error && !loading) {
    return (
      <div className="flex items-center justify-center" style={{ height: 'calc(100vh - 5.75rem)' }}>
        <div className="w-full max-w-lg px-6">
          <ErrorMessage message={error.message || error} hint={error.hint} onRetry={() => fetchGraph(repoPath)} />
        </div>
      </div>
    );
  }

  // ── Loading state ──
  if (loading && graphData.nodes.length === 0) {
    return <LoadingSkeleton variant="graph" message="Building dependency graph…" />;
  }

  return (
    <div className="graph-page-root" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 5.75rem)', overflow: 'hidden' }}>
      {/* ══════ Filter bar ══════ */}
      <div className="flex items-center gap-2.5 px-4" style={{ flexShrink: 0, height: 48, borderBottom: '1px solid var(--border-default)', background: 'var(--bg-surface)' }}>
        {[
          { label: 'Hide tests', value: hideTests, set: setHideTests },
          { label: 'Hide isolated', value: hideIsolated, set: setHideIsolated },
          { label: 'Hide __init__', value: hideInit, set: setHideInit },
        ].map(({ label, value, set }) => (
          <button key={label} onClick={() => set(!value)}
            className="text-xs font-medium transition-all duration-200"
            style={{
              padding: '6px 14px',
              borderRadius: 9999,
              background: value ? 'var(--accent-muted)' : 'transparent',
              border: `1px solid ${value ? 'var(--accent-border)' : 'var(--border-default)'}`,
              color: value ? 'var(--accent)' : 'var(--text-muted)',
            }}
            onMouseEnter={e => { if (!value) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
            onMouseLeave={e => { if (!value) e.currentTarget.style.background = 'transparent'; }}>
            {label}
          </button>
        ))}

        <div className="flex items-center gap-2 ml-1">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Min:</span>
          <input type="range" min="0" max="10" value={minConn} onChange={(e) => setMinConn(parseInt(e.target.value))}
            className="w-16 h-1 rounded-full appearance-none cursor-pointer" style={{ background: 'var(--border-default)' }} />
          <span className="text-xs font-bold w-4" style={{ color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>{minConn}</span>
        </div>

        <select value={colorMode} onChange={(e) => setColorMode(e.target.value)}
          className="text-xs font-medium" style={{ padding: '6px 14px', borderRadius: 9999, background: 'var(--bg-input)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <option value="folder">Color: Folder</option>
          <option value="importance">Color: Importance</option>
          <option value="default">Color: Default</option>
        </select>

        {/* ══════ Path Finder toggle ══════ */}
        <button
          onClick={togglePathMode}
          title={pathMode ? 'Exit Path Finder' : 'Find Dependency Path'}
          className="text-xs font-medium transition-all duration-200 flex items-center gap-1.5"
          style={{
            padding: '6px 14px',
            borderRadius: 9999,
            background: pathMode ? 'var(--accent-muted)' : 'transparent',
            border: `1px solid ${pathMode ? 'var(--accent-border)' : 'var(--border-default)'}`,
            color: pathMode ? 'var(--accent)' : 'var(--text-muted)',
          }}
          onMouseEnter={e => { if (!pathMode) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
          onMouseLeave={e => { if (!pathMode) e.currentTarget.style.background = 'transparent'; }}
        >
          <Route size={13} />
          Path Finder
        </button>

        {/* Path mode status indicator */}
        {pathMode && !pathResult && !pathLoading && (
          <span className="text-xs px-2 py-1 rounded-lg animate-pulse" style={{
            color: pathStep === 'source' ? '#22c55e' : '#ef4444',
            background: pathStep === 'source' ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.08)',
            border: `1px solid ${pathStep === 'source' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
          }}>
            {pathStep === 'source' ? '① Click SOURCE node' : '② Click TARGET node'}
          </span>
        )}

        {/* ══════ Search area with mode toggle ══════ */}
        <div className="relative ml-auto flex items-center gap-1.5">
          {/* Mode toggle button */}
          <button
            onClick={toggleSearchMode}
            title={searchMode === 'file' ? 'Switch to Smart Search' : 'Switch to File Search'}
            className="flex items-center justify-center transition-all duration-200"
            style={{
              width: 30, height: 30, borderRadius: 9999,
              background: searchMode === 'smart' ? 'var(--accent-muted)' : 'transparent',
              border: `1px solid ${searchMode === 'smart' ? 'var(--accent-border)' : 'var(--border-default)'}`,
              color: searchMode === 'smart' ? 'var(--accent)' : 'var(--text-muted)',
            }}
          >
            {searchMode === 'smart' ? <Sparkles size={14} /> : <Search size={14} />}
          </button>

          {/* Search input */}
          <div className="relative">
            <input
              type="text"
              placeholder={searchMode === 'file' ? 'Search files...' : "Ask anything... e.g. 'caching logic'"}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="text-sm transition-all duration-200"
              style={{
                width: 260,
                padding: '8px 32px 8px 12px',
                borderRadius: 8,
                background: 'var(--bg-input)',
                border: `1px solid ${searchMode === 'smart' ? 'var(--accent-border)' : 'var(--border-default)'}`,
                color: 'var(--text-primary)',
                outline: 'none',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-muted)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = searchMode === 'smart' ? 'var(--accent-border)' : 'var(--border-default)'; e.currentTarget.style.boxShadow = 'none'; }}
            />
            {/* Right icon in input */}
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              {smartSearchLoading ? (
                <div className="w-3.5 h-3.5 border-2 rounded-full animate-spin"
                  style={{ borderColor: 'var(--cni-border)', borderTopColor: '#a855f7' }} />
              ) : searchQuery && searchMode === 'smart' ? (
                <button onClick={handleSmartSearch} className="transition-colors" style={{ color: '#a855f7' }}>
                  <Search size={13} />
                </button>
              ) : searchQuery ? (
                <button onClick={() => { setSearchQuery(''); setSearchResults([]); clearSmartSearch(); }}
                  style={{ color: 'var(--cni-muted)' }}>
                  <X size={13} />
                </button>
              ) : null}
            </div>

            {/* File search autocomplete dropdown */}
            {searchMode === 'file' && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 overflow-hidden z-50 max-h-48 overflow-y-auto"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
                {searchResults.map(n => (
                  <button key={n.id} onClick={() => handleSearchSelect(n)}
                    className="w-full px-3 py-2 text-left text-xs flex items-center justify-between transition-colors"
                    style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <span>{n.label}</span>
                    <span style={{ color: 'var(--text-muted)' }}>in:{n.indegree}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Smart search results panel */}
            {searchMode === 'smart' && smartSearchResults && smartSearchResults.length > 0 && (
              <div className="absolute top-full left-0 mt-1 overflow-hidden z-50 animate-fade-in"
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 8,
                  minWidth: 300,
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                }}>
                <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border-default)' }}>
                  <Sparkles size={12} style={{ color: 'var(--accent)' }} />
                  <span className="text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>
                    {smartSearchResults.length} results for "{smartSearchQuery}"
                  </span>
                </div>
                <div className="max-h-56 overflow-y-auto">
                  {smartSearchResults.map((r, i) => (
                    <button
                      key={r.path || i}
                      onClick={() => handleSmartResultClick(r)}
                      className="w-full px-3 py-2 text-left flex items-center justify-between transition-colors"
                      style={{ color: 'var(--text-primary)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <span className="text-xs truncate mr-3" style={{ fontFamily: 'var(--font-mono)' }}>{r.file}</span>
                      <span className="text-[10px] font-bold flex-shrink-0 px-1.5 py-0.5 rounded"
                        style={{
                          fontVariantNumeric: 'tabular-nums',
                          color: r.score > 0.8 ? 'var(--accent)' : r.score > 0.5 ? '#3b82f6' : 'var(--text-muted)',
                          background: r.score > 0.8 ? 'var(--accent-muted)' : r.score > 0.5 ? 'var(--info-muted)' : 'rgba(255,255,255,0.04)',
                        }}>
                        {Math.round(r.score * 100)}%
                      </span>
                    </button>
                  ))}
                </div>
                <div className="px-3 py-2" style={{ borderTop: '1px solid var(--border-default)' }}>
                  <button onClick={clearSmartSearch}
                    className="text-[11px] transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
                    Clear Search
                  </button>
                </div>
              </div>
            )}

            {/* Smart search — no results */}
            {searchMode === 'smart' && smartSearchResults && smartSearchResults.length === 0 && !smartSearchLoading && (
              <div className="absolute top-full left-0 mt-1 z-50 px-3 py-3 animate-fade-in"
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 8,
                  minWidth: 220,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                }}>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No results found</p>
              </div>
            )}
          </div>
        </div>

        <span className="text-xs ml-3 flex-shrink-0" style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
          {filteredData.nodes.length} nodes · {filteredData.links.length} edges
        </span>

        <button
          onClick={() => exportGraphData(filteredData.nodes, filteredData.links, repoPath)}
          title="Export graph data as JSON"
          className="text-xs font-medium transition-all duration-200 flex items-center gap-1.5 flex-shrink-0"
          style={{
            padding: '6px 14px', borderRadius: 9999,
            background: 'transparent',
            border: '1px solid var(--border-default)',
            color: 'var(--text-muted)',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
        >
          <Download size={13} /> Export
        </button>
      </div>

      {/* ══════ Path Result Panel ══════ */}
      {pathMode && (pathResult !== null || pathLoading) && (
        <div className="flex items-center gap-3 px-4 animate-fade-in" style={{
          flexShrink: 0, padding: '12px 16px', borderBottom: '1px solid var(--border-default)',
          background: 'var(--bg-card)', borderRadius: 0,
        }}>
          {pathLoading ? (
            <div className="flex items-center gap-2">
              <div className="w-3.5 h-3.5 border-2 rounded-full animate-spin"
                style={{ borderColor: 'var(--cni-border)', borderTopColor: '#facc15' }} />
              <span className="text-xs" style={{ color: 'var(--cni-muted)' }}>Finding path…</span>
            </div>
          ) : pathResult?.found ? (
            <>
              <Route size={14} style={{ color: '#facc15', flexShrink: 0 }} />
              <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto">
                {pathResult.path.map((file, i) => (
                  <span key={i} className="flex items-center gap-1 flex-shrink-0">
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded"
                      style={{
                        color: i === 0 ? '#22c55e' : i === pathResult.path.length - 1 ? '#ef4444' : '#facc15',
                        background: i === 0 ? 'rgba(34, 197, 94, 0.1)' : i === pathResult.path.length - 1 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(250, 204, 21, 0.08)',
                        border: `1px solid ${i === 0 ? 'rgba(34, 197, 94, 0.2)' : i === pathResult.path.length - 1 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(250, 204, 21, 0.15)'}`,
                      }}>
                      {file}
                    </span>
                    {i < pathResult.path.length - 1 && <ArrowRight size={12} style={{ color: 'var(--cni-muted)', flexShrink: 0 }} />}
                  </span>
                ))}
              </div>
              <span className="text-xs flex-shrink-0 px-2 py-0.5 rounded-lg font-medium" style={{
                color: '#facc15', background: 'rgba(250, 204, 21, 0.1)',
                border: '1px solid rgba(250, 204, 21, 0.15)',
              }}>{pathResult.length} hop{pathResult.length !== 1 ? 's' : ''}</span>
              <button onClick={handleSwapPath} title="Swap source ↔ target"
                className="p-1 rounded-lg transition-all duration-200"
                style={{ color: 'var(--cni-muted)', border: '1px solid var(--cni-border)' }}
                onMouseEnter={e => { e.currentTarget.style.color = '#facc15'; e.currentTarget.style.borderColor = 'rgba(250, 204, 21, 0.3)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--cni-muted)'; e.currentTarget.style.borderColor = 'var(--cni-border)'; }}>
                <RefreshCw size={13} />
              </button>
              <button onClick={clearPath}
                className="text-xs px-2 py-1 rounded-lg transition-colors"
                style={{ color: 'var(--cni-muted)', border: '1px solid var(--cni-border)' }}
                onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--cni-muted)'}>
                Clear
              </button>
            </>
          ) : (
            <>
              <Route size={14} style={{ color: 'var(--cni-muted)', flexShrink: 0 }} />
              <span className="text-xs" style={{ color: 'var(--cni-muted)' }}>
                No path found between {pathSource?.label} and {pathTarget?.label}
              </span>
              <button onClick={clearPath}
                className="text-xs px-2 py-1 rounded-lg transition-colors ml-auto"
                style={{ color: 'var(--cni-muted)', border: '1px solid var(--cni-border)' }}
                onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--cni-muted)'}>
                Clear
              </button>
            </>
          )}
        </div>
      )}

      {/* ══════ Graph + Panel + Chat row ══════ */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>
        {/* Graph area */}
        <div style={{ position: 'relative', flex: 1, minWidth: 0, height: graphH, background: 'var(--bg-root)', transition: 'width 300ms ease' }}>
          {loading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, background: 'rgba(9,9,11,0.85)' }}>
              <div className="text-center space-y-3">
                <div className="w-8 h-8 mx-auto border-2 rounded-full animate-spin" style={{ borderColor: 'var(--cni-border)', borderTopColor: 'var(--cni-accent)' }} />
                <p className="text-sm" style={{ color: 'var(--cni-muted)' }}>Building graph…</p>
              </div>
            </div>
          )}

          {error && (
            <div className="px-4 py-3 rounded-xl text-sm" style={{ position: 'absolute', top: 16, left: 16, right: 16, zIndex: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
              {error}
            </div>
          )}

          {!ForceGraph2D && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
              <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--cni-border)', borderTopColor: 'var(--cni-accent)' }} />
            </div>
          )}

          {ForceGraph2D && filteredData.nodes.length > 0 && (
            <ForceGraph2D
              ref={fgRef}
              graphData={filteredData}
              width={graphW}
              height={graphH}
              backgroundColor="#09090b"
              nodeCanvasObject={paintNode}
              nodePointerAreaPaint={(node, color, ctx) => {
                const r = Math.max(3, Math.min(14, 2 + (node.indegree || 0) * 0.9)) + 5;
                ctx.beginPath(); ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
                ctx.fillStyle = color; ctx.fill();
              }}
              linkColor={getLinkColor}
              linkWidth={getLinkWidth}
              linkCurvature={0.15}
              linkDirectionalParticles={2}
              linkDirectionalParticleWidth={getLinkParticleWidth}
              linkDirectionalParticleColor={() => pathEdgeSet ? '#facc15' : '#22d3ee'}
              linkDirectionalParticleSpeed={getLinkParticleSpeed}
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

          {/* Smart search results floating badge */}
          {smartSearchResults && smartSearchResults.length > 0 && !selectedNode && (
            <div className="animate-fade-in"
              style={{
                position: 'absolute', top: 12, left: 12, zIndex: 20,
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'rgba(12, 18, 32, 0.9)', backdropFilter: 'blur(8px)',
                border: '1px solid rgba(168, 85, 247, 0.2)', borderRadius: 10,
                padding: '6px 12px',
              }}>
              <Sparkles size={13} style={{ color: '#a855f7' }} />
              <span className="text-[11px] font-medium" style={{ color: 'var(--cni-text)' }}>
                {smartSearchResults.length} files match "{smartSearchQuery}"
              </span>
              <button onClick={clearSmartSearch} className="ml-1 transition-colors"
                style={{ color: 'var(--cni-muted)' }}
                onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--cni-muted)'}>
                <X size={12} />
              </button>
            </div>
          )}

          {/* Hover tooltip */}
          {hoverNode && (
            <div style={{ position: 'absolute', left: 16, bottom: 16, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', backdropFilter: 'blur(8px)', borderRadius: 10, padding: '10px 14px', zIndex: 20, pointerEvents: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}
              className="animate-fade-in">
              <p className="font-semibold text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{hoverNode.label}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--cni-muted)' }}>📁 {getFolderFromId(hoverNode.id)}</p>
              <p className="text-xs" style={{ color: 'var(--cni-muted)' }}>
                in: <span style={{ color: '#60a5fa' }}>{hoverNode.indegree}</span>{' · '}out: <span style={{ color: '#22d3ee' }}>{hoverNode.outdegree}</span>
              </p>
              {/* Show smart search score if available */}
              {smartScoreMap && (smartScoreMap.get(hoverNode.id) || smartScoreMap.get(hoverNode.label)) && (
                <p className="text-xs mt-0.5" style={{ color: '#a855f7' }}>
                  relevance: {Math.round((smartScoreMap.get(hoverNode.id) || smartScoreMap.get(hoverNode.label)) * 100)}%
                </p>
              )}
            </div>
          )}

          {/* Color legend */}
          <div style={{ position: 'absolute', bottom: 56, left: 12, zIndex: 10 }}>
            <button onClick={() => setShowLegend(!showLegend)} className="px-2 py-1 rounded-lg text-xs"
              style={{ background: 'rgba(12,18,32,0.85)', border: '1px solid var(--cni-border)', color: 'var(--cni-muted)' }}>
              {showLegend ? '▼ Legend' : '▶ Legend'}
            </button>
            {showLegend && (
              <div className="mt-1 p-3 rounded-xl animate-fade-in max-h-48 overflow-y-auto"
                style={{ background: 'rgba(12,18,32,0.92)', border: '1px solid var(--cni-border)', minWidth: 140 }}>
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

          {/* ══ Floating Controls ══ */}
          <div style={{
            position: 'absolute', bottom: 20, right: 20, zIndex: 50,
            display: 'flex', flexDirection: 'column', gap: 4,
            background: 'var(--bg-card)', backdropFilter: 'blur(12px)',
            border: '1px solid var(--border-default)', borderRadius: 12,
            padding: 6, boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          }}>
            {[
              { icon: <ZoomIn size={18} />, label: 'Zoom In', onClick: handleZoomIn },
              { icon: <ZoomOut size={18} />, label: 'Zoom Out', onClick: handleZoomOut },
              { icon: <Maximize size={18} />, label: 'Fit to View', onClick: handleFitView },
              { icon: isFullscreen ? <Shrink size={18} /> : <Expand size={18} />, label: isFullscreen ? 'Exit Fullscreen' : 'Fullscreen', onClick: handleFullscreen },
              { icon: physicsLocked ? <Lock size={18} /> : <Unlock size={18} />, label: physicsLocked ? 'Unlock Physics' : 'Lock Physics', onClick: handleTogglePhysics, active: physicsLocked },
              { icon: <Camera size={18} />, label: 'Screenshot', onClick: handleScreenshot },
            ].map(({ icon, label, onClick, active }) => (
              <button key={label} onClick={onClick} tabIndex={0} aria-label={label}
                className="relative group"
                style={{
                  width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: active ? 'rgba(255,150,50,0.15)' : 'transparent',
                  color: active ? '#f59e0b' : 'rgba(255,255,255,0.6)',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'rgba(255,255,255,0.9)'; } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; } }}>
                {icon}
                <span className="absolute right-full mr-2 px-2 py-1 rounded-lg text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200"
                  style={{ background: 'rgba(12,18,32,0.95)', border: '1px solid var(--cni-border)', color: '#e2e8f0', transitionDelay: '200ms' }}>
                  {label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ══════ Side Panel ══════ */}
        {panelOpen && (
          <div style={{ width: PANEL_W, flexShrink: 0, background: 'var(--bg-card)', borderLeft: '1px solid var(--border-default)', overflowY: 'auto' }}
            className="animate-slide-in-right">
            <div style={{ padding: 20 }}>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-semibold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{selectedNode.label}</h3>
                <button onClick={handleBgClick} className="p-1 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}>
                  <X size={16} />
                </button>
              </div>
              <div className="space-y-4">
                <p className="text-[10px] truncate" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{selectedNode.id}</p>
                <div className="flex gap-2">
                  <div style={{ background: 'var(--bg-surface)', padding: '8px 12px', borderRadius: 8, flex: 1, textAlign: 'center' }}>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>IN</p>
                    <p className="text-lg font-bold" style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', color: '#3b82f6' }}>{selectedNode.indegree}</p>
                  </div>
                  <div style={{ background: 'var(--bg-surface)', padding: '8px 12px', borderRadius: 8, flex: 1, textAlign: 'center' }}>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>OUT</p>
                    <p className="text-lg font-bold" style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', color: 'var(--accent)' }}>{selectedNode.outdegree}</p>
                  </div>
                  <div style={{ background: 'var(--bg-surface)', padding: '8px 12px', borderRadius: 8, flex: 1, textAlign: 'center' }}>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>TOTAL</p>
                    <p className="text-lg font-bold" style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{(selectedNode.indegree || 0) + (selectedNode.outdegree || 0)}</p>
                  </div>
                </div>
                {/* Show relevance score if from smart search */}
                {smartScoreMap && (smartScoreMap.get(selectedNode.id) || smartScoreMap.get(selectedNode.label)) && (
                  <div className="glass-card p-3 text-center" style={{ borderColor: 'rgba(168, 85, 247, 0.2)' }}>
                    <p className="text-xs mb-0.5" style={{ color: 'var(--cni-muted)' }}>Relevance</p>
                    <p className="text-xl font-bold" style={{ color: '#a855f7' }}>
                      {Math.round((smartScoreMap.get(selectedNode.id) || smartScoreMap.get(selectedNode.label)) * 100)}%
                    </p>
                  </div>
                )}
                {detailsLoading ? (
                  <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--cni-muted)' }}>
                    <div className="w-3 h-3 border rounded-full animate-spin" style={{ borderColor: 'var(--cni-border)', borderTopColor: 'var(--cni-accent)' }} />
                    Loading…
                  </div>
                ) : nodeDetails ? (
                  <>
                    <div>
                      <p className="text-label mb-2">IMPORTED BY ({nodeDetails.imported_by?.length || 0})</p>
                      <div className="space-y-0.5 max-h-32 overflow-y-auto">
                        {nodeDetails.imported_by?.map((dep) => (
                          <button key={dep} onClick={() => handleDetailNodeClick(dep)}
                            className="w-full text-left px-2 py-1.5 rounded-lg text-xs transition-colors"
                            style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            {dep}
                          </button>
                        ))}
                        {(!nodeDetails.imported_by || nodeDetails.imported_by.length === 0) && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>(none)</span>}
                      </div>
                    </div>
                    <div>
                      <p className="text-label mb-2">IMPORTS ({nodeDetails.imports?.length || 0})</p>
                      <div className="space-y-0.5 max-h-32 overflow-y-auto">
                        {nodeDetails.imports?.map((imp) => (
                          <button key={imp} onClick={() => handleDetailNodeClick(imp)}
                            className="w-full text-left px-2 py-1.5 rounded-lg text-xs transition-colors"
                            style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            {imp}
                          </button>
                        ))}
                        {(!nodeDetails.imports || nodeDetails.imports.length === 0) && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>(none)</span>}
                      </div>
                    </div>
                  </>
                ) : null}
                <div className="flex gap-2 pt-3">
                  <a href={`/impact?file=${encodeURIComponent(selectedNode.label)}`}
                    className="text-xs font-medium flex-1 text-center py-2.5 rounded-lg transition-all duration-200"
                    style={{ background: 'var(--accent-muted)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--accent-muted)'; e.currentTarget.style.color = 'var(--accent)'; }}>
                    ⚡ Impact
                  </a>
                  <a href={`/health`}
                    className="text-xs font-medium flex-1 text-center py-2.5 rounded-lg transition-all duration-200"
                    style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}>
                    Explain
                  </a>
                </div>

                {/* Bookmark toggle */}
                <div className="pt-3" style={{ borderTop: '1px solid var(--border-default)' }}>
                  {isBookmarked(selectedNode.label) ? (
                    <div className="space-y-2">
                      <button
                        onClick={() => removeBookmark(selectedNode.label)}
                        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs transition-all duration-200"
                        style={{
                          background: 'rgba(255, 215, 0, 0.08)',
                          border: '1px solid rgba(255, 215, 0, 0.2)',
                          color: '#FFD700',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)'; e.currentTarget.style.color = '#f87171'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255, 215, 0, 0.2)'; e.currentTarget.style.color = '#FFD700'; }}
                      >
                        <Star size={13} fill="#FFD700" /> Bookmarked — click to remove
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="Add a note..."
                        value={bookmarkNote}
                        onChange={(e) => setBookmarkNote(e.target.value)}
                        className="input-field w-full text-xs"
                      />
                      <button
                        onClick={() => {
                          addBookmark(selectedNode.label, bookmarkNote);
                          setBookmarkNote('');
                        }}
                        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs transition-all duration-200"
                        style={{
                          background: 'transparent',
                          border: '1px solid var(--cni-border)',
                          color: 'var(--cni-muted)',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255, 215, 0, 0.3)'; e.currentTarget.style.color = '#FFD700'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--cni-border)'; e.currentTarget.style.color = 'var(--cni-muted)'; }}
                      >
                        <Star size={13} /> Bookmark this file
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════ Chat Sidebar ══════ */}
        <GraphChat isOpen={chatOpen} onToggle={() => setChatOpen(!chatOpen)} />
      </div>
    </div>
  );
}
