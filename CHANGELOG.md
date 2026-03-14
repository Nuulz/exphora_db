## v0.8.4 — 2026-03-13

### Added
- Persistent analytical dashboards in `.exh` with up to 3 modular widgets (bar, line, histogram).
- Dashboard drag & drop with zoom, smooth pan, infinite canvas and inline widget title editing.
- Rewritten calculated columns and expression engine: aggregate functions (sum, avg, num, countif) with lazy evaluation via `if()`.
- Full relational operators injected into the Pratt parser (`>`, `<`, `>=`, `<=`, `==`, `!=`).
- Inline cell editing across all JSON/CSV columns with AutoSave and stacked Undo/Redo history.
- P2P visual sharing and consolidated multi-format export.

---

## v0.7.2 — 2026-03-11

### Added
- View system (.exh files) with full persistence: filters, columns, sorting, charts.
- Smart Save: writes directly to the same file after the first save, no dialog.
- Recent Views section in the Sidebar.
- RelinkModal: re-link views whose dataset has been moved or renamed (SHA-256 detection).
- Floating Markdown notes panel per view: draggable, resizable, Code/Preview/Split modes.
- Column annotations with dot indicator and tooltip in column headers.
- Automatic filename suggestion when saving a view for the first time.
- Landing page fix: missing DOCTYPE declaration causing blank screen on Tailwind v4.
