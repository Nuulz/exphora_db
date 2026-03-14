# ExphoraDB

A fast, lightweight Rust-powered desktop app for exploring, visually analyzing,
and sharing your datasets — no cloud required.

![Version](https://img.shields.io/badge/version-v0.8.4-purple)
![Platform](https://img.shields.io/badge/platform-Windows_11_Pro-lightgrey)

---

## What is it?

ExphoraDB is a direct alternative to traditional data viewers (Excel, slow SQL interfaces),
letting you open large datasets in under two seconds and analyze their contents interactively.
Its philosophy is **local performance** and **sovereign collaboration** via end-to-end
encrypted P2P sharing — all through a fast, modern UI.

---

## Features (v0.8.4)

### Ultra-fast Import ( < 2s )
- Exphora Views (`.exh`)
- JSON (`.json`)
- JSON Lines / NDJSON (`.jsonl`, `.ndjson`)
- CSV (`.csv`)
- XML (`.xml`)
- SQLite (`.db`, `.sqlite`, `.sqlite3`)

### Exploration & Filters
- Virtualized grid capable of handling millions of rows with instant rendering.
- Inline cell editing with AutoSave and a global stacked Undo/Redo history (`Ctrl+Z`).
- Column visibility toggles.
- Easy / Advanced search mode with regex support and smart highlighting.
- RelinkModal: reconnects orphaned views by locating the original dataset via SHA-256.

### Calculated Columns (Native Pratt Parser)
Compute real-time expressions over your rows using the built-in `expr.rs` engine:
- Full relational operators: `<`, `>`, `<=`, `>=`, `==`, `!=`
- Row-level logic: `if(condition, true_val, false_val)` *(lazy evaluation)*
- Math / casting utilities: `round(x, decimals)`, `num(column)`
- Filtered aggregates: `sum(col)`, `avg(col)`, `countif(condition)` *(operate only over filtered rows)*

### Analytical Dashboard & Visualization
Lightweight visual analysis that persists per view inside the `.exh` file:
- Column frequency charts and statistical graphs (Histogram, Bar, Line) via Recharts.
- Up to 3 widget slots with drag & drop reordering, fullscreen mode, inline title editing,
  and one-click removal.
- Brush selector on the X axis for series with more than 15 data points.
- Mouse-wheel zoom and pan inside any widget (react-zoom-pan-pinch).
- Dashboard toggle in the TabBar — collapsed by default, session-only state.

### View Format (.exh)
**The native workspace format.** An `.exh` file is a frozen workspace session that
encapsulates filters, column config, sorting, calculated columns, dashboard widgets,
floating Markdown notes, column annotations, and the path to the underlying dataset.
Retrocompatible across versions.

### Flexible Export
Export your processed data locally to: CSV, JSON, NDJSON, Markdown, PDF, or paginated Excel.

### Secure P2P
Send datasets over your local network without touching external servers.
Bidirectional encryption via `p2pShare` / `p2pFetch`.

---

## Quick Start

1. **Open a file**: Press `Ctrl+O` and load any JSON, CSV, SQLite, or XML file.
2. **Filter data**: Use the top search bar with plain values or regex expressions.
3. **Calculated column**: Click a column header menu, create a new column, and type
   e.g. `if(price > 100, "Premium", "Regular")`.
4. **Dashboard**: Expand the dashboard from the TabBar, add a widget, and explore
   your data visually. Double-click any widget title to rename it.
5. **Smart Save**: Press `Ctrl+S` to persist the full workspace state to a `.exh` file.
6. **Share / Export**: Use `Ctrl+E` to export, or `Ctrl+P` to open the P2P panel.

---

## Keyboard Shortcuts

### Files & Tabs
| Shortcut | Action |
| :--- | :--- |
| `Ctrl + O` | Open file dialog |
| `Ctrl + S` | Smart Save (save current view) |
| `Ctrl + R` | Reload active dataset |
| `Ctrl + W` | Close active tab |
| `Ctrl + Tab` | Next tab |
| `Ctrl + Shift + Tab` | Previous tab |

### Search & Navigation
| Shortcut | Action |
| :--- | :--- |
| `Ctrl + F` | Focus table search bar |
| `Tab` / `Shift+Tab` | Navigate focus traps and overlays |
| `Arrow keys` | Navigate menus and modal grids |
| `Enter` | Confirm / edit / open context |
| `Escape` | Close panel, cancel edit, or exit widget fullscreen |

### Table Actions
| Shortcut | Action |
| :--- | :--- |
| `Ctrl + Shift + F` | Column selector — Filter |
| `Ctrl + Shift + S` | Column selector — Stats |
| `Ctrl + Shift + G` | Column selector — Frequency chart |
| `Ctrl + Shift + C` | Clear all active filters |
| `Ctrl + E` | Export panel |
| `Double Click` | Inline cell edit |
| `Ctrl + Z` | Undo inline edit |
| `Ctrl + X` | Redo inline edit |

### App
| Shortcut | Action |
| :--- | :--- |
| `Ctrl + D` | Toggle dark/light theme |
| `Ctrl + ,` | Global settings |
| `Ctrl + P` | P2P collaboration panel |

---

## Installation / Build

Requires [Node.js](https://nodejs.org/) and [Rust](https://rustup.rs/) installed.

```bash
# 1. Install frontend dependencies
cd ui && npm install

# 2. Run dev server (hot reload)
cargo tauri dev

# 3. Build production binary (.exe)
npx @tauri-apps/cli build

# Test
cargo test
# 37 passed, 0 failed
```

## Frontend build

```bash
cd ui && npm run build
cargo check
```