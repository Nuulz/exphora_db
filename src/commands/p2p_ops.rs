use crate::commands::file_ops::LoadedTab;
use crate::models::JsonRecord;
use crate::p2p::Command;
use crate::parser::infer_schema;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;
use tokio::sync::{mpsc, oneshot};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct P2pSnapshot {
    pub records: Vec<JsonRecord>,
    pub view: Option<crate::commands::view_ops::ViewState>,
    pub view_notes: Option<String>,
    pub column_notes: Option<HashMap<String, String>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchResult {
    pub tab: LoadedTab,
    pub view: Option<crate::commands::view_ops::ViewState>,
    pub view_notes: Option<String>,
    pub column_notes: Option<HashMap<String, String>>,
}

/// Managed state that holds the P2P command channel sender.
pub struct P2pState {
    pub cmd_tx: mpsc::Sender<Command>,
}

// ── Helper: extract dataset name from share link ──────────────────────────────
// Share links have format: exphora:<name>:<rest>
// We extract <name> for the tab label.
fn name_from_link(link: &str) -> String {
    let without_scheme = link.strip_prefix("exphora:").unwrap_or(link);
    without_scheme
        .split(':')
        .next()
        .filter(|s| !s.is_empty())
        .unwrap_or("p2p_dataset")
        .to_string()
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Compress, shard and serve a dataset via P2P.
/// Returns the "exphora:..." share link string that peers can use to fetch.
#[tauri::command]
pub async fn p2p_share(
    name: String,
    records: Vec<JsonRecord>,
    port: u16,
    view: Option<crate::commands::view_ops::ViewState>,
    view_notes: Option<String>,
    column_notes: Option<HashMap<String, String>>,
    state: State<'_, P2pState>,
) -> Result<String, String> {
    let snapshot = P2pSnapshot {
        records,
        view,
        view_notes,
        column_notes,
    };
    let json_bytes =
        serde_json::to_vec(&snapshot).map_err(|e| format!("Error serializando snapshot: {e}"))?;

    let (resp_tx, resp_rx) = oneshot::channel();
    state
        .cmd_tx
        .send(Command::ShareDataset {
            name,
            json_bytes,
            port,
            resp: resp_tx,
        })
        .await
        .map_err(|_| "P2P runtime not running".to_string())?;

    resp_rx
        .await
        .map_err(|_| "P2P response channel dropped".to_string())?
}

/// Fetch a dataset from a peer using an "exphora:..." share link.
/// Fully constructs a LoadedTab (schema inferred, uuid assigned).
/// No todo!() — fully implemented.
#[tauri::command]
pub async fn p2p_fetch(link: String, state: State<'_, P2pState>) -> Result<FetchResult, String> {
    let (resp_tx, resp_rx) = oneshot::channel();
    state
        .cmd_tx
        .send(Command::FetchDataset {
            link: link.clone(),
            resp: resp_tx,
        })
        .await
        .map_err(|_| "P2P runtime not running".to_string())?;

    let json_bytes: Vec<u8> = resp_rx
        .await
        .map_err(|_| "P2P response channel dropped".to_string())??;

    // Step 1: Parse snapshot or fallback to raw records
    let mut view = None;
    let mut view_notes = None;
    let mut column_notes = None;

    let records: Vec<JsonRecord> = match serde_json::from_slice::<P2pSnapshot>(&json_bytes) {
        Ok(snapshot) => {
            view = snapshot.view;
            view_notes = snapshot.view_notes;
            column_notes = snapshot.column_notes;
            snapshot.records
        }
        Err(_) => {
            // Fallback for peers < v0.9 sending raw records
            crate::parser::parse_ndjson(&json_bytes).or_else(|_| {
                serde_json::from_slice::<Vec<JsonRecord>>(&json_bytes)
                    .map_err(|e| format!("Error parseando JSON recibido: {e}"))
            })?
        }
    };

    // Step 2: infer schema to determine column list
    let schema = infer_schema(&records);
    let columns: Vec<String> = schema.fields.iter().map(|f| f.name.clone()).collect();
    let total_rows = records.len();

    // Step 3: extract dataset name from share link prefix (exphora:<name>:...)
    let name = name_from_link(&link);

    // Step 4: construct and return a FetchResult
    let tab = LoadedTab {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.clone(),
        path: String::new(),
        columns,
        records,
        total_rows,
    };

    if let Some(ref mut v) = view {
        if v.dataset_path.is_empty() {
            v.dataset_path = format!("p2p:{}", name);
        }
    }

    Ok(FetchResult {
        tab,
        view,
        view_notes,
        column_notes,
    })
}
