import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../store/appStore";

export function useAutoSave(tabId: string) {
    const tab = useAppStore((s) => s.tabs.find((t) => t.id === tabId));
    const setSaveStatus = useAppStore((s) => s.setSaveStatus);
    const saveStatus = useAppStore((s) => s.tabUi[tabId]?.saveStatus);
    
    // Keep a ref to avoid triggering useEffect too often
    const recordsRef = useRef(tab?.records);
    const timeoutRef = useRef<number | null>(null);

    useEffect(() => {
        if (!tab) return;
        
        // Skip first render and when records reference hasn't changed
        if (recordsRef.current === tab.records) return;
        recordsRef.current = tab.records;

        const path = tab.path;
        if (!path) return;

        // Supported formats: JSON and CSV
        const ext = path.split('.').pop()?.toLowerCase();
        if (ext !== "json" && ext !== "csv") {
            setSaveStatus(tabId, "error");
            return;
        }

        if (timeoutRef.current !== null) {
            window.clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = window.setTimeout(async () => {
            try {
                setSaveStatus(tabId, "saving");
                await invoke("save_file", {
                    path: path,
                    format: ext,
                    records: tab.records
                });
                setSaveStatus(tabId, "saved");
                setTimeout(() => setSaveStatus(tabId, "idle"), 2000);
            } catch (err) {
                console.error("Save error:", err);
                setSaveStatus(tabId, "error");
            }
        }, 800);

        return () => {
            if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
        };
    }, [tab?.records, tab?.path, tabId, setSaveStatus]);
}
