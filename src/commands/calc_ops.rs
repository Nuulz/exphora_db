use crate::expr::eval_expr;
use crate::models::{val_to_str, JsonRecord};
use std::collections::HashMap;

/// Helper to build row map
fn build_row_map(record: &JsonRecord) -> HashMap<String, String> {
    record
        .as_object()
        .map(|obj| {
            obj.iter()
                .map(|(k, v)| (k.clone(), val_to_str(v)))
                .collect()
        })
        .unwrap_or_default()
}

/// Evaluate a calculated column expression against every record.
/// Returns `None` for rows where the expression evaluates to Null.
#[tauri::command]
pub fn eval_calc_column(
    expr_str: String,
    records: Vec<JsonRecord>,
    filtered_indices: Option<Vec<usize>>,
) -> Result<Vec<Option<String>>, String> {
    let indices = filtered_indices.unwrap_or_else(|| (0..records.len()).collect());
    
    // Build context representing only the visible dataset for aggregate functions
    let all_rows: Vec<HashMap<String, String>> = indices
        .iter()
        .filter_map(|&i| records.get(i).map(build_row_map))
        .collect();

    let results = records
        .iter()
        .map(|record| {
            let row_map = build_row_map(record);
            eval_expr(&expr_str, &row_map, Some(&all_rows)).to_display()
        })
        .collect();

    Ok(results)
}
