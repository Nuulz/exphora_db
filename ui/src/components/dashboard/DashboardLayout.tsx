import React, { useState } from "react";
import { Plus, X, GripHorizontal, Maximize2, Minimize2, ZoomOut } from "lucide-react";
import { useAppStore } from "../../store/appStore";
import { WidgetConfig } from "../../types";
import { AddChartWizard } from "./AddChartWizard";
import { FrequencyChart } from "../charts/FrequencyChart";
import { BarChart } from "../charts/BarChart";
import { LineChart } from "../charts/LineChart";
import { invoke } from "@tauri-apps/api/core";
import { toViewState } from "../../types";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { createPortal } from "react-dom";
import { 
    DndContext, 
    DragEndEvent, 
    useSensor, 
    useSensors, 
    PointerSensor,
    DragStartEvent,
    DragOverlay,
    defaultDropAnimationSideEffects,
    useDraggable,
    useDroppable
} from "@dnd-kit/core";

interface DashboardLayoutProps {
    tabId: string;
}

const MAX_SLOTS = 3;

interface DashboardSlotProps {
    slotIndex: number;
    widget?: WidgetConfig;
    onRemove: (id: string) => void;
    onUpdateWidget: (id: string, updates: Partial<WidgetConfig>) => void;
    onAdd: (slotIndex: number) => void;
    renderChart: (w: WidgetConfig) => React.ReactNode;
}

function DashboardSlot({ slotIndex, widget, onRemove, onUpdateWidget, onAdd, renderChart }: DashboardSlotProps) {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [zoomScale, setZoomScale] = useState(1);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [titleInput, setTitleInput] = useState("");
    
    const { setNodeRef: setDroppableRef, isOver } = useDroppable({
        id: `slot-${slotIndex}`,
        data: { slotIndex, widget }
    });

    const { attributes, listeners, setNodeRef: setDraggableRef, isDragging } = useDraggable({
        id: `slot-${slotIndex}`, 
        data: { slotIndex, widget },
        disabled: !widget || isFullscreen // Disable drag when no widget or fullscreen
    });

    React.useEffect(() => {
        if (!isFullscreen) return;
        
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation(); // Explicit user constraint
                setIsFullscreen(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown, { capture: true });
        return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
    }, [isFullscreen]);

    const innerContent = (
        <div className="flex-1 p-2 relative w-full h-full overflow-hidden flex items-center justify-center">
            {widget ? (
                <TransformWrapper 
                    initialScale={1}
                    minScale={1}
                    maxScale={4}
                    disabled={isDragging} // Prevent zooming or panning when currently dragging the slot
                    onTransformed={(ref) => setZoomScale(ref.state.scale)}
                >
                    {({ resetTransform }) => (
                        <>
                            {/* Overlay zoom-reset action */}
                            {zoomScale > 1 && (
                                <button 
                                    onClick={() => resetTransform()} 
                                    className="absolute top-2 right-2 z-10 bg-zinc-800/80 hover:bg-zinc-700/80 text-violet-300 p-1.5 rounded-md shadow-md backdrop-blur-sm transition-colors"
                                    title="Restablecer Zoom"
                                >
                                    <ZoomOut size={14} />
                                </button>
                            )}
                            <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }} contentStyle={{ width: "100%", height: "100%" }}>
                                {renderChart(widget)}
                            </TransformComponent>
                        </>
                    )}
                </TransformWrapper>
            ) : null}
        </div>
    );

    const handleTitleDoubleClick = () => {
        if (!widget) return;
        setTitleInput(widget.title || "");
        setIsEditingTitle(true);
    };

    const handleTitleSave = () => {
        setIsEditingTitle(false);
        if (widget && titleInput.trim() !== (widget.title || "")) {
            onUpdateWidget(widget.id, { title: titleInput.trim() });
        }
    };

    const handleTitleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            handleTitleSave();
        } else if (e.key === "Escape") {
            setIsEditingTitle(false);
            e.stopPropagation();
        }
    };

    const containerStyle = isFullscreen 
        ? "fixed inset-0 z-[100] bg-zinc-950 p-6 flex flex-col backdrop-blur-sm"
        : `relative bg-zinc-900 border ${isOver ? 'border-violet-500/50 ring-1 ring-violet-500/50' : 'border-zinc-800'} rounded-lg overflow-hidden flex flex-col group min-h-[300px] transition-colors`;

    const content = (
        <div 
            ref={isFullscreen ? undefined : setDroppableRef} 
            className={containerStyle}
        >
            <div ref={isFullscreen ? undefined : setDraggableRef} className={`h-full w-full flex flex-col ${isDragging && !isFullscreen ? 'opacity-40' : 'opacity-100'} transition-opacity`}>
                {widget ? (
                    <>
                        {/* Slot Header */}
                        <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800/50 bg-zinc-900/50 shrink-0">
                            <div className="flex items-center gap-2 overflow-hidden">
                                {!isFullscreen && (
                                    <button 
                                        {...attributes} 
                                        {...listeners} 
                                        className="text-zinc-500 hover:text-zinc-300 cursor-grab active:cursor-grabbing focus:outline-none"
                                        title="Arrastrar para reordenar"
                                    >
                                        <GripHorizontal size={14} />
                                    </button>
                                )}
                                {isEditingTitle ? (
                                    <input 
                                        type="text"
                                        autoFocus
                                        value={titleInput}
                                        onChange={(e) => setTitleInput(e.target.value)}
                                        onBlur={handleTitleSave}
                                        onKeyDown={handleTitleKeyDown}
                                        onPointerDown={(e) => e.stopPropagation()} 
                                        className="text-xs font-semibold text-zinc-300 bg-zinc-800 border-none outline-none focus:ring-1 focus:ring-violet-500 rounded px-1 select-text cursor-text w-full mr-2"
                                    />
                                ) : (
                                    <span 
                                        onClick={handleTitleDoubleClick}
                                        className="text-xs font-semibold text-zinc-300 truncate pr-2 hover:text-white cursor-text transition-colors"
                                        title="Clic para editar título"
                                    >
                                        {widget.title || `${widget.type} - ${widget.xColumn}`}
                                    </span>
                                )}
                            </div>
                            
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => setIsFullscreen(!isFullscreen)}
                                    className="text-zinc-500 hover:text-violet-400 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                                    title={isFullscreen ? "Minimizar" : "Pantalla completa"}
                                >
                                    {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                                </button>
                                
                                <button 
                                    onClick={() => {
                                        if (isFullscreen) setIsFullscreen(false);
                                        onRemove(widget.id);
                                    }}
                                    className="text-zinc-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                                    title="Eliminar gráfico"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        </div>
                        {innerContent}
                    </>
                ) : (
                    <button
                        onClick={() => onAdd(slotIndex)}
                        className="flex-1 flex flex-col items-center justify-center gap-2 text-zinc-500 hover:text-violet-400 hover:bg-zinc-800/40 transition-colors border-2 border-dashed border-zinc-800 hover:border-violet-500/50 rounded-lg m-2"
                    >
                        <div className="w-10 h-10 rounded-full bg-zinc-800/50 flex items-center justify-center">
                            <Plus size={18} />
                        </div>
                        <span className="text-sm font-medium">Añadir gráfico</span>
                        <span className="text-xs opacity-60">Slot {slotIndex + 1}</span>
                    </button>
                )}
            </div>
        </div>
    );

    return isFullscreen ? createPortal(content, document.body) : content;
}


export function DashboardLayout({ tabId }: DashboardLayoutProps) {
    const ui = useAppStore((s) => s.tabUi[tabId]);
    const tab = useAppStore((s) => s.tabs.find((t) => t.id === tabId));
    const updateTabUi = useAppStore((s) => s.updateTabUi);

    const [wizardSlot, setWizardSlot] = useState<number | null>(null);
    const [activeDragSlot, setActiveDragSlot] = useState<number | null>(null);

    // Corrección obligatoria: PointerSensor con activationConstraint distance: 8
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 8 }
        })
    );

    if (!ui || !tab) return null;

    // Persist immediately
    const persistDashboard = async (newWidgets: WidgetConfig[]) => {
        updateTabUi(tabId, { widgets: newWidgets });
        
        if (ui.savedViewPath) {
            try {
                const freshUi = { ...ui, widgets: newWidgets };
                const viewState = toViewState(tab, freshUi);

                await invoke("save_view", {
                    tabId: tabId,
                    viewName: tab.name,
                    view: viewState,
                    path: ui.savedViewPath,
                    defaultFileName: undefined,
                    viewNotes: freshUi.viewNotes || null,
                    columnNotes: Object.keys(freshUi.columnNotes).length > 0 ? freshUi.columnNotes : null
                });
            } catch (err) {
                console.error("Failed to auto-save dashboard view:", err);
            }
        }
    };

    const handleAddWidget = (widget: WidgetConfig) => {
        const nextWidgets = [...ui.widgets, widget];
        persistDashboard(nextWidgets);
    };

    const handleRemoveWidget = (widgetId: string) => {
        const nextWidgets = ui.widgets.filter((w) => w.id !== widgetId);
        persistDashboard(nextWidgets);
    };

    const handleUpdateWidget = (widgetId: string, updates: Partial<WidgetConfig>) => {
        const nextWidgets = ui.widgets.map((w) => w.id === widgetId ? { ...w, ...updates } : w);
        persistDashboard(nextWidgets);
    };

    const handleDragStart = (event: DragStartEvent) => {
        const { active } = event;
        setActiveDragSlot(active.data.current?.slotIndex ?? null);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        setActiveDragSlot(null);
        const { active, over } = event;

        if (!over) return;
        
        const sourceSlot = active.data.current?.slotIndex as number;
        const targetSlot = over.data.current?.slotIndex as number;

        if (sourceSlot === targetSlot) return;

        const nextWidgets = [...ui.widgets];
        const sourceWidgetIdx = nextWidgets.findIndex(w => w.slot === sourceSlot);
        const targetWidgetIdx = nextWidgets.findIndex(w => w.slot === targetSlot);

        if (sourceWidgetIdx !== -1) {
            if (targetWidgetIdx !== -1) {
                // Swap
                const tempSlot = nextWidgets[targetWidgetIdx].slot;
                nextWidgets[targetWidgetIdx] = { ...nextWidgets[targetWidgetIdx], slot: nextWidgets[sourceWidgetIdx].slot };
                nextWidgets[sourceWidgetIdx] = { ...nextWidgets[sourceWidgetIdx], slot: tempSlot };
            } else {
                // Move to empty
                nextWidgets[sourceWidgetIdx] = { ...nextWidgets[sourceWidgetIdx], slot: targetSlot };
            }
            persistDashboard(nextWidgets);
        }
    };

    // Render placeholder si no hay gráficos ni ha sido guardado
    if (!ui.savedViewPath && ui.widgets.length === 0) {
        return (
            <div className="flex-shrink-0 w-full bg-zinc-900 border-t border-zinc-800 p-2 text-center text-xs text-zinc-500">
                Guarda la vista actual ("Save view") en formato .exh para habilitar el Dashboard y añadir gráficos persistentes.
            </div>
        );
    }

    const gridSlots = Array.from({ length: MAX_SLOTS }).map((_, idx) => {
        const existingWidget = ui.widgets.find((w) => w.slot === idx);
        return { slotIndex: idx, widget: existingWidget };
    });

    const renderChart = (w: WidgetConfig) => {
        if (w.type === "frequency") {
            return <FrequencyChart tabId={tabId} col={w.xColumn} onClose={() => handleRemoveWidget(w.id)} isWidget />;
        }
        
        if (w.type === "bar") {
            return <BarChart tabId={tabId} col={w.xColumn} configOptions={{ yColumn: w.yColumn }} />;
        }
        
        if (w.type === "line") {
            return <LineChart tabId={tabId} col={w.xColumn} configOptions={{ yColumn: w.yColumn }} />;
        }
        return null;
    };

    const draggingWidget = activeDragSlot !== null ? ui.widgets.find(w => w.slot === activeDragSlot) : null;

    return (
        <div style={{ maxHeight: "340px", flexShrink: 0 }} className="w-full bg-zinc-950 border-t border-zinc-800 overflow-y-auto p-3">
            <DndContext 
                sensors={sensors}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
            >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 auto-rows-max">
                    {gridSlots.map(({ slotIndex, widget }) => (
                         <DashboardSlot 
                             key={slotIndex}
                             slotIndex={slotIndex}
                             widget={widget}
                             onRemove={handleRemoveWidget}
                             onUpdateWidget={handleUpdateWidget}
                             onAdd={setWizardSlot}
                             renderChart={renderChart}
                         />
                    ))}
                </div>

                <DragOverlay dropAnimation={{ sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.4' } } }) }}>
                    {draggingWidget ? (
                        <div className="bg-zinc-900 border border-violet-500/50 rounded-lg overflow-hidden flex flex-col min-h-[300px] opacity-90 shadow-xl">
                            <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800/50 bg-zinc-900/50">
                                <div className="flex items-center gap-2 overflow-hidden">
                                     <button className="text-zinc-500 cursor-grabbing focus:outline-none">
                                         <GripHorizontal size={14} />
                                     </button>
                                     <span className="text-xs font-semibold text-zinc-300 truncate pr-2">
                                         {draggingWidget.title || `${draggingWidget.type} - ${draggingWidget.xColumn}`}
                                     </span>
                                </div>
                            </div>
                            <div className="flex-1 p-2 relative pointer-events-none opacity-50 flex items-center justify-center">
                                {/* Placeholder ligero para la preview de drag */}
                                <div className="text-zinc-500 text-xs flex flex-col items-center gap-2">
                                    <GripHorizontal size={24} className="opacity-50" />
                                    <span>Reubicando widget...</span>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </DragOverlay>
            </DndContext>

            {wizardSlot !== null && (
                <AddChartWizard 
                    tabId={tabId} 
                    slot={wizardSlot} 
                    onClose={() => setWizardSlot(null)} 
                    onAdd={handleAddWidget}
                />
            )}
        </div>
    );
}
