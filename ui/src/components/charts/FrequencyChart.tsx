import React, { useRef, useMemo, useCallback } from "react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from "recharts";
import { X, Download } from "lucide-react";
import { useAppStore } from "../../store/appStore";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { ChartConfig } from "../../types";
import { useChartData } from "../../hooks/useChartData";
import { CHART_THEME, ChartTooltip, ChartLoadingOverlay, ChartErrorOverlay } from "./chartTheme";

interface FrequencyChartProps {
    tabId: string;
    col: string;
    onClose?: () => void;
    isWidget?: boolean;
}

export function FrequencyChart({ tabId, col, onClose, isWidget }: FrequencyChartProps) {
    const ui = useAppStore((s) => s.tabUi[tabId])!;
    const tab = useAppStore((s) => s.tabs.find((t) => t.id === tabId))!;
    const chartRef = useRef<HTMLDivElement>(null);

    useFocusTrap(chartRef, !isWidget, !isWidget, !isWidget);

    // Standardize config 
    const config = useMemo<ChartConfig>(() => ({
        type: "histogram",
        xColumn: col,
        limit: 20,
        sort: "desc"
    }), [col]);

    const { data: result, loading, error } = useChartData(config, tab.records as Record<string, unknown>[], ui.filteredIndices);
    const total = ui.filteredIndices.length;

    // Transform ChartDataResult to Recharts expected format
    const chartData = useMemo(() => {
        if (!result) return [];
        return result.categories.map((cat: { name: string }, idx: number) => {
            const count = result.series[0]?.data[idx] ?? 0;
            return {
                name: cat.name,
                count,
                pct: total > 0 ? ((count / total) * 100).toFixed(1) : "0",
            };
        });
    }, [result, total]);

    const exportPng = useCallback(() => {
        const svgEl = chartRef.current?.querySelector("svg");
        if (!svgEl) return;
        const svgData = new XMLSerializer().serializeToString(svgEl);
        const canvas = document.createElement("canvas");
        canvas.width = 480;
        canvas.height = 400;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#18181b";
        ctx.fillRect(0, 0, 480, 400);
        const img = new Image();
        img.onload = () => {
            ctx.drawImage(img, 0, 0);
            const a = document.createElement("a");
            a.download = `${col}_frecuencias.png`;
            a.href = canvas.toDataURL("image/png");
            a.click();
        };
        img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
    }, [col]);

    return (
        <div
            className={isWidget ? "w-full h-full relative flex flex-col" : "w-full h-full flex flex-col"}
            style={isWidget ? { minHeight: "300px" } : {}}
            onClick={isWidget ? undefined : (e) => e.stopPropagation()}
        >
            {/* Header */}
            {!isWidget && (
                <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0 bg-zinc-900/50">
                    <div>
                        <div className="text-zinc-100 font-semibold text-sm">{col}</div>
                        <div className="text-zinc-500 text-xs">Top {chartData.length} valores por frecuencia</div>
                    </div>
                    <div className="flex gap-1">
                        <button className="btn ghost h-7 px-2 text-xs" onClick={exportPng}>
                            <Download size={12} /> PNG
                        </button>
                        {onClose && (
                            <button className="btn ghost h-7 w-7 p-0" onClick={onClose}>
                                <X size={13} />
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Chart */}
            <div ref={chartRef} className="flex-1 p-3 relative">
                {loading && <ChartLoadingOverlay />}
                {error && <ChartErrorOverlay error={error} />}

                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical" margin={CHART_THEME.margins}>
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.colors.grid} horizontal={false} />
                        <XAxis type="number" tick={{ fill: CHART_THEME.colors.text.axis, fontSize: CHART_THEME.font.size }} axisLine={false} tickLine={false} />
                        <YAxis
                            type="category"
                            dataKey="name"
                            width={110}
                            tick={{ fill: CHART_THEME.colors.text.label, fontSize: CHART_THEME.font.size, fontFamily: CHART_THEME.font.family }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(v) => (String(v).length > 14 ? String(v).slice(0, 13) + "…" : v)}
                        />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: CHART_THEME.colors.tooltip.bg }} />
                        <Bar dataKey="count" fill={CHART_THEME.colors.primary} radius={[0, 3, 3, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
