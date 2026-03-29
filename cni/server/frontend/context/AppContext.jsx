'use client';

import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import {
  analyzeRepo as apiAnalyze,
  getGraph,
  getHealth,
  getOnboard,
  getImpact,
  createAskSocket,
  createOnboardChatSocket,
  getChatHistory,
  getChatSessions,
  createNewSession,
  deleteSession,
  getBookmarks as apiGetBookmarks,
  addBookmark as apiAddBookmark,
  removeBookmark as apiRemoveBookmark,
  getChecklist as apiGetChecklist,
  getChecklistProgress as apiGetChecklistProgress,
  toggleChecklistItem as apiToggleChecklistItem,
} from '../lib/api';

// ─── Context ─────────────────────────────────────────────────────────
const AppContext = createContext(null);
export function useAppContext() { return useContext(AppContext); }

// ─── Provider ────────────────────────────────────────────────────────
export default function AppContextProvider({ children }) {

  // ══════════════════════════════════════════════════════════════════
  //  Core analysis state
  // ══════════════════════════════════════════════════════════════════
  const [repoPath, setRepoPath] = useState('');
  const [stats, setStats] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);
  const [recovering, setRecovering] = useState(false);
  const [recentRepos, setRecentRepos] = useState([]);

  // ── localStorage: restore on mount ──
  useEffect(() => {
    try {
      const saved = localStorage.getItem('cni_state');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.repoPath) setRepoPath(parsed.repoPath);
        if (parsed.stats) setStats(parsed.stats);
      }
    } catch { /* private browsing or quota exceeded */ }

    // Restore chat messages
    try {
      const savedChat = localStorage.getItem('cni_chat_messages');
      if (savedChat) setChatMessages(JSON.parse(savedChat));
    } catch { /* ignore */ }

    try {
      const savedOnboardChat = localStorage.getItem('cni_onboard_chat_messages');
      if (savedOnboardChat) setOnboardChatMessages(JSON.parse(savedOnboardChat));
    } catch { /* ignore */ }

    // Restore recent repos
    try {
      const savedRecent = localStorage.getItem('cni_recent_repos');
      if (savedRecent) setRecentRepos(JSON.parse(savedRecent));
    } catch { /* ignore */ }
  }, []);

  // ── localStorage: persist when repoPath or stats change ──
  useEffect(() => {
    if (repoPath && stats) {
      try {
        localStorage.setItem('cni_state', JSON.stringify({ repoPath, stats }));
      } catch { /* ignore */ }
    }
  }, [repoPath, stats]);

  // ── localStorage: persist recent repos ──
  useEffect(() => {
    try {
      localStorage.setItem('cni_recent_repos', JSON.stringify(recentRepos));
    } catch { /* ignore */ }
  }, [recentRepos]);

  const addRecentRepo = useCallback((path, filesCount) => {
    setRecentRepos(prev => {
      const name = path.replace(/\\/g, '/').split('/').filter(Boolean).pop() || path;
      const now = new Date().toISOString();
      const filtered = prev.filter(r => r.path !== path);
      const entry = { path, name, filesCount, lastAnalyzed: now };
      return [entry, ...filtered].slice(0, 10);
    });
  }, []);

  const removeRecentRepo = useCallback((path) => {
    setRecentRepos(prev => prev.filter(r => r.path !== path));
  }, []);

  // ══════════════════════════════════════════════════════════════════
  //  Graph
  // ══════════════════════════════════════════════════════════════════
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState(null);
  const [graphNotAnalyzed, setGraphNotAnalyzed] = useState(false);

  // ══════════════════════════════════════════════════════════════════
  //  Health
  // ══════════════════════════════════════════════════════════════════
  const [healthData, setHealthData] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState(null);

  // ══════════════════════════════════════════════════════════════════
  //  Onboard report
  // ══════════════════════════════════════════════════════════════════
  const [onboardData, setOnboardData] = useState(null);
  const [onboardLoading, setOnboardLoading] = useState(false);
  const [onboardError, setOnboardError] = useState(null);

  // ══════════════════════════════════════════════════════════════════
  //  Impact
  // ══════════════════════════════════════════════════════════════════
  const [impactData, setImpactData] = useState(null);
  const [impactFile, setImpactFile] = useState('');
  const [impactLoading, setImpactLoading] = useState(false);
  const [impactError, setImpactError] = useState(null);

  // ══════════════════════════════════════════════════════════════════
  //  Chat (ask) — persistent across navigation
  // ══════════════════════════════════════════════════════════════════
  const [chatMessages, setChatMessages] = useState([]);
  const [chatStreaming, setChatStreaming] = useState(false);
  const [chatError, setChatError] = useState(null);
  const [chatOllamaDown, setChatOllamaDown] = useState(false);
  const [chatSessionId, setChatSessionId] = useState('');
  const [chatSessions, setChatSessions] = useState([]);
  const [chatSessionsOpen, setChatSessionsOpen] = useState(false);
  const chatWsRef = useRef(null);

  // ══════════════════════════════════════════════════════════════════
  //  Onboard chat — persistent across navigation
  // ══════════════════════════════════════════════════════════════════
  const [onboardChatMessages, setOnboardChatMessages] = useState([]);
  const [onboardChatStreaming, setOnboardChatStreaming] = useState(false);
  const [onboardChatError, setOnboardChatError] = useState(null);
  const [onboardOllamaDown, setOnboardOllamaDown] = useState(false);
  const [onboardSessionId, setOnboardSessionId] = useState('');
  const [onboardSessions, setOnboardSessions] = useState([]);
  const [onboardSessionsOpen, setOnboardSessionsOpen] = useState(false);
  const onboardWsRef = useRef(null);

  // ══════════════════════════════════════════════════════════════════
  //  Graph Chat — selected file context
  // ══════════════════════════════════════════════════════════════════
  const [selectedChatFile, setSelectedChatFile] = useState(null);

  // ══════════════════════════════════════════════════════════════════
  //  Bookmarks
  // ══════════════════════════════════════════════════════════════════
  const [bookmarks, setBookmarks] = useState([]);

  // ══════════════════════════════════════════════════════════════════
  //  Checklist
  // ══════════════════════════════════════════════════════════════════
  const [checklist, setChecklist] = useState([]);
  const [checklistProgress, setChecklistProgress] = useState({});

  // ── localStorage: persist chat messages (with 4MB size safety) ──
  useEffect(() => {
    try {
      const toSave = JSON.stringify(chatMessages);
      if (toSave.length > 4_000_000) {
        localStorage.setItem('cni_chat_messages', JSON.stringify(chatMessages.slice(-50)));
      } else {
        localStorage.setItem('cni_chat_messages', toSave);
      }
    } catch { /* ignore */ }
  }, [chatMessages]);

  // ── localStorage: persist onboard chat messages (with 4MB size safety) ──
  useEffect(() => {
    try {
      const toSave = JSON.stringify(onboardChatMessages);
      if (toSave.length > 4_000_000) {
        localStorage.setItem('cni_onboard_chat_messages', JSON.stringify(onboardChatMessages.slice(-50)));
      } else {
        localStorage.setItem('cni_onboard_chat_messages', toSave);
      }
    } catch { /* ignore */ }
  }, [onboardChatMessages]);

  // Track which repo data was fetched for, so we refetch on repo change
  const prevRepoRef = useRef('');
  // Ref used by auto-recovery to avoid infinite loops
  const recoveringRef = useRef(false);

  // ══════════════════════════════════════════════════════════════════
  //  analyzeRepo — clears all cached data when repo changes
  // ══════════════════════════════════════════════════════════════════
  const analyze = useCallback(async (path, { silent = false } = {}) => {
    if (!silent) setAnalysisLoading(true);
    setAnalysisError(null);

    try {
      const data = await apiAnalyze(path);
      const pathChanged = path !== prevRepoRef.current;
      prevRepoRef.current = path;

      setStats(data);
      setRepoPath(path);

      if (pathChanged) {
        // Invalidate all cached page data
        setGraphData({ nodes: [], links: [] });
        setGraphError(null);
        setGraphNotAnalyzed(false);
        setHealthData(null);
        setHealthError(null);
        setOnboardData(null);
        setOnboardError(null);
        setImpactData(null);
        setImpactError(null);
        setImpactFile('');
        setChatMessages([]);
        setChatError(null);
        setChatOllamaDown(false);
        setChatSessionId('');
        setChatSessions([]);
        setOnboardChatMessages([]);
        setOnboardChatError(null);
        setOnboardOllamaDown(false);
        setOnboardSessionId('');
        setOnboardSessions([]);
        // Clear chat localStorage for the old repo
        try { localStorage.removeItem('cni_chat_messages'); } catch { /* ignore */ }
        try { localStorage.removeItem('cni_onboard_chat_messages'); } catch { /* ignore */ }
      }

      // Fetch health in background for StatsBar
      getHealth(path)
        .then((h) => { if (!h?.error) setHealthData(h); })
        .catch(() => {});

      // Track in recent repos
      addRecentRepo(path, data.files || 0);

      // Fetch bookmarks in background
      apiGetBookmarks(path)
        .then((res) => { if (!res?.error && res?.bookmarks) setBookmarks(res.bookmarks); })
        .catch(() => {});

      return true; // success
    } catch (err) {
      if (!silent) {
        setAnalysisError({
          message: err?.message || 'Analysis failed',
          hint: err?.hint || '',
        });
      }
      return false; // failed
    } finally {
      if (!silent) setAnalysisLoading(false);
    }
  }, []);

  /**
   * Auto-recovery helper: when a fetch returns 400 (server lost cache),
   * silently re-analyze the repo and retry the fetch once.
   */
  const autoRecover = useCallback(async (fetchFn) => {
    if (recoveringRef.current || !repoPath) return null;
    recoveringRef.current = true;
    setRecovering(true);
    try {
      const ok = await analyze(repoPath, { silent: true });
      if (ok) {
        return await fetchFn();
      }
    } catch { /* ignore */ }
    finally {
      recoveringRef.current = false;
      setRecovering(false);
    }
    return null;
  }, [repoPath, analyze]);

  // ══════════════════════════════════════════════════════════════════
  //  fetchGraph — cached, with auto-recovery
  // ══════════════════════════════════════════════════════════════════
  const _processGraphData = useCallback((data) => {
    const nodes = data.nodes.map((n) => ({
      id: n.id, label: n.label, indegree: n.indegree,
      outdegree: n.outdegree, color: n.color,
      val: Math.max(2, 2 + n.indegree * 1.5),
    }));
    const links = data.edges.map((e) => ({
      source: e.source, target: e.target, label: e.label,
    }));
    setGraphData({ nodes, links });
  }, []);

  const fetchGraph = useCallback(async (path) => {
    if (graphData.nodes.length > 0) return;
    setGraphLoading(true);
    setGraphError(null);
    setGraphNotAnalyzed(false);
    try {
      let data = await getGraph(path);

      // Auto-recovery: server lost cache after restart
      if (data?.error && (data.status === 400 || data.notAnalyzed) && repoPath) {
        const retry = await autoRecover(() => getGraph(path));
        if (retry && !retry.error) { data = retry; }
        else { setGraphNotAnalyzed(true); setGraphLoading(false); return; }
      }

      if (data?.error) {
        if (data.notAnalyzed) setGraphNotAnalyzed(true);
        else setGraphError({ message: data.message, hint: data.hint });
        return;
      }
      _processGraphData(data);
    } catch (err) {
      setGraphError({ message: err?.message || 'Failed to load graph', hint: err?.hint || '' });
    } finally {
      setGraphLoading(false);
    }
  }, [graphData.nodes.length, repoPath, autoRecover, _processGraphData]);

  // ══════════════════════════════════════════════════════════════════
  //  fetchHealth — cached, with auto-recovery
  // ══════════════════════════════════════════════════════════════════
  const fetchHealth = useCallback(async (path) => {
    if (healthData) return;
    setHealthLoading(true);
    setHealthError(null);
    try {
      let result = await getHealth(path);

      if (result?.error && (result.status === 400 || result.notAnalyzed) && repoPath) {
        const retry = await autoRecover(() => getHealth(path));
        if (retry && !retry.error) { result = retry; }
        else { setHealthError({ message: result.message, hint: result.hint }); setHealthLoading(false); return; }
      }

      if (result?.error) {
        setHealthError({ message: result.message, hint: result.hint });
      } else {
        setHealthData(result);
      }
    } catch (err) {
      setHealthError({ message: err?.message || 'Failed to load health data', hint: err?.hint || '' });
    } finally {
      setHealthLoading(false);
    }
  }, [healthData, repoPath, autoRecover]);

  // ══════════════════════════════════════════════════════════════════
  //  fetchOnboard — cached, with auto-recovery
  // ══════════════════════════════════════════════════════════════════
  const fetchOnboard = useCallback(async (path) => {
    if (onboardData) return;
    setOnboardLoading(true);
    setOnboardError(null);
    try {
      let result = await getOnboard(path);

      if (result?.error && (result.status === 400 || result.notAnalyzed) && repoPath) {
        const retry = await autoRecover(() => getOnboard(path));
        if (retry && !retry.error) { result = retry; }
        else { setOnboardError({ message: result.message, hint: result.hint }); setOnboardLoading(false); return; }
      }

      if (result?.error) {
        setOnboardError({ message: result.message, hint: result.hint });
      } else {
        setOnboardData(result);
      }
    } catch (err) {
      setOnboardError({ message: err?.message || 'Failed to generate report', hint: err?.hint || '' });
    } finally {
      setOnboardLoading(false);
    }
  }, [onboardData, repoPath, autoRecover]);

  // ══════════════════════════════════════════════════════════════════
  //  fetchImpact — cached per file, with auto-recovery
  // ══════════════════════════════════════════════════════════════════
  const fetchImpact = useCallback(async (file, path) => {
    if (impactData && impactFile === file) return;
    setImpactLoading(true);
    setImpactError(null);
    setImpactFile(file);
    try {
      let result = await getImpact(file, path);

      if (result?.error && (result.status === 400 || result.notAnalyzed) && repoPath) {
        const retry = await autoRecover(() => getImpact(file, path));
        if (retry && !retry.error) { result = retry; }
        else { setImpactError({ message: result.message, hint: result.hint }); setImpactData(null); setImpactLoading(false); return; }
      }

      if (result?.error) {
        setImpactError({ message: result.message, hint: result.hint });
        setImpactData(null);
      } else {
        setImpactData(result);
      }
    } catch (err) {
      setImpactError({ message: err?.message || 'Impact analysis failed', hint: err?.hint || '' });
      setImpactData(null);
    } finally {
      setImpactLoading(false);
    }
  }, [impactData, impactFile, repoPath, autoRecover]);

  // ══════════════════════════════════════════════════════════════════
  //  CHAT helpers — load history when repoPath set
  // ══════════════════════════════════════════════════════════════════
  const chatHistoryLoaded = useRef(false);

  useEffect(() => {
    if (!repoPath || chatHistoryLoaded.current) return;
    chatHistoryLoaded.current = true;
    let cancelled = false;
    (async () => {
      try {
        const [histRes, sessRes] = await Promise.all([
          getChatHistory(repoPath, 'chat'),
          getChatSessions(repoPath, 'chat'),
        ]);
        if (cancelled) return;
        if (!histRes?.error && histRes?.messages?.length) {
          setChatMessages(histRes.messages.map((m) => ({ role: m.role, content: m.content })));
          setChatSessionId(histRes.session_id || '');
        }
        if (!sessRes?.error && sessRes?.sessions) {
          setChatSessions(sessRes.sessions);
        }
      } catch { /* non-critical */ }
    })();
    return () => { cancelled = true; };
  }, [repoPath]);

  const refreshChatSessions = useCallback(async () => {
    if (!repoPath) return;
    try {
      const res = await getChatSessions(repoPath, 'chat');
      if (!res?.error && res?.sessions) setChatSessions(res.sessions);
    } catch { /* ignore */ }
  }, [repoPath]);

  const sendChatMessage = useCallback((question, path) => {
    setChatMessages((prev) => [...prev, { role: 'user', content: question }]);
    setChatMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
    setChatStreaming(true);
    setChatError(null);
    setChatOllamaDown(false);

    const ws = createAskSocket(
      question, path,
      (token) => {
        setChatMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === 'assistant') {
            updated[updated.length - 1] = { ...last, content: last.content + token };
          }
          return updated;
        });
      },
      (sid) => {
        setChatStreaming(false);
        if (sid) setChatSessionId(sid);
        refreshChatSessions();
      },
      (errObj) => {
        setChatStreaming(false);
        if (errObj.message.toLowerCase().includes('ollama') || errObj.message.toLowerCase().includes('cannot connect')) {
          setChatOllamaDown(true);
        }
        setChatError(errObj);
        setChatMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === 'assistant' && !last.content) return updated.slice(0, -1);
          return updated;
        });
      },
      chatSessionId,
    );
    chatWsRef.current = ws;
  }, [chatSessionId, refreshChatSessions]);

  const startNewChatSession = useCallback(async () => {
    if (chatWsRef.current) chatWsRef.current.close();
    if (!repoPath) return;
    try {
      const res = await createNewSession(repoPath, 'chat');
      if (res?.session_id) setChatSessionId(res.session_id);
    } catch { /* ignore */ }
    setChatMessages([]);
    setChatStreaming(false);
    setChatError(null);
    setChatOllamaDown(false);
    setChatSessionsOpen(false);
  }, [repoPath]);

  const loadChatSession = useCallback(async (sid) => {
    if (!repoPath || !sid) return;
    try {
      const res = await getChatHistory(repoPath, 'chat', sid);
      if (!res?.error && res?.messages) {
        setChatMessages(res.messages.map((m) => ({ role: m.role, content: m.content })));
        setChatSessionId(sid);
      }
    } catch { /* ignore */ }
    setChatSessionsOpen(false);
    setChatStreaming(false);
    setChatError(null);
    setChatOllamaDown(false);
  }, [repoPath]);

  const removeChatSession = useCallback(async (sid) => {
    if (!repoPath || !sid) return;
    try {
      await deleteSession(repoPath, 'chat', sid);
      if (sid === chatSessionId) { setChatMessages([]); setChatSessionId(''); }
      refreshChatSessions();
    } catch { /* ignore */ }
  }, [repoPath, chatSessionId, refreshChatSessions]);

  const clearChat = useCallback(() => {
    if (chatWsRef.current) chatWsRef.current.close();
    setChatMessages([]);
    setChatStreaming(false);
    setChatError(null);
    setChatOllamaDown(false);
    try { localStorage.removeItem('cni_chat_messages'); } catch { /* ignore */ }
  }, []);

  // ══════════════════════════════════════════════════════════════════
  //  ONBOARD CHAT helpers
  // ══════════════════════════════════════════════════════════════════
  const onboardHistoryLoaded = useRef(false);

  useEffect(() => {
    if (!repoPath || onboardHistoryLoaded.current) return;
    onboardHistoryLoaded.current = true;
    let cancelled = false;
    (async () => {
      try {
        const [histRes, sessRes] = await Promise.all([
          getChatHistory(repoPath, 'onboard'),
          getChatSessions(repoPath, 'onboard'),
        ]);
        if (cancelled) return;
        if (!histRes?.error && histRes?.messages?.length) {
          setOnboardChatMessages(histRes.messages.map((m) => ({ role: m.role, content: m.content })));
          setOnboardSessionId(histRes.session_id || '');
        }
        if (!sessRes?.error && sessRes?.sessions) {
          setOnboardSessions(sessRes.sessions);
        }
      } catch { /* non-critical */ }
    })();
    return () => { cancelled = true; };
  }, [repoPath]);

  const refreshOnboardSessions = useCallback(async () => {
    if (!repoPath) return;
    try {
      const res = await getChatSessions(repoPath, 'onboard');
      if (!res?.error && res?.sessions) setOnboardSessions(res.sessions);
    } catch { /* ignore */ }
  }, [repoPath]);

  const sendOnboardChat = useCallback((question, path) => {
    setOnboardChatMessages((prev) => [...prev, { role: 'user', content: question }]);
    setOnboardChatMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
    setOnboardChatStreaming(true);
    setOnboardChatError(null);
    setOnboardOllamaDown(false);

    const ws = createOnboardChatSocket(
      question, path,
      (token) => {
        setOnboardChatMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === 'assistant') {
            updated[updated.length - 1] = { ...last, content: last.content + token };
          }
          return updated;
        });
      },
      (sid) => {
        setOnboardChatStreaming(false);
        if (sid) setOnboardSessionId(sid);
        refreshOnboardSessions();
      },
      (errObj) => {
        setOnboardChatStreaming(false);
        if (errObj.message.toLowerCase().includes('ollama') || errObj.message.toLowerCase().includes('cannot connect')) {
          setOnboardOllamaDown(true);
        }
        setOnboardChatError(errObj);
        setOnboardChatMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === 'assistant' && !last.content) return updated.slice(0, -1);
          return updated;
        });
      },
      onboardSessionId,
    );
    onboardWsRef.current = ws;
  }, [onboardSessionId, refreshOnboardSessions]);

  const startNewOnboardSession = useCallback(async () => {
    if (onboardWsRef.current) onboardWsRef.current.close();
    if (!repoPath) return;
    try {
      const res = await createNewSession(repoPath, 'onboard');
      if (res?.session_id) setOnboardSessionId(res.session_id);
    } catch { /* ignore */ }
    setOnboardChatMessages([]);
    setOnboardChatStreaming(false);
    setOnboardChatError(null);
    setOnboardOllamaDown(false);
    setOnboardSessionsOpen(false);
  }, [repoPath]);

  const loadOnboardSession = useCallback(async (sid) => {
    if (!repoPath || !sid) return;
    try {
      const res = await getChatHistory(repoPath, 'onboard', sid);
      if (!res?.error && res?.messages) {
        setOnboardChatMessages(res.messages.map((m) => ({ role: m.role, content: m.content })));
        setOnboardSessionId(sid);
      }
    } catch { /* ignore */ }
    setOnboardSessionsOpen(false);
    setOnboardChatStreaming(false);
    setOnboardChatError(null);
    setOnboardOllamaDown(false);
  }, [repoPath]);

  const removeOnboardSession = useCallback(async (sid) => {
    if (!repoPath || !sid) return;
    try {
      await deleteSession(repoPath, 'onboard', sid);
      if (sid === onboardSessionId) { setOnboardChatMessages([]); setOnboardSessionId(''); }
      refreshOnboardSessions();
    } catch { /* ignore */ }
  }, [repoPath, onboardSessionId, refreshOnboardSessions]);

  const clearOnboardChat = useCallback(() => {
    if (onboardWsRef.current) onboardWsRef.current.close();
    setOnboardChatMessages([]);
    setOnboardChatStreaming(false);
    setOnboardChatError(null);
    setOnboardOllamaDown(false);
    try { localStorage.removeItem('cni_onboard_chat_messages'); } catch { /* ignore */ }
  }, []);

  // ══════════════════════════════════════════════════════════════════
  //  Bookmark helpers
  // ══════════════════════════════════════════════════════════════════

  const fetchBookmarks = useCallback(async () => {
    if (!repoPath) return;
    try {
      const res = await apiGetBookmarks(repoPath);
      if (!res?.error && res?.bookmarks) setBookmarks(res.bookmarks);
    } catch { /* ignore */ }
  }, [repoPath]);

  const addBookmarkFn = useCallback(async (file, note = '') => {
    if (!repoPath) return;
    try {
      await apiAddBookmark(file, note, repoPath);
      setBookmarks((prev) => {
        if (prev.some((b) => b.file === file)) return prev;
        return [{ file, note, created_at: new Date().toISOString() }, ...prev];
      });
    } catch { /* ignore */ }
  }, [repoPath]);

  const removeBookmarkFn = useCallback(async (file) => {
    if (!repoPath) return;
    try {
      await apiRemoveBookmark(file, repoPath);
      setBookmarks((prev) => prev.filter((b) => b.file !== file));
    } catch { /* ignore */ }
  }, [repoPath]);

  const isBookmarked = useCallback((file) => {
    return bookmarks.some((b) => b.file === file);
  }, [bookmarks]);

  // ══════════════════════════════════════════════════════════════════
  //  Checklist helpers
  // ══════════════════════════════════════════════════════════════════

  const fetchChecklist = useCallback(async () => {
    if (!repoPath) return;
    try {
      const res = await apiGetChecklist(repoPath);
      if (!res?.error && res?.checklist) setChecklist(res.checklist);
    } catch { /* ignore */ }
  }, [repoPath]);

  const fetchChecklistProgress = useCallback(async () => {
    if (!repoPath) return;
    try {
      const res = await apiGetChecklistProgress(repoPath);
      if (!res?.error && res?.progress) {
        const map = {};
        res.progress.forEach((p) => { map[p.file] = p.completed; });
        setChecklistProgress(map);
      }
    } catch { /* ignore */ }
  }, [repoPath]);

  const toggleChecklistItem = useCallback(async (file) => {
    if (!repoPath) return;
    const current = !!checklistProgress[file];
    const next = !current;
    // Optimistic update
    setChecklistProgress((prev) => ({ ...prev, [file]: next }));
    try {
      await apiToggleChecklistItem(file, next, repoPath);
    } catch {
      // Revert on failure
      setChecklistProgress((prev) => ({ ...prev, [file]: current }));
    }
  }, [repoPath, checklistProgress]);

  // ══════════════════════════════════════════════════════════════════
  //  clearAllState
  // ══════════════════════════════════════════════════════════════════
  const clearAllState = useCallback(() => {
    prevRepoRef.current = '';
    chatHistoryLoaded.current = false;
    onboardHistoryLoaded.current = false;
    try { localStorage.removeItem('cni_state'); } catch { /* ignore */ }
    try { localStorage.removeItem('cni_chat_messages'); } catch { /* ignore */ }
    try { localStorage.removeItem('cni_onboard_chat_messages'); } catch { /* ignore */ }
    setRepoPath('');
    setStats(null);
    setAnalysisError(null);
    setGraphData({ nodes: [], links: [] });
    setGraphError(null);
    setGraphNotAnalyzed(false);
    setHealthData(null);
    setHealthError(null);
    setOnboardData(null);
    setOnboardError(null);
    setImpactData(null);
    setImpactError(null);
    setImpactFile('');
    setChatMessages([]);
    setChatError(null);
    setChatOllamaDown(false);
    setChatSessionId('');
    setChatSessions([]);
    setOnboardChatMessages([]);
    setOnboardChatError(null);
    setOnboardOllamaDown(false);
    setOnboardSessionId('');
    setOnboardSessions([]);
    setBookmarks([]);
    setChecklist([]);
    setChecklistProgress({});
  }, []);

  // ══════════════════════════════════════════════════════════════════
  //  Context value
  // ══════════════════════════════════════════════════════════════════
  const value = {
    // Analysis
    repoPath, setRepoPath, stats, loading: analysisLoading,
    error: analysisError, analyze, isAnalyzed: !!stats, recovering,

    // Recent repos
    recentRepos, addRecentRepo, removeRecentRepo,

    // Graph
    graphData, graphLoading, graphError, graphNotAnalyzed, fetchGraph,

    // Health
    healthData, healthLoading, healthError, fetchHealth,

    // Onboard report
    onboardData, onboardLoading, onboardError, fetchOnboard,
    setOnboardData, setOnboardError, setOnboardLoading,

    // Impact
    impactData, impactFile, impactLoading, impactError, fetchImpact,
    setImpactData, setImpactFile, setImpactError, setImpactLoading,

    // Chat
    chatMessages, chatStreaming, chatError, chatOllamaDown,
    chatSessionId, chatSessions, chatSessionsOpen, setChatSessionsOpen,
    sendChatMessage, clearChat, startNewChatSession,
    loadChatSession, removeChatSession, refreshChatSessions,

    // Graph chat file context
    selectedChatFile, setSelectedChatFile,

    // Onboard chat
    onboardChatMessages, onboardChatStreaming, onboardChatError, onboardOllamaDown,
    onboardSessionId, onboardSessions, onboardSessionsOpen, setOnboardSessionsOpen,
    sendOnboardChat, clearOnboardChat, startNewOnboardSession,
    loadOnboardSession, removeOnboardSession, refreshOnboardSessions,

    // General
    clearAllState,

    // Bookmarks
    bookmarks, fetchBookmarks,
    addBookmark: addBookmarkFn,
    removeBookmark: removeBookmarkFn,
    isBookmarked,

    // Checklist
    checklist, checklistProgress,
    fetchChecklist, fetchChecklistProgress,
    toggleChecklistItem,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
