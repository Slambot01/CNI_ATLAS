'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

function formatDate(timestamp) {
  if (!timestamp) return '';
  try {
    const d = new Date(timestamp);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return timestamp;
  }
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl px-4 py-3"
      style={{
        background: 'rgba(12, 18, 32, 0.95)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
      }}
    >
      <p className="text-xs font-semibold mb-2" style={{ color: 'var(--cni-text)' }}>
        {formatDate(label)}
      </p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 py-0.5">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: entry.color }}
          />
          <span className="text-[11px]" style={{ color: 'var(--cni-muted)' }}>
            {entry.name}:
          </span>
          <span className="text-[11px] font-semibold" style={{ color: entry.color }}>
            {entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function CustomLegend({ payload }) {
  if (!payload?.length) return null;
  return (
    <div className="flex items-center justify-center gap-5 mb-2">
      {payload.map((entry) => (
        <div key={entry.value} className="flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: entry.color }}
          />
          <span className="text-[11px]" style={{ color: 'var(--cni-muted)' }}>
            {entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function TimelineChart({ data }) {
  if (!data || data.length === 0) return null;

  const chartData = data.map((d) => ({
    ...d,
    date: formatDate(d.timestamp),
  }));

  return (
    <div style={{ width: '100%', height: 250 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id="gradFiles" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.01} />
            </linearGradient>
            <linearGradient id="gradDeps" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.01} />
            </linearGradient>
            <linearGradient id="gradHealth" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255, 255, 255, 0.04)"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: '#64748b' }}
            axisLine={{ stroke: 'rgba(255, 255, 255, 0.06)' }}
            tickLine={false}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 10, fill: '#64748b' }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: '#64748b' }}
            axisLine={false}
            tickLine={false}
            width={35}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend content={<CustomLegend />} />
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="files"
            name="Files"
            stroke="#3b82f6"
            strokeWidth={2}
            fill="url(#gradFiles)"
            dot={{ r: 3, fill: '#3b82f6', strokeWidth: 0 }}
            activeDot={{ r: 5, fill: '#3b82f6', stroke: 'rgba(59, 130, 246, 0.3)', strokeWidth: 4 }}
          />
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="dependencies"
            name="Dependencies"
            stroke="#8b5cf6"
            strokeWidth={2}
            fill="url(#gradDeps)"
            dot={{ r: 3, fill: '#8b5cf6', strokeWidth: 0 }}
            activeDot={{ r: 5, fill: '#8b5cf6', stroke: 'rgba(139, 92, 246, 0.3)', strokeWidth: 4 }}
          />
          <Area
            yAxisId="right"
            type="monotone"
            dataKey="health"
            name="Health"
            stroke="#22c55e"
            strokeWidth={2}
            fill="url(#gradHealth)"
            dot={{ r: 3, fill: '#22c55e', strokeWidth: 0 }}
            activeDot={{ r: 5, fill: '#22c55e', stroke: 'rgba(34, 197, 94, 0.3)', strokeWidth: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
