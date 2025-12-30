import React, { useState, useEffect, useRef } from 'react';
import { Activity, GitCommit, Play, Square, Terminal, Cpu, Network, BarChart3, Database, Users, Undo2, AlertTriangle, ArrowRight, Check, AlertOctagon, TrendingDown, LogOut, ShieldCheck, Zap, Trash2, XCircle, MessageSquare, Layers } from 'lucide-react';
import { AreaChart, Area, CartesianGrid, Tooltip, ResponsiveContainer, YAxis } from 'recharts';
import { InferenceEvent, DecisionObject, SimulationMode, DistributionStats, ActiveRule } from './types';
import { StreamingStats } from './services/statsEngine';
import { compileDecision } from './services/decisionCompiler';
import { getDecisionHighlights } from './services/analysisService';
import { evaluateRequest } from './services/decisionEngine';

// Firebase Integrations
import { auth, db } from './services/firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { fetchActiveRules, deployRule, deleteRule, logDecisionFeedback } from './services/rulesService';
import Auth from './components/Auth';

// --- SIMULATION LAYER (INPUT DATA ONLY) ---
const PROMPT_CLASSES = ['summarization', 'extraction', 'reporting', 'chat'];
const MODELS = ['gpt-4', 'gpt-4', 'claude-3-opus', 'gpt-3.5-turbo'];
const TENANTS = ['acme_corp', 'globex', 'soylent_corp', 'massive_dynamic', 'umbrella_inc'];
const RETRY_REASONS = ['timeout', 'rate_limit', 'upstream_503', 'context_length_exceeded'];

const generateRawRequest = (seq: number): Partial<InferenceEvent> => {
  const pClass = PROMPT_CLASSES[Math.floor(Math.random() * PROMPT_CLASSES.length)];
  let retries = 0;
  let retryReason = null;
  let model = MODELS[Math.floor(Math.random() * MODELS.length)];
  
  // Inject correlations to make statistical analysis robust:
  // 1. "Reporting" class is heavy, uses GPT-4 often, and fails often.
  if (pClass === 'reporting') {
      if (Math.random() > 0.3) model = 'gpt-4'; // High correlation with expensive model
      
      // The Fault:
      if (Math.random() > 0.65) {
        retries = Math.floor(Math.random() * 3) + 1;
        retryReason = Math.random() > 0.2 ? 'timeout' : 'upstream_503';
      }
  } else if (Math.random() > 0.98) {
      // Background noise failures
      retries = 1;
      retryReason = RETRY_REASONS[Math.floor(Math.random() * RETRY_REASONS.length)];
  }

  const baseTokens = 500 + Math.random() * 1500;
  const tenant = Math.random() > 0.6 ? 'acme_corp' : TENANTS[Math.floor(Math.random() * TENANTS.length)];

  return {
    ts: new Date().toISOString(),
    org_id: tenant,
    env: 'prod',
    model: model,
    endpoint: '/v1/completions',
    prompt_hash: `hash_${seq}`,
    prompt_class: pClass,
    tokens_in: Math.floor(baseTokens * 0.3),
    tokens_out: Math.floor(baseTokens * 0.7),
    latency_ms: 200 + Math.random() * 800,
    retries: retries,
    retry_reason: retryReason,
    success: true,
    // Base cost before any intervention
    cost_usd: ((baseTokens * (1 + retries)) / 1000) * (model.includes('gpt-4') || model.includes('opus') ? 0.03 : 0.002)
  };
};

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const userRef = useRef<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [mode, setMode] = useState<SimulationMode>(SimulationMode.IDLE);
  const [events, setEvents] = useState<InferenceEvent[]>([]);
  // We use a Ref for the Analysis loop to access data without dependency cycles or re-renders
  const eventsRef = useRef<InferenceEvent[]>([]);

  const [currentQPS, setCurrentQPS] = useState(0);
  
  // Learning Plane State
  const [latestDecision, setLatestDecision] = useState<DecisionObject | null>(null);
  const [stats, setStats] = useState<DistributionStats | null>(null);
  
  // Interaction State
  const [showOverrideInput, setShowOverrideInput] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  
  // Data Plane State (Rules)
  const [activeRules, setActiveRules] = useState<ActiveRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  
  const seqRef = useRef(0);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      userRef.current = u;
      setAuthLoading(false);
      if (u) loadRules(u.uid);
    });
    return unsubscribe;
  }, []);

  const loadRules = async (uid: string) => {
      setRulesLoading(true);
      try {
          const rules = await fetchActiveRules(uid);
          setActiveRules(rules);
      } catch (e) {
          console.error("Failed to load rules", e);
      } finally {
          setRulesLoading(false);
      }
  };

  const handleDeployRule = async () => {
      if (!latestDecision || !latestDecision.rule_generated || !user) return;
      try {
          // 1. Deploy Rule
          const newRule = await deployRule(user.uid, latestDecision.rule_generated);
          setActiveRules(prev => [...prev, newRule]);
          
          // 2. Log Success Feedback
          await logDecisionFeedback(user.uid, latestDecision.id, 'SUCCESS');

          // 3. Reset UI
          setLatestDecision(null);
          setShowOverrideInput(false);
      } catch (e) {
          console.error("Deploy failed", e);
      }
  };

  const handleOverrideClick = () => {
      setShowOverrideInput(true);
  };

  const submitOverride = async () => {
      if (!latestDecision || !user) return;
      try {
          await logDecisionFeedback(user.uid, latestDecision.id, 'OVERRIDE', overrideReason);
          setLatestDecision(null);
          setShowOverrideInput(false);
          setOverrideReason("");
      } catch (e) {
          console.error("Override log failed", e);
      }
  };

  const handleDeleteRule = async (ruleId: string) => {
      if (!user) return;
      try {
          await deleteRule(user.uid, ruleId);
          setActiveRules(prev => prev.filter(r => r.id !== ruleId));
      } catch (e) {
          console.error("Delete failed", e);
      }
  };

  // --- TRAFFIC SIMULATION LOOP (50ms) ---
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (mode === SimulationMode.RUNNING) {
      interval = setInterval(() => {
        setEvents(prev => {
          // Goal: ~1000 QPS -> ~50 requests per 50ms tick
          const time = Date.now() / 1000;
          const variance = Math.sin(time) * 150; 
          const targetQPS = 1000 + variance + (Math.random() * 50);
          const batchSize = Math.floor(targetQPS / 20); 
          
          setCurrentQPS(Math.round(targetQPS));

          const newBatch: InferenceEvent[] = [];

          for (let i = 0; i < batchSize; i++) {
              seqRef.current += 1;
              const rawRequest = generateRawRequest(seqRef.current);
              const engineResponse = evaluateRequest(rawRequest, activeRules);
              
              let finalEvent = { ...rawRequest, ...engineResponse } as InferenceEvent;

              if (engineResponse.decision === 'CONDITIONAL' && engineResponse.overrides) {
                  // Handle Retries Override
                  if (engineResponse.overrides.retries !== undefined) {
                      const originalRetries = rawRequest.retries || 0;
                      const newRetries = engineResponse.overrides.retries;
                      if (newRetries < originalRetries) {
                          const reductionRatio = (1 + newRetries) / (1 + originalRetries);
                          finalEvent.retries = newRetries;
                          finalEvent.cost_usd = (finalEvent.cost_usd || 0) * reductionRatio;
                          finalEvent.decision_applied = "CONDITIONAL";
                          finalEvent.rule_applied = engineResponse.rule_id;
                      }
                  }
                  
                  // Handle Model Override (e.g., Downgrade High Cost Models)
                  if (engineResponse.overrides.model !== undefined) {
                      const oldModel = rawRequest.model || '';
                      const newModel = engineResponse.overrides.model;
                      
                      if (oldModel !== newModel) {
                          finalEvent.model = newModel;
                          
                          // Recalculate cost based on approximate model tier difference
                          const getRate = (m: string) => (m.includes('gpt-4') || m.includes('opus') ? 0.03 : 0.002);
                          const oldRate = getRate(oldModel);
                          const newRate = getRate(newModel);
                          
                          if (oldRate > 0) {
                              const ratio = newRate / oldRate;
                              finalEvent.cost_usd = (finalEvent.cost_usd || 0) * ratio;
                          }
                          
                          finalEvent.decision_applied = "CONDITIONAL";
                          finalEvent.rule_applied = engineResponse.rule_id;
                      }
                  }
              }
              newBatch.push(finalEvent);
          }

          // Keep 2000 for graph visual history
          const combinedEvents = [...prev, ...newBatch].slice(-2000);
          
          // Update Ref for the separate analysis loop
          eventsRef.current = combinedEvents;

          // Compute Stats for Data Plane Display (Fast, lightweight)
          const rollingStatsEngine = new StreamingStats();
          combinedEvents.forEach(e => rollingStatsEngine.update(e.cost_usd));
          setStats(rollingStatsEngine.getStats(combinedEvents));

          return combinedEvents;
        });
      }, 50);
    } else {
        setCurrentQPS(0);
    }
    return () => clearInterval(interval);
  }, [mode, activeRules]); 


  // --- ANALYSIS LOOP (2Hz / 500ms) ---
  useEffect(() => {
      if (mode !== SimulationMode.RUNNING) return;

      const analysisInterval = setInterval(() => {
          // Guard: If user is interacting (Override mode), pause analysis updates to prevent UI jumping
          if (showOverrideInput) return;

          const currentEvents = eventsRef.current;
          if (currentEvents.length < 50) return;

          // Rolling basis: Last 1000 queries
          const analysisWindow = currentEvents.slice(-1000);

          const analysis = compileDecision(analysisWindow);
          
          if (analysis && analysis.decision_state !== 'INSUFFICIENT_EVIDENCE') {
              setLatestDecision(analysis);
              // Note: We are NOT auto-saving to DB here to prevent spamming 2 writes/sec.
              // Saving happens on 'Deploy' or 'Override' action, which acts as the "Commit".
          }

      }, 500); // 2 times per second

      return () => clearInterval(analysisInterval);
  }, [mode, showOverrideInput]);


  const reset = () => {
    setMode(SimulationMode.IDLE);
    setEvents([]);
    eventsRef.current = [];
    setLatestDecision(null);
    setShowOverrideInput(false);
    setStats(null);
    setCurrentQPS(0);
    seqRef.current = 0;
  };

  const handleSignOut = () => {
      setMode(SimulationMode.IDLE);
      signOut(auth);
  };

  if (authLoading) return <div className="min-h-screen bg-[#09090b] flex items-center justify-center text-zinc-500 text-sm">Loading...</div>;
  if (!user) return <Auth />;

  const highlights = latestDecision ? getDecisionHighlights(latestDecision) : null;

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-300 font-sans p-6 selection:bg-indigo-500/30">
      
      {/* Header */}
      <header className="flex justify-between items-center mb-8 border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-4">
            <div className="bg-indigo-500/10 p-2 rounded-lg border border-indigo-500/20">
                <GitCommit className="text-indigo-400" size={24} />
            </div>
            <div>
                <h1 className="text-xl font-bold text-zinc-100 tracking-tight">Causal Inference Engine <span className="text-zinc-600 font-normal ml-2">MVP 2.0</span></h1>
                <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">Active Protection</span>
                    <span className="text-zinc-600 text-[10px] font-mono">// Hot Path Latency: &lt;10ms</span>
                </div>
            </div>
        </div>
        
        <div className="flex items-center gap-3">
             <div className="text-xs text-zinc-500 mr-2 border-r border-zinc-800 pr-4">
                 Engine: <span className="text-zinc-300">{user.email}</span>
             </div>

            <div className="flex gap-2 bg-zinc-900 p-1 rounded-lg border border-zinc-800">
                <button 
                    onClick={() => setMode(SimulationMode.RUNNING)}
                    className={`px-4 py-1.5 rounded text-xs font-medium flex items-center gap-2 transition-all ${mode === SimulationMode.RUNNING ? 'bg-zinc-800 text-emerald-400 border border-zinc-700 shadow-inner' : 'text-zinc-400 hover:text-zinc-200'}`}
                >
                    <Play size={14} /> Simulate Traffic
                </button>
                <button 
                    onClick={reset}
                    className="px-4 py-1.5 rounded text-xs font-medium text-zinc-400 hover:text-rose-400 flex items-center gap-2 transition-colors"
                >
                    <Square size={14} /> Reset
                </button>
            </div>

            <button onClick={handleSignOut} className="p-2 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 rounded-lg transition-colors">
                <LogOut size={18} />
            </button>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: DATA PLANE (HOT PATH) */}
        <div className="col-span-3 space-y-6">
             {/* Engine Status */}
             <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-800/50 bg-zinc-900/50 flex justify-between items-center">
                    <h3 className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-2">
                        <Zap size={12} /> Data Plane (Hot Path)
                    </h3>
                    <div className="flex items-center gap-2">
                        <span className="text-[9px] text-zinc-500">FAIL-OPEN</span>
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                    </div>
                </div>
                <div className="p-4 space-y-3">
                    <div className="flex justify-between items-end">
                        <span className="text-xs text-zinc-500">Requests/sec</span>
                        <div className="flex items-baseline gap-1">
                            <span className="text-xl font-mono text-zinc-200">{currentQPS}</span>
                            <span className="text-[10px] text-zinc-500">QPS</span>
                        </div>
                    </div>
                    {/* Live Stats Display */}
                    {stats && (
                        <>
                            <div className="flex justify-between items-end border-t border-zinc-800/50 pt-2">
                                <span className="text-xs text-zinc-500">Avg Cost</span>
                                <span className="text-sm font-mono text-zinc-300">${stats.mean.toFixed(4)}</span>
                            </div>
                            <div className="flex justify-between items-end">
                                <span className="text-xs text-zinc-500">P99 Cost</span>
                                <span className="text-sm font-mono text-rose-400">${stats.p99.toFixed(4)}</span>
                            </div>
                        </>
                    )}
                    <div className="flex justify-between items-end border-t border-zinc-800/50 pt-2">
                        <span className="text-xs text-zinc-500">Latency Added</span>
                        <span className="text-sm font-mono text-emerald-400">0.04ms</span>
                    </div>
                </div>
            </div>

            {/* Active Rules List */}
            <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-lg overflow-hidden min-h-[200px]">
                <div className="px-4 py-3 border-b border-zinc-800/50 bg-zinc-900/50 flex justify-between items-center">
                    <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                        <ShieldCheck size={12} /> Active Rules
                    </h3>
                    <span className="text-[9px] text-zinc-600">{activeRules.length} Loaded</span>
                </div>
                <div className="p-2 space-y-2">
                    {rulesLoading ? (
                        <div className="text-center text-xs text-zinc-600 py-4">Syncing Control Plane...</div>
                    ) : activeRules.length === 0 ? (
                        <div className="text-center text-xs text-zinc-600 py-4 italic">No active rules. System is transparent.</div>
                    ) : (
                        activeRules.map(rule => (
                            <div key={rule.id} className="bg-zinc-900 border border-zinc-800 p-2 rounded flex justify-between items-center group">
                                <div>
                                    <div className="text-[10px] text-emerald-400 font-bold uppercase">{rule.deploy_state}</div>
                                    <div className="text-xs text-zinc-300">{rule.description}</div>
                                    <div className="text-[9px] text-zinc-500 font-mono mt-0.5">ID: {rule.rule_id}</div>
                                </div>
                                <button 
                                    onClick={() => handleDeleteRule(rule.id)}
                                    className="text-zinc-600 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>

        {/* CENTER: LEARNING PLANE (COLD PATH) */}
        <div className="col-span-6 space-y-6">
            
            {/* Real-time Graph */}
            <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-lg p-1 h-[200px] relative">
                 <div className="absolute top-3 left-4 z-10">
                    <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                        <Activity size={12} /> Outcome Observation
                    </div>
                 </div>
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={events}>
                        <defs>
                            <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                        <YAxis hide domain={[0, 'auto']} />
                        <Tooltip contentStyle={{ display: 'none' }} />
                        <Area type="step" dataKey="cost_usd" stroke="#6366f1" fill="url(#costGradient)" strokeWidth={1} isAnimationActive={false} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {/* Decision Object (The Core Output) */}
            <div className="bg-surface border border-zinc-800 rounded-lg overflow-hidden flex flex-col h-[500px]">
                 <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center">
                    <h3 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                        <Terminal size={12} /> Learning Plane (Analyst)
                    </h3>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${mode === SimulationMode.RUNNING ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-600'}`}></span>
                            <span className="text-[10px] text-zinc-500 font-mono">Loop: 2Hz</span>
                        </div>
                    </div>
                </div>
                <div className="flex-1 bg-zinc-950 p-4 overflow-auto relative group">
                    {latestDecision && highlights ? (
                        <>
                            {/* Visual Insights Overlay */}
                            <div className="mb-4 pb-4 border-b border-zinc-800/50 grid grid-cols-2 gap-3">
                                <div className={`col-span-2 flex items-center gap-3 p-3 rounded-lg border bg-${highlights.color}-500/5 border-${highlights.color}-500/20`}>
                                     <div className={`p-2 rounded-full bg-${highlights.color}-500/10 text-${highlights.color}-500`}>
                                         <highlights.Icon size={20} />
                                     </div>
                                     <div className="flex-1">
                                         <div className={`text-[10px] font-bold uppercase tracking-wider text-${highlights.color}-500 mb-0.5`}>
                                             {highlights.label}
                                         </div>
                                         <div className="text-sm font-semibold text-zinc-200 leading-tight">
                                             {highlights.headline}
                                         </div>
                                     </div>
                                </div>
                            </div>

                            {/* Variance Drivers Analysis - NEW SECTION */}
                            <div className="mb-6 p-3 bg-zinc-900/50 rounded border border-zinc-800/50">
                                <div className="text-[10px] text-zinc-500 uppercase mb-3 flex items-center gap-1">
                                    <Layers size={10} /> Variance Drivers
                                </div>
                                <div className="space-y-3">
                                    {Object.entries(latestDecision.proof.variance_decomposition)
                                        .sort(([, a], [, b]) => (b as number) - (a as number))
                                        .map(([key, value]) => (
                                        <div key={key} className="space-y-1">
                                            <div className="flex justify-between text-[10px]">
                                                <span className="capitalize text-zinc-300">{key.replace('_', ' ')}</span>
                                                <span className="font-mono text-zinc-400">{((value as number) * 100).toFixed(1)}%</span>
                                            </div>
                                            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                                <div 
                                                    className={`h-full rounded-full ${
                                                        key === 'noise' ? 'bg-zinc-600' :
                                                        key === 'retries' ? 'bg-amber-500' :
                                                        key === 'prompt_class' ? 'bg-emerald-500' :
                                                        'bg-indigo-500'
                                                    }`}
                                                    style={{ width: `${(value as number) * 100}%` }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* ACTIONS: DEPLOY vs OVERRIDE */}
                            {latestDecision.decision_state === 'CONDITIONAL' && latestDecision.rule_generated && (
                                <div className="mb-6 bg-emerald-900/10 border border-emerald-500/20 p-4 rounded-lg">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <div className="text-xs font-bold text-emerald-400 mb-1 flex items-center gap-2">
                                                <GitCommit size={12} /> Recommended Policy
                                            </div>
                                            <div className="text-sm text-zinc-200">{latestDecision.recommended_action.action}</div>
                                            <div className="text-[10px] text-zinc-500 mt-1">Impact: ${latestDecision.expected_impact.monthly_projection_usd.toLocaleString()}/mo savings</div>
                                        </div>
                                    </div>
                                    
                                    {!showOverrideInput ? (
                                        <div className="flex items-center gap-2">
                                            <button 
                                                onClick={handleDeployRule}
                                                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2 rounded shadow-lg shadow-emerald-900/20 transition-all flex items-center justify-center gap-2"
                                            >
                                                Deploy to Hot Path <ArrowRight size={12} />
                                            </button>
                                            <button 
                                                onClick={handleOverrideClick}
                                                className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold rounded border border-zinc-700 transition-all flex items-center gap-2"
                                            >
                                                <XCircle size={14} /> Override
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="bg-zinc-900 p-3 rounded border border-zinc-700/50 mt-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                            <div className="flex items-center gap-2 mb-2 text-xs text-zinc-400">
                                                <MessageSquare size={12} />
                                                <span>Reason for Override / Rejection:</span>
                                            </div>
                                            <textarea 
                                                value={overrideReason}
                                                onChange={(e) => setOverrideReason(e.target.value)}
                                                placeholder="e.g., False positive, business critical workflow..."
                                                className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-xs text-zinc-200 focus:outline-none focus:border-amber-500/50 mb-3 min-h-[60px]"
                                            />
                                            <div className="flex justify-end gap-2">
                                                <button 
                                                    onClick={() => { setShowOverrideInput(false); setOverrideReason(""); }}
                                                    className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300"
                                                >
                                                    Cancel
                                                </button>
                                                <button 
                                                    onClick={submitOverride}
                                                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded shadow-lg transition-all"
                                                >
                                                    Submit Override
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Alternative Actions Table */}
                            <div className="mb-4">
                                <div className="text-[10px] text-zinc-500 uppercase mb-2 flex items-center gap-1">
                                    <GitCommit size={10} /> Action Granularity
                                </div>
                                <div className="w-full text-left border-collapse">
                                    {latestDecision.alternative_actions_considered.map((alt, i) => (
                                        <div key={i} className="flex items-center justify-between py-1.5 px-2 text-[10px] border-b border-zinc-800/50 hover:bg-zinc-900/50">
                                            <span className={`flex-1 ${i === 0 ? 'text-emerald-400 font-medium' : 'text-zinc-400'}`}>
                                                {alt.action} {i === 0 && "(Selected)"}
                                            </span>
                                            <div className="flex items-center gap-3">
                                                <span className={`px-1 rounded border ${
                                                    alt.risk === 'LOW' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' :
                                                    alt.risk === 'MEDIUM' ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' :
                                                    'bg-rose-500/10 border-rose-500/20 text-rose-500'
                                                }`}>
                                                    {alt.risk}
                                                </span>
                                                <span className="font-mono text-zinc-300 w-8 text-right">{alt.score.toFixed(2)}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-zinc-700 gap-2">
                            <Terminal size={24} />
                            <span className="text-xs font-mono">Analyzing Traffic Patterns...</span>
                        </div>
                    )}
                </div>
            </div>

        </div>

        {/* RIGHT: BUSINESS IMPACT (PERSISTENT) */}
        <div className="col-span-3 space-y-6">
             <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-800/50 bg-zinc-900/50">
                    <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                        <Database size={12} /> Cost of Inaction
                    </h3>
                </div>
                <div className="p-4">
                    {latestDecision ? (
                        <div className="p-2.5 rounded bg-rose-500/5 border border-rose-500/10">
                            <div className="flex items-center gap-1.5 text-[10px] text-rose-400 font-bold mb-2 uppercase tracking-wide">
                                <TrendingDown size={12} /> Projected Loss
                            </div>
                            <div className="flex justify-between items-end mb-1">
                                <span className="text-[10px] text-zinc-500">Monthly</span>
                                <span className="text-xs font-mono text-rose-400 font-bold">${latestDecision.inaction_cost.expected_monthly_loss_usd.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-end">
                                <span className="text-[10px] text-zinc-500">Runway Hit</span>
                                <span className="text-xs font-mono text-rose-400">-{latestDecision.inaction_cost.runway_impact_days.toFixed(1)} Days</span>
                            </div>
                         </div>
                    ) : <div className="text-center text-[10px] text-zinc-700">Gathering Data...</div>}
                </div>
            </div>
            
            <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-lg overflow-hidden">
                 <div className="px-4 py-3 border-b border-zinc-800/50 bg-zinc-900/50">
                    <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                        <Users size={12} /> Blast Radius
                    </h3>
                </div>
                <div className="p-4">
                    {latestDecision ? (
                        <div className="space-y-3">
                             <div className="flex justify-between items-center text-[10px]">
                                <span className="text-zinc-400">Affected Tenants</span>
                                <span className="text-zinc-200">{(latestDecision.blast_radius.affected_tenants_pct * 100).toFixed(0)}%</span>
                             </div>
                             <div className="w-full bg-zinc-800 h-1 rounded-full overflow-hidden">
                                <div className="h-full bg-indigo-500" style={{width: `${latestDecision.blast_radius.affected_tenants_pct * 100}%`}}></div>
                             </div>
                        </div>
                    ) : <div className="text-center text-[10px] text-zinc-700">Waiting...</div>}
                </div>
            </div>

        </div>

      </div>
    </div>
  );
};

export default App;