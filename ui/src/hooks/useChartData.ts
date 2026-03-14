import { useState, useEffect, useRef } from "react";
import { ChartConfig, ChartDataResult } from "../types";
import { buildChartData } from "../commands";

export function useChartData(
    config: ChartConfig | null,
    records: Record<string, unknown>[],
    filteredIndices: number[]
) {
    const [data, setData] = useState<ChartDataResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Keep references to avoid re-triggering the effect unnecessarily
    const filteredIndicesRef = useRef(filteredIndices);
    filteredIndicesRef.current = filteredIndices;
    const recordsRef = useRef(records);
    recordsRef.current = records;

    // Use stringified config or specific simple dependencies to prevent deep-compare loop
    const configHash = config ? JSON.stringify(config) : null;
    const filtersLength = filteredIndices.length;

    useEffect(() => {
        let isMounted = true;

        if (!config || filtersLength === 0) {
            setData(null);
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        const timeoutId = setTimeout(async () => {
            try {
                // Reconstruct config from JSON string since we use it as dependency
                const parsedConfig = JSON.parse(configHash!) as ChartConfig;
                const recs = recordsRef.current;
                const inds = filteredIndicesRef.current;

                const result = await buildChartData(parsedConfig, recs, inds);

                if (isMounted) {
                    setData(result);
                    setLoading(false);
                }
            } catch (err) {
                if (isMounted) {
                    console.error("Failed to build chart data:", err);
                    setError(String(err));
                    setLoading(false);
                }
            }
        }, 150);

        return () => {
            isMounted = false;
            clearTimeout(timeoutId);
        };
    }, [configHash, filtersLength]);

    return { data, loading, error };
}
