import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { useChartTheme, axisProps, ChartTooltip, Legend } from './charts';

/** Area chart over days. series: [{ key, name, color: 'primary' | 'secondary' }] — one shared unit, one axis. */
export default function TrendChart({ data, series, format = (v) => v, height = 240 }) {
  const t = useChartTheme();
  return (
    <div>
      {series.length > 1 && (
        <div className="mb-2 px-1">
          <Legend items={series.map((s) => [s.name, t[s.color]])} />
        </div>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={t[s.color]} stopOpacity={0.22} />
                <stop offset="1" stopColor={t[s.color]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke={t.grid} vertical={false} />
          <XAxis dataKey="day" {...axisProps(t)} interval="preserveStartEnd" minTickGap={24} />
          <YAxis {...axisProps(t)} width={56} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : v)} />
          <Tooltip content={<ChartTooltip format={format} />} cursor={{ stroke: t.axis, strokeDasharray: '3 3' }} />
          {series.map((s) => (
            <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={t[s.color]} strokeWidth={2} fill={`url(#g-${s.key})`} activeDot={{ r: 5, strokeWidth: 2, stroke: t.surface }} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
