import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { ForecastPoint } from '../types';

interface Props {
  data: ForecastPoint[];
  threshold: number;
}

const FinancialChart: React.FC<Props> = ({ data, threshold }) => {
  return (
    <div className="h-64 w-full bg-surface border border-zinc-800 rounded-lg p-4">
       <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-semibold text-zinc-300">Predictive Spend Variance (Rolling 1h)</h3>
        <div className="flex gap-4 text-xs">
            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-indigo-500"></div>Actual</div>
            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500"></div>Forecast</div>
             <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-rose-500"></div>Risk Threshold</div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
          <XAxis 
            dataKey="time" 
            stroke="#71717a" 
            tick={{fontSize: 10}} 
            tickLine={false}
            axisLine={false}
          />
          <YAxis 
            stroke="#71717a" 
            tick={{fontSize: 10}} 
            tickFormatter={(value) => `$${value}`} 
            tickLine={false}
            axisLine={false}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', fontSize: '12px' }}
            itemStyle={{ color: '#e4e4e7' }}
          />
          <ReferenceLine y={threshold} stroke="#ef4444" strokeDasharray="3 3" label={{ position: 'right', value: 'Limit', fill: '#ef4444', fontSize: 10 }} />
          <Area type="monotone" dataKey="forecast" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorForecast)" isAnimationActive={false} />
          <Area type="monotone" dataKey="actual" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorActual)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default FinancialChart;