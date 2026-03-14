import React, { useState, useRef, useEffect } from "react";
import { X, PieChart, BarChart2, Activity } from "lucide-react";
import { useAppStore } from "../../store/appStore";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { WidgetConfig } from "../../types";

interface AddChartWizardProps {
    tabId: string;
    slot: number;
    onClose: () => void;
    onAdd: (widget: WidgetConfig) => void;
}

export function AddChartWizard({ tabId, slot, onClose, onAdd }: AddChartWizardProps) {
    const tabs = useAppStore((s) => s.tabs);
    const tab = tabs.find((t) => t.id === tabId);
    
    const [type, setType] = useState<"frequency" | "bar" | "line">("frequency");
    const [xColumn, setXColumn] = useState<string>(tab?.columns[0] || "");
    const [yColumn, setYColumn] = useState<string>("");
    const [title, setTitle] = useState("");

    const modalRef = useRef<HTMLDivElement>(null);
    useFocusTrap(modalRef);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.stopPropagation();
                onClose();
            }
        };
        const modal = modalRef.current;
        if (modal) {
            modal.addEventListener("keydown", handler);
            return () => modal.removeEventListener("keydown", handler);
        }
    }, [onClose]);

    if (!tab) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        const widget: WidgetConfig = {
            id: crypto.randomUUID(),
            slot,
            type,
            xColumn,
            title: title.trim() || undefined,
            yColumn: (type === "bar" || type === "line") && yColumn ? yColumn : undefined
        };
        
        onAdd(widget);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center animate-fade-in" onClick={onClose}>
            <div ref={modalRef} className="panel p-0 w-[420px] animate-fade-in overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
                    <div className="flex items-center gap-2">
                         <span className="text-zinc-100 font-semibold text-sm">Añadir gráfico (Slot {slot + 1})</span>
                    </div>
                    <button className="btn ghost h-7 w-7 p-0" onClick={onClose}>
                        <X size={13} />
                    </button>
                </div>
                
                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    {/* Select Type */}
                    <div className="space-y-2">
                        <label className="text-xs text-zinc-400 font-medium">Tipo de Gráfico</label>
                        <div className="grid grid-cols-3 gap-2">
                            <button
                                type="button"
                                onClick={() => setType("frequency")}
                                className={`flex flex-col items-center gap-2 p-3 rounded border transition-colors ${type === "frequency" ? "border-violet-500 bg-violet-500/10 text-violet-300" : "border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-500"}`}
                            >
                                <PieChart size={18} />
                                <span className="text-xs">Frecuencia</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setType("bar")}
                                className={`flex flex-col items-center gap-2 p-3 rounded border transition-colors ${type === "bar" ? "border-violet-500 bg-violet-500/10 text-violet-300" : "border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-500"}`}
                            >
                                <BarChart2 size={18} />
                                <span className="text-xs">Barras</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setType("line")}
                                className={`flex flex-col items-center gap-2 p-3 rounded border transition-colors ${type === "line" ? "border-violet-500 bg-violet-500/10 text-violet-300" : "border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-500"}`}
                            >
                                <Activity size={18} />
                                <span className="text-xs">Líneas</span>
                            </button>
                        </div>
                    </div>

                    {/* X Column */}
                    <div className="space-y-1">
                        <label className="text-xs text-zinc-400 font-medium">Columna X (Categoría / Eje X)</label>
                        <select
                            className="w-full text-sm bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                            value={xColumn}
                            onChange={(e) => setXColumn(e.target.value)}
                            required
                        >
                            {tab.columns.map((c) => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                    </div>

                    {/* Y Column (Optional / Only for Bar & Line) */}
                    {(type === "bar" || type === "line") && (
                        <div className="space-y-1 animate-fade-in">
                            <label className="text-xs text-zinc-400 font-medium">Columna Y (Opcional - Valor)</label>
                            <select
                                className="w-full text-sm bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                                value={yColumn}
                                onChange={(e) => setYColumn(e.target.value)}
                            >
                                <option value="">(Conteo por defecto)</option>
                                {tab.columns.map((c) => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                            <p className="text-[10px] text-zinc-500 pt-0.5">Si se deja vacío, contará el número de ocurrencias como el histograma.</p>
                        </div>
                    )}

                    {/* Title */}
                    <div className="space-y-1">
                        <label className="text-xs text-zinc-400 font-medium">Título (Opcional)</label>
                        <input
                            type="text"
                            placeholder="Mi gráfico..."
                            className="w-full text-sm bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                        />
                    </div>

                    <div className="pt-2 flex justify-end gap-2">
                        <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
                        <button type="submit" className="btn primary px-4 py-1.5 rounded">
                            Crear Gráfico
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
