import { invoke } from "@tauri-apps/api/core";
import { ChartConfig, ChartDataResult } from "./types";

/**
 * Invokes the Rust backend to build chart data.
 * @param config The chart configuration.
 * @param records All dataset records.
 * @param filteredIndices The indices of the records currently filtered.
 * @returns The aggregated chart data ready to be consumed by the UI.
 */
export async function buildChartData(
    config: ChartConfig,
    records: Record<string, unknown>[],
    filteredIndices: number[]
): Promise<ChartDataResult> {
    return await invoke<ChartDataResult>("build_chart_data", {
        config,
        records,
        filteredIndices,
    });
}
