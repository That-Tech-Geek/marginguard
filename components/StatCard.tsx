import React from 'react';
import { LucideIcon } from 'lucide-react';

interface Props {
  title: string;
  value: string | number;
  subValue?: string;
  trend?: 'up' | 'down' | 'neutral';
  icon: LucideIcon;
  color?: string;
}

const StatCard: React.FC<Props> = ({ title, value, subValue, trend, icon: Icon, color = 'text-zinc-400' }) => {
  return (
    <div className="bg-surface border border-zinc-800 rounded-lg p-4 flex flex-col justify-between hover:border-zinc-700 transition-all">
      <div className="flex justify-between items-start mb-2">
        <span className="text-zinc-500 text-xs font-medium uppercase tracking-wider">{title}</span>
        <Icon size={16} className={color} />
      </div>
      <div>
        <div className="text-2xl font-bold text-zinc-100 font-mono">{value}</div>
        {subValue && (
          <div className={`text-xs mt-1 ${
            trend === 'up' ? 'text-emerald-500' : 
            trend === 'down' ? 'text-rose-500' : 'text-zinc-500'
          }`}>
            {subValue}
          </div>
        )}
      </div>
    </div>
  );
};

export default StatCard;