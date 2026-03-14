import React, { useMemo } from "react";
import {
    BarChart as RechartsBarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
    Brush
} from "recharts";
import { useAppStore } from "../../store/appStore";
import { ChartConfig } from "../../types";
import { useChartData } from "../../hooks/useChartData";
import { CHART_THEME, ChartTooltip, ChartLoadingOverlay, ChartErrorOverlay } from "./chartTheme";

interface BarChartProps {
    tabId: string;
    col: string; // the X axis column
    configOptions?: Partial<ChartConfig>;
}

export function BarChart({ tabId, col, configOptions }: BarChartProps) {
    const ui = useAppStore((s) => s.tabUi[tabId])!;
    const tab = useAppStore((s) => s.tabs.find((t) => t.id === tabId))!;

    // Standardize config 
    const config = useMemo<ChartConfig>(() => ({
        type: "bar",
        xColumn: col,
        sort: "none",
        ...configOptions
    }), [col, configOptions]);

    const { data: result, loading, error } = useChartData(config, tab.records as Record<string, unknown>[], ui.filteredIndices);

    // Transform ChartDataResult to Recharts expected format
    // Recharts expects array of objects like { name: "CatA", "sum(sales)": 150, "sum(profit)": 20 }
    const chartData = useMemo(() => {
        if (!result) return [];
        return result.categories.map((cat, idx) => {
            const point: any = { name: cat.name };
            result.series.forEach((s) => {
                point[s.name] = s.data[idx] ?? 0;
            });
            return point;
        });
    }, [result]);

    return (
        <div className="w-full h-full relative" style={{ minHeight: "300px" }}>
            {loading && <ChartLoadingOverlay />}
            {error && <ChartErrorOverlay error={error} />}

            {!loading && !error && chartData.length === 0 && (
                 <div className="absolute inset-0 flex items-center justify-center text-zinc-500 text-sm">
                     No hay datos suficientes para graficar
                 </div>
            )}

            {chartData.length > 0 && (
                <ResponsiveContainer width="100%" height="100%">
                    <RechartsBarChart data={chartData} margin={CHART_THEME.margins}>
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.colors.grid} vertical={false} />
                        <XAxis 
                            dataKey="name" 
                            tick={{ fill: CHART_THEME.colors.text.label, fontSize: CHART_THEME.font.size, fontFamily: CHART_THEME.font.family }} 
                            axisLine={false} 
                            tickLine={false} 
                            tickFormatter={(v) => (String(v).length > 14 ? String(v).slice(0, 13) + "…" : v)}
                        />
                        <YAxis 
                            tick={{ fill: CHART_THEME.colors.text.axis, fontSize: CHART_THEME.font.size }} 
                            axisLine={false} 
                            tickLine={false} 
                        />
                        <Tooltip content={<ChartTooltip labelPrefix="valor" />} cursor={{ fill: CHART_THEME.colors.tooltip.bg }} />
                        
                        {result?.series.length && result.series.length > 1 && (
                            <Legend wrapperStyle={{ fontSize: '12px', color: CHART_THEME.colors.text.label }} />
                        )}

                        {result?.series.map((s, i) => (
                             // Assign different colors if multiple series, fallback to primary if only one
                             <Bar 
                                key={s.name} 
                                dataKey={s.name} 
                                fill={i === 0 ? CHART_THEME.colors.primary : "#c084fc"} 
                                radius={[3, 3, 0, 0]} 
                             />
                        ))}

                        {chartData.length > 15 && (
                            <Brush 
                                dataKey="name" 
                                height={20} 
                                stroke={CHART_THEME.colors.primary} 
                                fill={CHART_THEME.colors.tooltip.bg} 
                                tickFormatter={() => ""} 
                            />
                        )}
                    </RechartsBarChart>
                </ResponsiveContainer>
            )}
        </div>
    );
}
