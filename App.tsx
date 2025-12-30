import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Activity, DollarSign, Shield, Zap, TrendingUp, AlertTriangle, Play, Square, RefreshCw, BarChart3, Clock, Wallet, CheckCircle2, ArrowRight } from 'lucide-react';
import DecisionLog from './components/DecisionLog';
import FinancialChart from './components/FinancialChart';
import StatCard from './components/StatCard';
import { MODELS, CUSTOMERS, INITIAL_RUNWAY_DAYS, HOURLY_BUDGET_CAP } from './constants';
import { makeDecision, calculateEWMA } from './services/costEngine';
import { analyzeCostAnomalies } from './services/analysisService';
import { SimulationRequest, SimulationDecision, FinancialState, ForecastPoint, SimulationMode, AnalysisResult } from './types';

const App: React.FC = () => {
  // --- State ---
  const [simulationMode, setSimulationMode] = useState<SimulationMode>(SimulationMode.IDLE);
  const [decisions, setDecisions] = useState<SimulationDecision[]>([]);
  const [financials, setFinancials] = useState<FinancialState>({
    totalSpend: 0,
    totalSaved: 0,
    currentRunwayDays: INITIAL_RUNWAY_DAYS,
    dailyBudget: 500,
    hourlySpendMA: 0,
    variance: 0
  });
  const [chartData, setChartData] = useState<ForecastPoint[]>([]);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Refs for simulation loop
  const requestCountRef = useRef(0);
  const timeRef = useRef(0);
  
  // Ref to access latest financials inside setInterval
  const financialsRef = useRef(financials);
  useEffect(() => {
    financialsRef.current = financials;
  }, [financials]);

  // --- Helpers ---
  const generateRandomRequest = useCallback((): SimulationRequest => {
    requestCountRef.current++;
    const modelKeys = Object.keys(MODELS);
    // During Spike mode, prioritize expensive models
    const isSpike = simulationMode === SimulationMode.SPIKE;
    const model = isSpike 
      ? (Math.random() > 0.3 ? 'gpt-4-turbo' : 'gpt-4o') 
      : modelKeys[Math.floor(Math.random() * modelKeys.length)];
    
    // Tokens: Spike mode has larger payloads
    const tokens = isSpike 
      ? Math.floor(Math.random() * 5000) + 2000 
      : Math.floor(Math.random() * 1500) + 100;

    return {
      id: `req_${requestCountRef.current}`,
      timestamp: Date.now(),
      customerId: CUSTOMERS[Math.floor(Math.random() * CUSTOMERS.length)],
      modelRequested: model,
      estimatedTokens: tokens
    };
  }, [simulationMode]);

  const updateChart = useCallback((currentCost: number, currentMA: number) => {
    const now = new Date();
    const timeLabel = `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;
    
    setChartData(prev => {
      const newData = [...prev, {
        time: timeLabel,
        actual: currentCost * 60, // Projecting to minute rate for visuals
        forecast: currentMA * 60,
        upperBand: (currentMA * 1.2) * 60,
        lowerBand: (currentMA * 0.8) * 60
      }];
      if (newData.length > 20) return newData.slice(1);
      return newData;
    });
  }, []);

  // --- Simulation Loop ---
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    if (simulationMode !== SimulationMode.IDLE) {
      const frequency = simulationMode === SimulationMode.SPIKE ? 200 : 800; // ms between requests
      
      interval = setInterval(() => {
        timeRef.current += 1;
        const req = generateRandomRequest();
        
        // Use ref to get latest state
        const prev = financialsRef.current;

        // Calculate Decision
        const decision = makeDecision(req, prev);
           
        // Update Stats Logic
        const newTotalSpend = prev.totalSpend + decision.costIncurred;
        const newTotalSaved = prev.totalSaved + decision.savedAmount;
           
        // Update Moving Average
        const instantHourlyRate = decision.costIncurred * (3600000 / frequency); 
        const newMA = calculateEWMA(instantHourlyRate, prev.hourlySpendMA, 0.1);

        // Update runway
        const burnRateDaily = newMA * 24;
        const remainingBudget = (INITIAL_RUNWAY_DAYS * prev.dailyBudget) - newTotalSpend;
        const newRunway = remainingBudget / (burnRateDaily || 1);

        // Update Decisions Log
        setDecisions(d => [...d.slice(-49), decision]); // Keep last 50
           
        // Update Chart occasionally
        if (timeRef.current % 2 === 0) {
             updateChart(instantHourlyRate, newMA);
        }

        // Update Financial State
        setFinancials({
             ...prev,
             totalSpend: newTotalSpend,
             totalSaved: newTotalSaved,
             hourlySpendMA: newMA,
             currentRunwayDays: newRunway > 0 ? newRunway : 0,
             variance: (newMA - HOURLY_BUDGET_CAP) / HOURLY_BUDGET_CAP
        });

      }, frequency);
    }

    return () => clearInterval(interval);
  }, [simulationMode, generateRandomRequest, updateChart]);

  // --- Analysis Handler ---
  const handleOptimizationAnalysis = async () => {
    setIsAnalyzing(true);
    setAnalysisResult(null);
    const result = await analyzeCostAnomalies(decisions, financials.totalSpend, financials.hourlySpendMA);
    setAnalysisResult(result);
    setIsAnalyzing(false);
  };

  // --- Calculations ---
  const projectedSpend6h = financials.hourlySpendMA * 6;
  const projectedSpend24h = financials.hourlySpendMA * 24;

  // --- Render ---
  return (
    <div className="min-h-screen bg-background p-6 font-sans text-zinc-300">
      
      {/* Header */}
      <header className="flex justify-between items-center mb-8 border-b border-zinc-800 pb-4">
        <div>
           <div className="flex items-center gap-2">
            <div className="bg-primary/20 p-2 rounded-lg">
                <Shield className="text-primary" size={24} />
            </div>
            <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">MarginGuard AI</h1>
           </div>
           <p className="text-zinc-500 text-sm mt-1">Real-time Inference Cost Control & Runway Protection</p>
        </div>
        
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-4 py-2 bg-zinc-900 rounded-full border border-zinc-800">
                <div className={`w-2 h-2 rounded-full ${simulationMode === SimulationMode.IDLE ? 'bg-zinc-500' : 'bg-emerald-500 animate-pulse'}`}></div>
                <span className="text-xs font-mono uppercase text-zinc-400">System: {simulationMode}</span>
            </div>
            <button 
                onClick={handleOptimizationAnalysis}
                disabled={isAnalyzing || decisions.length === 0}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-md text-sm shadow-lg shadow-indigo-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
            >
                {isAnalyzing ? <RefreshCw className="animate-spin" size={16} /> : <Zap size={16} className="group-hover:text-yellow-300 transition-colors" />}
                Run Optimization Scan
            </button>
        </div>
      </header>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Stats & Controls (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
            
            {/* Control Panel (Demo) */}
            <div className="bg-surface border border-zinc-800 rounded-lg p-6">
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Activity size={14} className="text-zinc-400"/> Traffic Simulation
                </h3>
                <div className="grid grid-cols-3 gap-2">
                    <button 
                        onClick={() => setSimulationMode(SimulationMode.NORMAL)}
                        className={`p-3 rounded border text-xs font-medium transition-all ${
                            simulationMode === SimulationMode.NORMAL 
                            ? 'bg-primary/20 border-primary text-primary' 
                            : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                        }`}
                    >
                        <Play size={16} className="mx-auto mb-1"/> Normal
                    </button>
                    <button 
                        onClick={() => setSimulationMode(SimulationMode.SPIKE)}
                        className={`p-3 rounded border text-xs font-medium transition-all ${
                            simulationMode === SimulationMode.SPIKE 
                            ? 'bg-rose-500/20 border-rose-500 text-rose-500' 
                            : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                        }`}
                    >
                        <TrendingUp size={16} className="mx-auto mb-1"/> Spike
                    </button>
                     <button 
                        onClick={() => setSimulationMode(SimulationMode.IDLE)}
                        className={`p-3 rounded border text-xs font-medium transition-all ${
                            simulationMode === SimulationMode.IDLE 
                            ? 'bg-zinc-700/50 border-zinc-600 text-zinc-200' 
                            : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                        }`}
                    >
                        <Square size={16} className="mx-auto mb-1"/> Stop
                    </button>
                </div>
            </div>

            {/* Financial Health KPIs */}
            <div className="space-y-4">
                 
                 {/* Main KPI: EMD */}
                 <div className="relative group">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-lg blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
                    <div className="relative bg-surface border border-emerald-500/30 rounded-lg p-5">
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-emerald-400/80 text-xs font-bold uppercase tracking-widest">Effective Margin Delta</span>
                            <Wallet size={16} className="text-emerald-400" />
                        </div>
                        <div className="text-3xl font-bold text-zinc-100 font-mono tracking-tight">
                            ${financials.totalSaved.toFixed(2)}
                        </div>
                        <div className="text-xs text-emerald-500/70 mt-1 font-medium flex items-center gap-1">
                            <ArrowRight size={10} /> Net Margin Protected
                        </div>
                    </div>
                 </div>

                 {/* Spend & Projections */}
                 <div className="grid grid-cols-2 gap-4">
                    <StatCard 
                        title="Real-time Spend"
                        value={`$${financials.totalSpend.toFixed(2)}`}
                        icon={DollarSign}
                        trend={financials.variance > 0 ? 'down' : 'neutral'}
                        color={financials.variance > 0.2 ? 'text-rose-500' : 'text-zinc-400'}
                    />
                    <StatCard 
                        title="Runway Days"
                        value={`${financials.currentRunwayDays.toFixed(1)}d`}
                        icon={TrendingUp}
                        trend={financials.currentRunwayDays < 150 ? 'down' : 'up'}
                        color={financials.currentRunwayDays < 150 ? 'text-amber-500' : 'text-emerald-500'}
                    />
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <StatCard 
                        title="Proj. Spend (6h)"
                        value={`$${projectedSpend6h.toFixed(2)}`}
                        icon={Clock}
                        color="text-zinc-400"
                    />
                    <StatCard 
                        title="Proj. Spend (24h)"
                        value={`$${projectedSpend24h.toFixed(2)}`}
                        icon={Clock}
                        color="text-zinc-400"
                    />
                 </div>
            </div>

            {/* AI Optimization Recommendations */}
            <div className="bg-surface border border-zinc-800 rounded-lg p-5">
                <div className="flex items-center gap-2 mb-4">
                    <Zap size={16} className="text-indigo-400" />
                    <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Optimization Plan</h3>
                </div>
                
                {!analysisResult && !isAnalyzing && (
                    <div className="text-center py-6 text-zinc-600">
                        <BarChart3 className="mx-auto mb-2 opacity-50" size={24} />
                        <p className="text-xs">No analysis generated yet.</p>
                    </div>
                )}
                
                {isAnalyzing && (
                     <div className="flex flex-col items-center justify-center py-6 gap-3">
                        <RefreshCw className="animate-spin text-indigo-500" size={20} />
                        <p className="text-xs text-zinc-500 animate-pulse">Running financial inference analysis...</p>
                    </div>
                )}

                {analysisResult && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 space-y-4">
                         <div className="text-xs text-zinc-300 italic border-l-2 border-indigo-500 pl-3 py-1">
                            "{analysisResult.summary}"
                        </div>
                        <div className="space-y-2">
                            {analysisResult.recommendations.map((rec, idx) => (
                                <div key={idx} className="bg-zinc-900/50 border border-zinc-800 p-3 rounded-md hover:border-indigo-500/50 transition-colors">
                                    <div className="flex justify-between items-start mb-1">
                                        <div className="text-xs font-semibold text-indigo-300">{rec.action}</div>
                                        <div className={`text-[10px] px-1.5 py-0.5 rounded ${
                                            rec.confidence === 'High' ? 'bg-emerald-900/30 text-emerald-400' : 'bg-zinc-800 text-zinc-400'
                                        }`}>
                                            {rec.confidence} Conf.
                                        </div>
                                    </div>
                                    <div className="text-[10px] text-zinc-500 mb-2">{rec.trigger}</div>
                                    <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                                        <CheckCircle2 size={10} />
                                        {rec.impact}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* Middle Column: Visualization (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-6">
            <FinancialChart data={chartData} threshold={HOURLY_BUDGET_CAP * 60 * 1.2} />
            
            <div className="flex-1 bg-surface border border-zinc-800 rounded-lg p-6 flex flex-col">
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h3 className="text-sm font-semibold text-zinc-300">Live Control Plane</h3>
                        <p className="text-xs text-zinc-500 mt-1">Automated inference gating logic</p>
                    </div>
                    <div className="px-2 py-1 bg-zinc-900 border border-zinc-800 rounded text-[10px] text-zinc-400 font-mono">
                        Target Cap: ${(HOURLY_BUDGET_CAP * 60).toFixed(2)}/hr
                    </div>
                </div>

                <div className="space-y-6">
                    <div>
                         <div className="flex items-center justify-between text-xs mb-2">
                            <span className="text-zinc-400">Current Burn Velocity</span>
                            <span className={`font-mono font-bold ${financials.hourlySpendMA > HOURLY_BUDGET_CAP ? 'text-rose-500' : 'text-zinc-300'}`}>
                                ${(financials.hourlySpendMA * 60).toFixed(2)}/hr
                            </span>
                        </div>
                        {/* Visual Bar for Budget usage */}
                        <div className="relative h-6 bg-zinc-900 rounded-lg overflow-hidden border border-zinc-800/50">
                            <div 
                                className={`absolute top-0 left-0 h-full transition-all duration-500 ${
                                    financials.hourlySpendMA > HOURLY_BUDGET_CAP * 1.5 ? 'bg-rose-500' :
                                    financials.hourlySpendMA > HOURLY_BUDGET_CAP ? 'bg-amber-500' : 'bg-indigo-500'
                                }`}
                                style={{ width: `${Math.min((financials.hourlySpendMA / (HOURLY_BUDGET_CAP * 2)) * 100, 100)}%` }}
                            ></div>
                            {/* Threshold Marker */}
                            <div className="absolute top-0 bottom-0 w-0.5 bg-white/30 left-1/2 z-10"></div>
                        </div>
                         <div className="flex justify-between text-[10px] text-zinc-600 font-mono uppercase mt-1.5 px-0.5">
                            <span>Safe Zone</span>
                            <span>Limit</span>
                            <span>Critical</span>
                        </div>
                    </div>

                    <div className="space-y-3 pt-4 border-t border-zinc-800/50">
                        <h4 className="text-xs font-semibold text-zinc-500 uppercase">Active Protocols</h4>
                        
                        <div className={`p-3 rounded border transition-colors flex items-center justify-between ${
                            financials.variance > 0.15 
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-200' 
                            : 'bg-zinc-900/50 border-zinc-800 text-zinc-500'
                        }`}>
                            <div className="flex items-center gap-3">
                                <div className={`w-2 h-2 rounded-full ${financials.variance > 0.15 ? 'bg-amber-500 animate-pulse' : 'bg-zinc-700'}`}></div>
                                <div className="text-xs">
                                    <div className="font-medium">Protocol A: Downgrade High-Tier</div>
                                    <div className="text-[10px] opacity-70">Trigger: Variance > 15%</div>
                                </div>
                            </div>
                            <Activity size={14} />
                        </div>

                         <div className={`p-3 rounded border transition-colors flex items-center justify-between ${
                            financials.variance > 0.5 
                            ? 'bg-rose-500/10 border-rose-500/30 text-rose-200' 
                            : 'bg-zinc-900/50 border-zinc-800 text-zinc-500'
                        }`}>
                            <div className="flex items-center gap-3">
                                <div className={`w-2 h-2 rounded-full ${financials.variance > 0.5 ? 'bg-rose-500 animate-pulse' : 'bg-zinc-700'}`}></div>
                                <div className="text-xs">
                                    <div className="font-medium">Protocol B: Deny Non-Critical</div>
                                    <div className="text-[10px] opacity-70">Trigger: Variance > 50%</div>
                                </div>
                            </div>
                            <Shield size={14} />
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* Right Column: Live Logs (3 cols) */}
        <div className="lg:col-span-3 h-[600px] lg:h-auto">
            <DecisionLog decisions={decisions} />
        </div>

      </div>
    </div>
  );
};

export default App;