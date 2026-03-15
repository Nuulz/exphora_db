import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../store/appStore";

export function useAcceptP2PView() {
    const updateTabUi = useAppStore((s) => s.updateTabUi);

    const acceptP2PView = async (params: {
        tabId: string;
        tabName: string;
        fetchLink: string;
        view: any;
        viewNotes: string | null;
        columnNotes: Record<string, string> | null;
    }) => {
        const { tabId, tabName, fetchLink, view, viewNotes, columnNotes } = params;

        const uiPatch: any = {};
        if (view) {
            uiPatch.filters = view.filters;
            uiPatch.textSearch = view.textSearch;
            uiPatch.visibleColumns = view.visibleColumns;
            uiPatch.frozenCols = view.frozenCols;
            uiPatch.calcCols = view.calcCols;
            uiPatch.sortCol = view.sortCol;
            uiPatch.sortAsc = view.sortAsc;
            uiPatch.showFrequencyChart = view.showFrequencyChart;
            uiPatch.frequencyChartCol = view.frequencyChartCol;
            uiPatch.widgets = view.widgets || [];
        }
        if (viewNotes) {
            uiPatch.viewNotes = viewNotes;
        }
        if (columnNotes) {
            uiPatch.columnNotes = columnNotes;
        }
        updateTabUi(tabId, uiPatch);

        try {
            const linkHash = "p2p_hash:" + btoa(encodeURIComponent(fetchLink));
            const isDuplicate = await invoke<boolean>("check_duplicate_p2p_view", { hash: linkHash })
                .catch(() => false);

            const appDataDir = await invoke<string>("get_app_data_dir");
            const sep = appDataDir.includes("\\") ? "\\" : "/";
            const safeTabName = tabName.replace(/[^a-z0-9]/gi, '_');
            const fileName = `${safeTabName}_rec_${Date.now()}.exh`;
            const fullPath = `${appDataDir}${sep}exphora_p2p${sep}received_views${sep}${fileName}`;

            if (!isDuplicate) {
                const viewToSave = {
                    datasetPath: view?.datasetPath || `p2p:${tabName}`,
                    filters: view?.filters || [],
                    textSearch: view?.textSearch || "",
                    visibleColumns: view?.visibleColumns || {},
                    frozenCols: view?.frozenCols || [],
                    calcCols: view?.calcCols || [],
                    sortCol: view?.sortCol || null,
                    sortAsc: view?.sortAsc ?? true,
                    showFrequencyChart: view?.showFrequencyChart ?? false,
                    frequencyChartCol: view?.frequencyChartCol || null,
                    charts: view?.charts || null,
                    widgets: view?.widgets || []
                };

                const notesWithHash = [linkHash, viewNotes].filter(Boolean).join("\n");

                await invoke<string>("save_view", {
                    path: fullPath,
                    view: viewToSave,
                    viewNotes: notesWithHash || null,
                    columnNotes: columnNotes || null,
                });

                const stored = localStorage.getItem("exphora_saved_views");
                const parsed = stored ? JSON.parse(stored) : {};

                if (!parsed[tabName]) {
                    parsed[tabName] = [];
                }

                parsed[tabName].unshift({
                    name: `P2P Recibido: ${new Date().toLocaleString()}`,
                    path: fullPath,
                    createdAt: new Date().toISOString()
                });

                localStorage.setItem("exphora_saved_views", JSON.stringify(parsed));
            }

            window.dispatchEvent(new CustomEvent("exphora-views-updated", { detail: { dataset: tabName } }));

            useAppStore.getState().updateTabUi(tabId, { savedViewPath: fullPath });
        } catch (saveErr) {
            console.error("Auto-save P2P view failed:", saveErr);
        }
    };

    return { acceptP2PView };
}
