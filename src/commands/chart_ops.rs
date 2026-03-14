use crate::models::{val_to_str, JsonRecord};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChartConfigDto {
    pub id: Option<String>,
    #[serde(rename = "type")]
    pub chart_type: String,
    pub title: Option<String>,
    #[serde(rename = "xColumn")]
    pub x_column: Option<String>,
    #[serde(rename = "yColumn")]
    pub y_column: Option<String>,
    #[serde(rename = "groupByColumn")]
    pub group_by_column: Option<String>,
    pub aggregation: Option<String>,
    pub sort: Option<String>,
    pub limit: Option<usize>,
    pub options: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChartCategory {
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChartSeries {
    pub name: String,
    pub data: Vec<f64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")] // Match TS camelCase
pub struct ChartDataResult {
    pub chart_type: String,
    pub x_label: String,
    pub y_label: String,
    pub categories: Vec<ChartCategory>,
    pub series: Vec<ChartSeries>,
    pub meta: HashMap<String, String>,
}

#[tauri::command]
pub fn build_chart_data(
    config: ChartConfigDto,
    records: Vec<JsonRecord>,
    filtered_indices: Vec<usize>,
) -> Result<ChartDataResult, String> {
    match config.chart_type.as_str() {
        "histogram" => build_histogram(config, &records, &filtered_indices),
        "bar" => build_bar_or_line(config, &records, &filtered_indices, "bar"),
        "line" => build_bar_or_line(config, &records, &filtered_indices, "line"),
        _ => Err(format!("Unsupported chart type: {}", config.chart_type)),
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

fn build_histogram(
    config: ChartConfigDto,
    records: &[JsonRecord],
    filtered_indices: &[usize],
) -> Result<ChartDataResult, String> {
    // Nota (Fase 0.8.1 - Prompt 2): La migración de FrequencyChart ahora usa
    // exitosamente esta función build_chart_data via invoke. Ya no se calculan
    // frecuencias de forma síncrona en TypeScript.
    
    let col = config.x_column.as_deref().unwrap_or("").to_string();
    if col.is_empty() {
        return Err("Histogram requires xColumn".to_string());
    }

    let mut freq: HashMap<String, usize> = HashMap::new();
    for &idx in filtered_indices {
        let text = records
            .get(idx)
            .and_then(|r| r.as_object())
            .and_then(|o| o.get(&col))
            .map(|v| val_to_str(v))
            .unwrap_or_else(|| "null".to_string());

        let key = if text.is_empty() {
            "null".to_string()
        } else {
            text
        };
        *freq.entry(key).or_insert(0) += 1;
    }

    let mut top: Vec<(String, usize)> = freq.into_iter().collect();

    // Default sort by frequency descending for histogram
    let sort_dir = config.sort.as_deref().unwrap_or("desc");
    if sort_dir == "desc" {
        top.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
    } else if sort_dir == "asc" {
        top.sort_by(|a, b| a.1.cmp(&b.1).then(a.0.cmp(&b.0)));
    }

    if let Some(limit) = config.limit {
        top.truncate(limit);
    } else {
        top.truncate(20); // Default limit matching UI FrequencyChart behavior
    }

    let categories = top
        .iter()
        .map(|(n, _)| ChartCategory { name: n.clone() })
        .collect();
    let data = top.iter().map(|(_, c)| *c as f64).collect();

    Ok(ChartDataResult {
        chart_type: "histogram".to_string(),
        x_label: "Frecuencia".to_string(),
        y_label: col.clone(),
        categories,
        series: vec![ChartSeries {
            name: "count".to_string(),
            data,
        }],
        meta: HashMap::from([("totalGroups".to_string(), top.len().to_string())]),
    })
}

fn build_bar_or_line(
    config: ChartConfigDto,
    records: &[JsonRecord],
    filtered_indices: &[usize],
    out_type: &str,
) -> Result<ChartDataResult, String> {
    let x_col = config
        .x_column
        .as_deref()
        .or(config.group_by_column.as_deref())
        .unwrap_or("")
        .to_string();
    if x_col.is_empty() {
        return Err(format!("{} requires xColumn or groupByColumn", out_type));
    }

    let y_col = config.y_column.clone();
    let agg = config.aggregation.as_deref().unwrap_or("count");

    // Map category -> values to aggregate
    let mut groups: HashMap<String, Vec<f64>> = HashMap::new();

    for &idx in filtered_indices {
        let rec_obj = match records.get(idx).and_then(|r| r.as_object()) {
            Some(o) => o,
            None => continue,
        };

        let x_val = rec_obj
            .get(&x_col)
            .map(|v| val_to_str(v))
            .unwrap_or_else(|| "null".to_string());

        let x_key = if x_val.is_empty() {
            "null".to_string()
        } else {
            x_val
        };

        let mut y_num = 0.0;
        if let Some(y) = &y_col {
            if let Some(v) = rec_obj.get(y) {
                let v_str = val_to_str(v);
                if let Ok(n) = v_str.parse::<f64>() {
                    y_num = n;
                }
            }
        }

        groups.entry(x_key).or_default().push(y_num);
    }

    // Aggregate
    let mut results: Vec<(String, f64)> = groups
        .into_iter()
        .map(|(cat, vals)| {
            let val = match agg {
                "sum" => vals.iter().sum(),
                "avg" => {
                    if vals.is_empty() {
                        0.0
                    } else {
                        vals.iter().sum::<f64>() / vals.len() as f64
                    }
                }
                "min" => vals.iter().cloned().fold(f64::INFINITY, f64::min),
                "max" => vals.iter().cloned().fold(f64::NEG_INFINITY, f64::max),
                "count" | _ => vals.len() as f64,
            };
            (cat, val)
        })
        .collect();

    // Default sort by X value (category name) ascending naturally, or by Y descending
    let sort_dir = config.sort.as_deref().unwrap_or("none");
    if sort_dir == "desc" {
        results.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    } else if sort_dir == "asc" {
        results.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
    } else {
        // Natural sort by category string
        results.sort_by(|a, b| a.0.cmp(&b.0));
    }

    if let Some(limit) = config.limit {
        results.truncate(limit);
    }

    let categories = results
        .iter()
        .map(|(n, _)| ChartCategory { name: n.clone() })
        .collect();
    let data = results.iter().map(|(_, v)| *v).collect();

    let series_name = if let Some(y) = &y_col {
        format!("{}({})", agg, y)
    } else {
        "count".to_string()
    };

    Ok(ChartDataResult {
        chart_type: out_type.to_string(),
        x_label: x_col,
        y_label: series_name.clone(),
        categories,
        series: vec![ChartSeries {
            name: series_name,
            data,
        }],
        meta: HashMap::new(),
    })
}
