// ─── GRÁFICO DE ÁREA (clon RN del SalesAreaChart de la web) ──────────────────
// Misma estética que el gráfico recharts/shadcn de la web: curva natural,
// gradiente de marca (opacity 1 → 0.1), grid horizontal fino, ticks de eje X
// con día+mes en español, tooltip flotante con punto activo, selects nativos.
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Line, Defs, LinearGradient, Stop, Circle, Text as SvgText } from 'react-native-svg';
import { colors } from '../config/theme';
import { Sel } from './UI';

export const RANGE_OPTIONS = [
  { value: '7d', label: 'Últimos 7 días', days: 7 },
  { value: '30d', label: 'Últimos 30 días', days: 30 },
  { value: '90d', label: 'Últimos 3 meses', days: 90 },
  { value: '180d', label: 'Últimos 6 meses', days: 180 },
];

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const dayLabel = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
};
const curSymbol = (c: string) => (c === 'EUR' ? '€' : '$');
const fmt = (n: number) => new Intl.NumberFormat('es-CU', { minimumFractionDigits: 2 }).format(n || 0);

// Catmull-Rom → Bézier cúbica: el equivalente del type="natural" de recharts.
const smoothPath = (pts: { x: number; y: number }[]) => {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
};

const H = 260; // h-[260px] de la web
const M = { top: 10, right: 8, left: 8, bottom: 24 }; // margin del AreaChart web

const SalesAreaChart = ({ analytics, fallback, range, onRange, cur, onCur }: {
  analytics: any;
  fallback: { date: string; total: number }[];
  range: string;
  onRange: (r: string) => void;
  cur: string;
  onCur: (c: string) => void;
}) => {
  const [width, setWidth] = useState(0);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const currencies: string[] = analytics?.currencies?.length
    ? analytics.currencies
    : Object.keys(analytics?.trend30ByCurrency || {});
  const byCur = analytics?.trend30ByCurrency || {};
  const series: { date: string; total: number }[] =
    cur === 'all'
      ? (analytics?.trend30 || []).map((d: any) => ({ ...d }))
      : (byCur[cur] || []);
  const hasData = series.some((d) => d.total > 0);
  const rangeLabel = RANGE_OPTIONS.find((r) => r.value === range)?.label || '';

  // Layout del gráfico (mismos márgenes que recharts en la web)
  const w = Math.max(width, 0);
  const innerW = Math.max(w - M.left - M.right, 10);
  const innerH = H - M.top - M.bottom;
  const maxTotal = Math.max(1, ...series.map((d) => d.total));

  const pts = useMemo(() => {
    if (series.length === 0) return [];
    return series.map((d, i) => ({
      x: M.left + (series.length === 1 ? innerW / 2 : (i / (series.length - 1)) * innerW),
      y: M.top + innerH - (Math.max(0, d.total) / maxTotal) * innerH,
    }));
  }, [series.length, innerW, innerH, maxTotal, w]);

  const lineD = smoothPath(pts);
  const areaD = pts.length > 1 ? `${lineD} L ${pts[pts.length - 1].x} ${M.top + innerH} L ${pts[0].x} ${M.top + innerH} Z` : '';
  const gradId = `fill-sales-${cur === 'all' ? 'all' : cur}`.replace(/[^a-zA-Z0-9-]/g, '');

  // Ticks del eje X: la web pide minTickGap 28 — mostramos ~cada N puntos
  const tickEvery = Math.max(1, Math.ceil(series.length / Math.max(2, Math.floor(innerW / 56))));

  const onTouch = (evt: any) => {
    if (pts.length === 0 || !evt?.locationX) { setActiveIdx(null); return; }
    const x = evt.locationX;
    let best = 0, bestDist = Infinity;
    pts.forEach((p, i) => {
      const dist = Math.abs(p.x - x);
      if (dist < bestDist) { bestDist = dist; best = i; }
    });
    setActiveIdx(best);
  };

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ backgroundColor: colors.bgCard, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 20 }}
    >
      {/* Header: título + selects nativos (igual que la web) */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <View style={{ flexShrink: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>Ingresos por día</Text>
          <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
            {rangeLabel}{cur !== 'all' ? ` · solo ${cur}` : ''}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {currencies.length > 1 && (
            <Sel
              style={{ minWidth: 130 }}
              value={cur}
              onValueChange={onCur}
              items={[{ label: 'Todas las monedas', value: 'all' }, ...currencies.map((c) => ({ label: c, value: c }))]}
            />
          )}
          <Sel
            style={{ minWidth: 140 }}
            value={range}
            onValueChange={onRange}
            items={RANGE_OPTIONS.map((r) => ({ label: r.label, value: r.value }))}
          />
        </View>
      </View>

      {hasData && w > 0 ? (
        <View style={{ height: H }}>
          <Svg width={w} height={H} onTouchStart={onTouch} onTouchMove={onTouch} onTouchEnd={() => {}}>
            <Defs>
              <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="5%" stopColor={colors.primary} stopOpacity={1} />
                <Stop offset="95%" stopColor={colors.primary} stopOpacity={0.1} />
              </LinearGradient>
            </Defs>

            {/* CartesianGrid vertical={false} */}
            {[0.25, 0.5, 0.75, 1].map((f) => {
              const y = M.top + innerH * f;
              return <Line key={f} x1={M.left} y1={y} x2={w - M.right} y2={y} stroke={colors.border} strokeWidth={1} />;
            })}

            {/* Área + línea (strokeWidth 2 como la web) */}
            {areaD ? <Path d={areaD} fill={`url(#${gradId})`} stroke="none" /> : null}
            <Path d={lineD} fill="none" stroke={colors.primary} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

            {/* XAxis: tickLine/axisLine false, tickMargin 8 */}
            {pts.map((p, i) =>
              i % tickEvery === 0 || i === pts.length - 1 ? (
                <SvgText
                  key={i}
                  x={p.x}
                  y={H - 6}
                  fill={colors.textMuted}
                  fontSize={11}
                  textAnchor="middle"
                >{dayLabel(series[i].date)}</SvgText>
              ) : null
            )}

            {/* Tooltip: punto activo r=4 (activeDot de la web); cursor=false */}
            {activeIdx !== null && pts[activeIdx] ? (
              <Circle cx={pts[activeIdx].x} cy={pts[activeIdx].y} r={4} fill={colors.primary} stroke={colors.bgCard} strokeWidth={2} />
            ) : null}
          </Svg>

          {/* Tooltip flotante (ChartTooltipContent estilo shadcn) */}
          {activeIdx !== null && series[activeIdx] ? (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: Math.min(Math.max(pts[activeIdx].x - 70, 4), Math.max(w - 144, 4)),
                top: Math.max(pts[activeIdx].y - 64, 4),
                backgroundColor: colors.bgCard,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.border,
                paddingVertical: 6,
                paddingHorizontal: 10,
                width: 140,
                shadowColor: '#0F172A', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text }}>
                  {cur === 'all' ? 'Todas las monedas' : cur}
                </Text>
              </View>
              <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>{dayLabel(series[activeIdx].date)}</Text>
              <Text style={{ fontSize: 14, fontWeight: '800', color: colors.text }}>
                {cur === 'all' ? '' : curSymbol(cur)}{fmt(series[activeIdx].total)}
              </Text>
            </View>
          ) : null}
        </View>
      ) : analytics ? (
        <Text style={{ paddingVertical: 40, textAlign: 'center', fontSize: 13, color: colors.textMuted }}>
          Aún no hay ventas registradas en este período.
        </Text>
      ) : fallback.length > 0 && w > 0 ? (
        /* Fallback offline: mini barras (igual que la web) */
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 90 }}>
          {fallback.map((d) => (
            <View key={d.date} style={{ flex: 1, alignItems: 'center' }}>
              <View style={{
                height: Math.max(4, (d.total / Math.max(1, ...fallback.map((x) => x.total))) * 70),
                backgroundColor: colors.primary, borderRadius: 4, width: '60%',
              }} />
              <Text style={{ fontSize: 9, color: colors.textMuted, marginTop: 4 }}>{d.date.slice(5)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {cur === 'all' && hasData && (
        <Text style={{ marginTop: 10, fontSize: 11, color: colors.textMuted }}>
          La curva suma las monedas para la tendencia; selecciona una moneda para verla aislada (nunca se convierten entre sí).
        </Text>
      )}
    </View>
  );
};

export default SalesAreaChart;
