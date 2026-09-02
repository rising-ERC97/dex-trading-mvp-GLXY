import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dispose, init, type Chart, type KLineData } from 'klinecharts';
import type { CandleInterval } from '@dex/shared';
import { api } from '../lib/api.js';
import { useMarketStore } from '../stores/market.js';

const INTERVALS: CandleInterval[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

/** Main-pane overlay indicators (drawn on the candles) the user can toggle. */
const OVERLAYS = ['MA', 'EMA', 'BOLL'] as const;
/** Sub-pane indicators (their own row below the candles). */
const SUBS = ['VOL', 'MACD', 'RSI', 'KDJ'] as const;
type Overlay = (typeof OVERLAYS)[number];
type Sub = (typeof SUBS)[number];

export function ChartPanel() {
  const marketId = useMarketStore((s) => s.selectedId);
  const [interval, setIntervalValue] = useState<CandleInterval>('15m');
  const [overlay, setOverlay] = useState<Overlay>('MA');
  const [sub, setSub] = useState<Sub>('VOL');

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<Chart | null>(null);
  const overlayPaneRef = useRef<string | null>(null);
  const subPaneRef = useRef<string | null>(null);

  const { data } = useQuery({
    queryKey: ['candles', marketId, interval],
    queryFn: () => api.candles(marketId, interval, 300),
    refetchInterval: 5000,
  });

  // ---- chart lifecycle (init once) ----
  useEffect(() => {
    const el = containerRef.current;
    if (el === null) return;
    const chart = init(el, {
      styles: {
        grid: { horizontal: { color: '#2a333e' }, vertical: { color: '#2a333e' } },
        candle: {
          bar: {
            upColor: '#2a9d78',
            downColor: '#d35a6a',
            upBorderColor: '#3db892',
            downBorderColor: '#d35a6a',
            upWickColor: '#3db892',
            downWickColor: '#d35a6a',
          },
          priceMark: {
            high: { color: '#c0c8d0', textSize: 11 },
            low: { color: '#c0c8d0', textSize: 11 },
            last: { text: { color: '#14181e', size: 12, weight: '600' } },
          },
          // OHLCV legend — larger type + solid panel (was tiny faint overlay text)
          tooltip: {
            showRule: 'always',
            showType: 'rect',
            offsetLeft: 8,
            offsetTop: 8,
            rect: {
              position: 'fixed',
              paddingLeft: 10,
              paddingRight: 10,
              paddingTop: 8,
              paddingBottom: 8,
              borderRadius: 6,
              borderSize: 1,
              borderColor: '#3a4552',
              color: 'rgba(26, 32, 40, 0.94)',
            },
            text: {
              size: 13,
              weight: '600',
              family: 'Pretendard Variable, Pretendard, sans-serif',
              color: '#e8eef4',
              marginLeft: 6,
              marginRight: 6,
              marginTop: 3,
              marginBottom: 3,
            },
          },
        },
        // MA / VOL legend — keep series colors, bump size/weight for contrast
        indicator: {
          tooltip: {
            showRule: 'always',
            showType: 'standard',
            offsetLeft: 8,
            offsetTop: 8,
            text: {
              size: 13,
              weight: '600',
              family: 'Pretendard Variable, Pretendard, sans-serif',
              color: '#e8eef4',
              marginLeft: 6,
              marginRight: 8,
              marginTop: 3,
              marginBottom: 3,
            },
          },
        },
        xAxis: {
          axisLine: { color: '#2a333e' },
          tickText: { color: '#b0b8c0', size: 12, weight: '500' },
        },
        yAxis: {
          axisLine: { color: '#2a333e' },
          tickText: { color: '#b0b8c0', size: 12, weight: '500' },
        },
        crosshair: {
          horizontal: {
            line: { color: '#6ec9b4' },
            text: { size: 12, weight: '600', backgroundColor: '#2a9d78', color: '#f2faf6' },
          },
          vertical: {
            line: { color: '#6ec9b4' },
            text: { size: 12, weight: '600', backgroundColor: '#2a9d78', color: '#f2faf6' },
          },
        },
      },
    });
    chartRef.current = chart ?? null;
    return () => {
      dispose(el);
      chartRef.current = null;
      overlayPaneRef.current = null;
      subPaneRef.current = null;
    };
  }, []);

  // ---- indicator selection (klinecharts v9: removeIndicator(paneId, name?)) ----
  useEffect(() => {
    const chart = chartRef.current;
    if (chart === null) return;
    if (overlayPaneRef.current !== null) chart.removeIndicator('candle_pane', overlayPaneRef.current);
    // overlay indicators share the main candle pane
    chart.createIndicator(overlay, true, { id: 'candle_pane' });
    overlayPaneRef.current = overlay;
  }, [overlay]);

  useEffect(() => {
    const chart = chartRef.current;
    if (chart === null) return;
    if (subPaneRef.current !== null) chart.removeIndicator(subPaneRef.current);
    const paneId = chart.createIndicator(sub, false);
    subPaneRef.current = typeof paneId === 'string' ? paneId : null;
  }, [sub]);

  // ---- data ----
  // Wire candles are already human decimal strings (jsonSafe of 1e8 bigints).
  const klines = useMemo<KLineData[]>(() => {
    if (data === undefined) return [];
    return [...data]
      .sort((a, b) => a.t - b.t)
      .filter((c, i, arr) => i === 0 || c.t !== arr[i - 1]!.t)
      .map((c) => ({
        timestamp: c.t,
        open: Number(c.o),
        high: Number(c.h),
        low: Number(c.l),
        close: Number(c.c),
        volume: Number(c.v),
      }));
  }, [data]);

  useEffect(() => {
    const chart = chartRef.current;
    if (chart === null || klines.length === 0) return;
    chart.applyNewData(klines); // klinecharts preserves zoom/pan across applyNewData
  }, [klines]);

  return (
    <div className="chart-panel">
      <div className="chart-toolbar">
        <div className="tabs chart-tabs" role="tablist" aria-label="Chart interval">
          {INTERVALS.map((iv) => (
            <button
              key={iv}
              type="button"
              role="tab"
              aria-selected={interval === iv}
              className={`tab ${interval === iv ? 'active' : ''}`}
              onClick={() => setIntervalValue(iv)}
            >
              {iv}
            </button>
          ))}
        </div>
        <div className="chart-indicators">
          <select
            aria-label="Main chart indicator"
            className="ind-select"
            value={overlay}
            onChange={(e) => setOverlay(e.target.value as Overlay)}
          >
            {OVERLAYS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <select
            aria-label="Lower chart indicator"
            className="ind-select"
            value={sub}
            onChange={(e) => setSub(e.target.value as Sub)}
          >
            {SUBS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="chart-container" ref={containerRef} data-testid="chart" />
    </div>
  );
}
