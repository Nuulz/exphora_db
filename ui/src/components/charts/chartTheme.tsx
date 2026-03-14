import React from "react";
import { Loader2, AlertCircle } from "lucide-react";

// Standard Chart Theme Colors & Styling
export const CHART_THEME = {
    colors: {
        primary: "#8b5cf6", // violet-500
        secondary: "#3f3f46", // zinc-700
        grid: "#27272a", // zinc-800
        text: {
            axis: "#71717a", // zinc-500
            label: "#a1a1aa", // zinc-400
        },
        tooltip: {
            bg: "rgba(139,92,246,0.1)", // cursor fill
        }
    },
    font: {
        size: 11,
        family: "monospace"
    },
    margins: { left: 0, right: 16, top: 4, bottom: 4 }
};

// Common Custom Tooltip used in multiple charts (Frequency, Bar, etc.)
// Assumes payload has { name, count/value, pct? } mapping
export const ChartTooltip = ({ active, payload, labelPrefix = "registros" }: { active?: boolean; payload?: any[]; labelPrefix?: string }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    const val = payload[0].value ?? d.count;
    
    return (
        <div className="panel px-3 py-2 text-xs">
            <div className="text-zinc-300 font-mono mb-1">{d.name}</div>
            <div className="text-zinc-400">{Number(val).toLocaleString()} {labelPrefix}</div>
            {d.pct !== undefined && (
                <div className="text-violet-400">{d.pct}% del total</div>
            )}
        </div>
    );
};

// Standard Loading Overlay for Charts
export const ChartLoadingOverlay = () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900/50 backdrop-blur-sm z-10 w-full h-full rounded-b-md">
        <Loader2 className="animate-spin text-zinc-500 mb-2" size={24} />
    </div>
);

// Standard Error Overlay for Charts
export const ChartErrorOverlay = ({ error }: { error: string }) => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900/80 z-10 p-4 text-center w-full h-full rounded-b-md">
        <AlertCircle className="text-red-400 mb-2" size={24} />
        <div className="text-red-400 text-sm font-semibold mb-1">Error al procesar</div>
        <div className="text-zinc-500 text-xs truncate w-full max-w-xs">{error}</div>
    </div>
);
