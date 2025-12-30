import React, { useState, useEffect, useRef } from 'react';
import { Activity, GitCommit, Play, Square, Terminal, Cpu, Network, Bot, BarChart3, Database, ShieldAlert, Users, Undo2, AlertTriangle } from 'lucide-react';
import { AreaChart, Area, CartesianGrid, Tooltip, ResponsiveContainer, YAxis } from 'recharts';
import { InferenceEvent, DecisionObject, SimulationMode, DistributionStats } from './types';
import { StreamingStats } from './services/statsEngine';
import { compileDecision } from './services/decisionCompiler';
import { narrateDecision } from './services/analysisService';

// --- SIMULATION LAYER (INPUT DATA ONLY) ---
const PROMPT_CLASSES = ['summarization', 'extraction', 'reporting', 'chat'];
const MODELS = ['gpt-4', 'gpt-4', 'claude-3-opus', 'gpt-3.5-turbo'];
const TENANTS = ['acme_corp', 'globex', 'soylent_corp', 'massive_dynamic', 'umbrella_inc'];
const RETRY_REASONS = ['timeout', 'rate_limit', 'upstream_503', 'context_length_exceeded'];

const generateEvent = (seq: number): InferenceEvent => {
  const pClass = PROMPT_CLASSES[Math.floor(Math.random() * PROMPT_CLASSES.length)];
  let retries = 0;
  let retryReason = null;
  
  // Inject the "Fault": Reporting has high retry rate due to timeouts
  if (pClass === 'reporting' && Math.random() > 0.65) {
    retries = Math.floor(Math.random() * 3) + 1;
    // Correlate reason: Reporting usually times out
    retryReason = Math.random() > 0.2 ? 'timeout' : 'upstream_503';
  } else if (Math.random() > 0.95) {
      // Random noise retries
      retries = 1;
      retryReason = RETRY_REASONS[Math.floor(Math.random() * RETRY_REASONS.length)];
  }

  const baseTokens = 500 + Math.random() * 1500;
  const totalTokens = baseTokens * (1 + retries);
  const model = MODELS[Math.floor(Math.random() * MODELS.length)];
  
  // Cost approx
  const cost = (totalTokens / 1000) * (model === 'gpt-4' ? 0.03 : 0.002);

  // Bias tenant usage (Pareto distribution simulation)
  // Acme Corp is the heavy user
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
    cost_usd: cost
  };
};

const App: React.FC = () => {
  const [mode, setMode] = useState<SimulationMode>(SimulationMode.IDLE);
  const [events, setEvents] = useState<InferenceEvent[]>([]);
  const [latestDecision, setLatestDecision] = useState<DecisionObject | null>(null);
  const [narration, setNarration] = useState<string | null>(null);
  const [stats, setStats] = useState<DistributionStats | null>(null);
  
  // Sequence counter for unique IDs
  const seqRef = useRef(0);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (mode === SimulationMode.RUNNING) {
      interval = setInterval(() => {
        setEvents(prev => {
          seqRef.current += 1;
          const newEvent = generateEvent(seqRef.current);
          
          // 1. Ingest Simulated Input (Keep rolling window of 200)
          const newEvents = [...prev, newEvent].slice(-200);
          
          // 2. Autonomous Stats Engine (Rolling Window)
          // Fix: Re-calculate stats from scratch using the rolling window.
          // This prevents stats from "freezing" as N becomes large in an accumulator.
          const rollingStatsEngine = new StreamingStats();
          newEvents.forEach(e => rollingStatsEngine.update(e.cost_usd));
          setStats(rollingStatsEngine.getStats(newEvents));

          // 3. Autonomous Decision Compiler (Every 10 events)
          if (newEvents.length % 10 === 0) {
            const decision = compileDecision(newEvents);
            if (decision) {
                setLatestDecision(decision);
                narrateDecision(decision).then(text => setNarration(text));
            }
          }

          return newEvents;
        });
      }, 80);
    }
    return () => clearInterval(interval);
  }, [mode]);

  const reset = () => {
    setMode(SimulationMode.IDLE);
    setEvents([]);
    setLatestDecision(null);
    setNarration(null);
    setStats(null);
    seqRef.current = 0;
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-300 font-sans p-6 selection:bg-indigo-500/30">
      
      {/* Header */}
      <header className="flex justify-between items-center mb-8 border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-4">
            <div className="bg-indigo-500/10 p-2 rounded-lg border border-indigo-500/20">
                <GitCommit className="text-indigo-400" size={24} />
            </div>
            <div>
                <h1 className="text-xl font-bold text-zinc-100 tracking-tight">Causal Inference Engine <span className="text-zinc-600 font-normal ml-2">v2.1 (Auditable)</span></h1>
                <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">Autonomous Core</span>
                    <span className="text-zinc-600 text-[10px] font-mono">// Welford Stats • ANOVA Variance • Counterfactuals</span>
                </div>
            </div>
        </div>
        
        <div className="flex items-center gap-3">
            <div className="flex gap-2 bg-zinc-900 p-1 rounded-lg border border-zinc-800">
                <button 
                    onClick={() => setMode(SimulationMode.RUNNING)}
                    className={`px-4 py-1.5 rounded text-xs font-medium flex items-center gap-2 transition-all ${mode === SimulationMode.RUNNING ? 'bg-zinc-800 text-emerald-400 border border-zinc-700 shadow-inner' : 'text-zinc-400 hover:text-zinc-200'}`}
                >
                    <Play size={14} /> Simulate Input
                </button>
                <button 
                    onClick={reset}
                    className="px-4 py-1.5 rounded text-xs font-medium text-zinc-400 hover:text-rose-400 flex items-center gap-2 transition-colors"
                >
                    <Square size={14} /> Reset
                </button>
            </div>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-6">
        
        {/* Left Column: Stats & Monitoring */}
        <div className="col-span-3 space-y-6">
             <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-800/50 bg-zinc-900/50 flex justify-between items-center">
                    <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                        <Network size={12} /> Ingestion Stream
                    </h3>
                    {mode === SimulationMode.RUNNING && <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
                </div>
                <div className="p-4">
                    <div className="text-xs text-zinc-500 mb-2">Processing Event Batch</div>
                    <div className="font-mono text-2xl text-zinc-200 tabular-nums">
                        {events.length.toString().padStart(4, '0')}
                    </div>
                </div>
            </div>

            <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-800/50 bg-zinc-900/50 flex justify-between items-center">
                    <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                        <BarChart3 size={12} /> Stats Engine
                    </h3>
                </div>
                {stats ? (
                    <div className="p-4 space-y-4">
                        <div>
                            <div className="flex justify-between text-[10px] text-zinc-500 uppercase mb-1">Mean Cost</div>
                            <div className="font-mono text-lg text-zinc-200">${stats.mean.toFixed(4)}</div>
                        </div>
                        <div>
                            <div className="flex justify-between text-[10px] text-zinc-500 uppercase mb-1">Variance (σ²)</div>
                            <div className="font-mono text-lg text-amber-500">{stats.variance.toFixed(6)}</div>
                        </div>
                        <div>
                            <div className="flex justify-between text-[10px] text-zinc-500 uppercase mb-1">Instability Idx</div>
                            <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                                <div className={`h-full transition-all duration-300 ${stats.instability_index > 0.1 ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{width: `${Math.min(stats.instability_index * 100, 100)}%`}}></div>
                            </div>
                            <div className="text-right text-[10px] text-zinc-400 mt-1">{stats.instability_index.toFixed(3)}</div>
                        </div>
                    </div>
                ) : (
                    <div className="p-4 text-center text-xs text-zinc-600">Idle</div>
                )}
            </div>
        </div>

        {/* Center: Logic & Decision */}
        <div className="col-span-6 space-y-6">
            
            {/* Real-time Graph */}
            <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-lg p-1 h-[200px] relative">
                 <div className="absolute top-3 left-4 z-10">
                    <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                        <Activity size={12} /> Cost Distribution
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
                        <Terminal size={12} /> Decision Object (Final Output)
                    </h3>
                    <div className="text-[10px] text-zinc-600 font-mono">v2.1.1-diagnostic</div>
                </div>
                <div className="flex-1 bg-zinc-950 p-4 overflow-auto relative group">
                    {latestDecision ? (
                        <>
                            {/* Gemini Narration Overlay */}
                            <div className="mb-4 pb-4 border-b border-zinc-800/50">
                                <div className="flex items-center gap-2 text-indigo-400 mb-2">
                                    <Bot size={14} />
                                    <span className="text-[10px] font-bold uppercase">AI Narrator (Explanation Only)</span>
                                </div>
                                <p className="text-xs text-zinc-300 leading-relaxed font-medium">
                                    {narration || <span className="animate-pulse text-zinc-600">Generating explanation...</span>}
                                </p>
                            </div>
                            
                            {/* Formatted Decision View for Humans (in addition to JSON) */}
                            <div className="mb-4 bg-zinc-900/50 p-3 rounded border border-zinc-800">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${latestDecision.decision_state === 'CONDITIONAL' ? 'bg-amber-500' : 'bg-emerald-500'}`}></div>
                                        <span className="text-xs font-bold text-zinc-200">{latestDecision.decision_state}</span>
                                    </div>
                                    <span className="text-[10px] text-zinc-500 font-mono">ID: {latestDecision.id}</span>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4 mt-3">
                                    <div>
                                        <div className="text-[10px] text-zinc-500 mb-1 flex items-center gap-1">
                                            Confidence Score
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="text-sm font-mono text-zinc-200">
                                                {latestDecision.confidence.final_score.toFixed(3)}
                                            </div>
                                            {latestDecision.confidence.overfit_risk !== 'LOW' && (
                                                <div className={`text-[9px] px-1.5 py-0.5 rounded border uppercase font-bold flex items-center gap-1 ${
                                                    latestDecision.confidence.overfit_risk === 'HIGH' 
                                                    ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' 
                                                    : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                                }`}>
                                                    <AlertTriangle size={8} />
                                                    Overfit Risk: {latestDecision.confidence.overfit_risk}
                                                </div>
                                            )}
                                        </div>
                                        <div className="text-[9px] text-zinc-600 mt-0.5 font-mono">R²: {latestDecision.confidence.model_fit_r2.toFixed(3)}</div>
                                    </div>
                                    <div>
                                         <div className="text-[10px] text-zinc-500 mb-1">Blast Radius</div>
                                         <div className="text-sm font-mono text-zinc-200">
                                            {(latestDecision.blast_radius.affected_revenue_pct * 100).toFixed(1)}% Rev
                                         </div>
                                    </div>
                                </div>
                                {/* Distribution Note */}
                                <div className="mt-3 pt-2 border-t border-zinc-800/50 text-[10px] text-zinc-400 italic text-center">
                                    "{latestDecision.expected_impact.distribution_notes}"
                                </div>
                            </div>

                            {/* Raw JSON */}
                            <div className="text-[10px] text-zinc-500 uppercase mb-1 mt-4">Raw JSON Payload</div>
                            <pre className="font-mono text-[10px] text-zinc-500 leading-relaxed">
                                {JSON.stringify(latestDecision, null, 2)}
                            </pre>
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-zinc-700 gap-2">
                            <Bot size={24} />
                            <span className="text-xs font-mono">Awaiting Decision Compilation...</span>
                        </div>
                    )}
                </div>
            </div>

        </div>

        {/* Right: Proof & Audit */}
        <div className="col-span-3 space-y-6">
            
            {/* Variance Decomposition */}
            <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-800/50 bg-zinc-900/50">
                    <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                        <Cpu size={12} /> Root Cause
                    </h3>
                </div>
                <div className="p-4 space-y-3">
                    {latestDecision ? (
                    <>
                        {Object.entries(latestDecision.proof.variance_decomposition).map(([key, val]) => (
                            <div key={key}>
                                <div className="flex justify-between text-[10px] mb-1">
                                    <span className="capitalize text-zinc-400">{key}</span>
                                    <span className="font-mono text-zinc-300">{((val as number) * 100).toFixed(1)}%</span>
                                </div>
                                <div className="w-full bg-zinc-800 h-1 rounded-full overflow-hidden">
                                    <div className="h-full bg-indigo-500" style={{width: `${(val as number) * 100}%`}}></div>
                                </div>
                            </div>
                        ))}
                        
                        {/* Noise Warning */}
                        {latestDecision.proof.noise_context && (
                            <div className="mt-2 text-[9px] text-amber-500/80 bg-amber-500/5 p-2 rounded border border-amber-500/10 flex items-center gap-2">
                                <ShieldAlert size={12} />
                                {latestDecision.proof.noise_context}
                            </div>
                        )}
                    </>
                    ) : <div className="text-center text-[10px] text-zinc-700 py-4">Gathering Data</div>}
                    
                    {latestDecision?.analysis_deep_dive.top_causes.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-zinc-800/50">
                            <div className="text-[10px] text-zinc-500 mb-2">Retry Deep Dive</div>
                            {latestDecision.analysis_deep_dive.top_causes.map(cause => (
                                <div key={cause.cause} className="flex justify-between text-[10px]">
                                    <span className="text-rose-400">{cause.cause}</span>
                                    <span className="text-zinc-500">{(cause.share * 100).toFixed(0)}%</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Impact & Reversibility */}
            <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-800/50 bg-zinc-900/50">
                    <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                        <Database size={12} /> Business Impact
                    </h3>
                </div>
                <div className="p-4">
                    {latestDecision ? (
                        <div className="space-y-4">
                             <div className="bg-emerald-900/10 border border-emerald-900/30 p-2 rounded">
                                <div className="text-[10px] text-emerald-500 font-bold mb-1">RECOMMENDATION</div>
                                <div className="text-[10px] text-emerald-200/80 leading-tight mb-2">
                                    {latestDecision.recommended_action.action}
                                </div>
                                <div className="text-[9px] text-emerald-500/50 border-t border-emerald-900/30 pt-1">
                                    ONLY IF: {latestDecision.recommended_action.only_if.join(' AND ')}
                                </div>
                             </div>
                             
                             <div className="grid grid-cols-2 gap-2">
                                <div className="text-center p-2 bg-zinc-900 rounded">
                                    <div className="text-[10px] text-zinc-500">Savings / 1k</div>
                                    <div className="text-xs font-mono text-emerald-400">${latestDecision.expected_impact.mean_savings_usd.toFixed(2)}</div>
                                </div>
                                <div className="text-center p-2 bg-zinc-900 rounded">
                                    <div className="text-[10px] text-zinc-500">Proj. Monthly</div>
                                    <div className="text-xs font-mono text-emerald-400">${latestDecision.expected_impact.monthly_projection_usd.toLocaleString()}</div>
                                </div>
                             </div>

                             <div className="flex items-center gap-2 justify-center pt-2 text-zinc-500">
                                <Undo2 size={10} />
                                <span className="text-[10px]">Rollback: {latestDecision.reversibility.rollback_time_minutes} min</span>
                             </div>
                        </div>
                    ) : <div className="text-center text-[10px] text-zinc-700 py-4">No Actionable Insight</div>}
                </div>
            </div>

            {/* Blast Radius Card */}
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
                             
                             <div className="pt-2 text-[10px] text-zinc-500 uppercase">Top Impacted</div>
                             {latestDecision.blast_radius.top_3_tenants.map(t => (
                                 <div key={t.id} className="flex justify-between text-[10px]">
                                     <span className="text-zinc-300 truncate w-24">{t.id}</span>
                                     <span className="text-indigo-400 font-mono">{(t.share * 100).toFixed(1)}%</span>
                                 </div>
                             ))}
                        </div>
                    ) : <div className="text-center text-[10px] text-zinc-700 py-4">Waiting...</div>}
                </div>
            </div>

        </div>

      </div>
    </div>
  );
};

export default App;