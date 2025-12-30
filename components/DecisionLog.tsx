import React from 'react';
import { SimulationDecision, DecisionType } from '../types';
import { ArrowRight, ShieldCheck, ShieldAlert, Ban } from 'lucide-react';

interface Props {
  decisions: SimulationDecision[];
}

const DecisionLog: React.FC<Props> = ({ decisions }) => {
  return (
    <div className="flex flex-col h-full bg-surface border border-zinc-800 rounded-lg overflow-hidden">
      <div className="p-3 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center">
        <h3 className="text-sm font-semibold text-zinc-300">Live Decision Stream</h3>
        <span className="text-xs text-zinc-500 font-mono animate-pulse">● LIVE</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-hide">
        {decisions.length === 0 && (
          <div className="text-center text-zinc-600 text-xs mt-10">No traffic detected. Start simulation.</div>
        )}
        {decisions.slice().reverse().map((d) => (
          <div key={d.requestId} className="flex items-center justify-between p-2 rounded bg-zinc-900/30 border border-zinc-800/50 text-xs hover:bg-zinc-800 transition-colors">
            <div className="flex items-center gap-3">
              <div className={`p-1.5 rounded-md ${
                d.decision === DecisionType.ALLOW ? 'bg-emerald-500/10 text-emerald-500' :
                d.decision === DecisionType.DOWNGRADE ? 'bg-amber-500/10 text-amber-500' :
                'bg-rose-500/10 text-rose-500'
              }`}>
                {d.decision === DecisionType.ALLOW && <ShieldCheck size={14} />}
                {d.decision === DecisionType.DOWNGRADE && <ShieldAlert size={14} />}
                {d.decision === DecisionType.DENY && <Ban size={14} />}
              </div>
              <div className="flex flex-col">
                 <div className="flex items-center gap-2">
                    <span className="font-mono text-zinc-400">{d.requestId.slice(-4)}</span>
                    <span className="text-zinc-500">{new Date(d.timestamp).toLocaleTimeString()}</span>
                 </div>
                 <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-zinc-300 font-medium">{d.originalModel}</span>
                    {d.decision !== DecisionType.DENY && d.originalModel !== d.assignedModel && (
                        <>
                            <ArrowRight size={10} className="text-zinc-600" />
                            <span className="text-amber-400">{d.assignedModel}</span>
                        </>
                    )}
                 </div>
              </div>
            </div>
            <div className="text-right">
                <div className="font-mono text-zinc-300">${d.costIncurred.toFixed(4)}</div>
                {d.savedAmount > 0 && (
                    <div className="text-emerald-500 font-mono text-[10px]">Saved ${d.savedAmount.toFixed(4)}</div>
                )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DecisionLog;