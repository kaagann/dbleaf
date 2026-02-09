<p align="center">
  <img src="src-tauri/icons/icon.png" width="128" height="128" alt="dbleaf logo" />
</p>

<h1 align="center">dbleaf</h1>

<p align="center">
  A fast, modern PostgreSQL database management tool built with Tauri and React.
  <br />
  <em>Open-source alternative to TablePlus / DBeaver — lightweight and native.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-blue" alt="Platforms" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
  <img src="https://img.shields.io/github/v/release/kaagann/dbleaf?include_prereleases" alt="Release" />
</p>

---

## Features

### Connection Management
- Multiple simultaneous PostgreSQL connections
- **SSL/TLS** support with configurable modes
- **SSH tunneling** with password or key-based authentication
- Color-coded connection profiles for quick identification
- Test connection before saving

### Data Browser
- Browse schemas, tables, views, functions, and sequences in a tree sidebar
- View and paginate table data (sortable columns, row counts, execution time)
- **Inline editing** — double-click cells or click a row to open the edit sidebar
- Add, update, and delete rows with pending change tracking
- Export tables to **CSV** or **JSON**

### SQL Editor
- Full-featured editor powered by **CodeMirror 6**
- PostgreSQL syntax highlighting with **schema-aware autocomplete** (tables, columns, views)
- Execute queries with `Cmd+Enter`, run EXPLAIN ANALYZE with `Cmd+Shift+Enter`
- Tabbed interface — open multiple query editors side by side

### Query History
- All executed queries are persisted with execution time and row counts
- Favorite, search, filter, and re-run past queries

### ER Diagram
- Auto-generated entity-relationship diagrams per schema
- Automatic layout with **ELK algorithm**
- Interactive pan, zoom, and minimap navigation
- Primary key and foreign key relationship visualization

### AI Assistant
- OpenAI-powered SQL generation and database Q&A
- Streaming responses with function calling (executes queries in context)
- Toggle with `Cmd+I`

### Backup & Restore
- **pg_dump** / **pg_restore** integration
- Supports SQL, Custom, and Tar formats
- Works over SSH tunnels

### Command Palette
- `Cmd+K` to quickly search tables, views, functions, and actions
- Preview table data inline or open in a new tab

### More
- **Auto-updater** — get notified of new releases and update in-place
- **Resizable panels** — drag to resize sidebar, editor, AI chat, and edit panels
- **Dark theme** with a terminal-inspired green accent
- **i18n** — Turkish and English (more languages planned)
- **Tab system** — up to 30 concurrent tabs (data, query, structure, history, ER diagram)

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd+T` | New query tab |
| `Cmd+W` | Close active tab |
| `Cmd+K` | Command palette |
| `Cmd+I` | Toggle AI assistant |
| `Cmd+Y` | Query history |
| `Cmd+Enter` | Execute SQL |
| `Cmd+Shift+Enter` | EXPLAIN ANALYZE |

> Use `Ctrl` instead of `Cmd` on Windows.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop Framework | [Tauri v2](https://v2.tauri.app/) (Rust) |
| Frontend | React 19, TypeScript, Vite 7 |
| Styling | Tailwind CSS v4 |
| State | Zustand |
| SQL Editor | CodeMirror 6 |
| Diagrams | React Flow + ELK.js |
| DB Driver | tokio-postgres |
| SSH | ssh2 (libssh2) |
| Package Manager | Bun |

---

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs/) (stable)
- [Bun](https://bun.sh/) (or Node.js)
- [Tauri CLI](https://v2.tauri.app/start/create-project/)

### Development

```bash
# Clone the repo
git clone https://github.com/kaagann/dbleaf.git
cd dbleaf

# Install dependencies
bun install

# Run in development mode
bun tauri dev
```

### Build

```bash
bun tauri build
```

Build artifacts will be in `src-tauri/target/release/bundle/`.

---

## Project Structure

```
dbleaf/
├── src/                          # React frontend
│   ├── components/               # UI components
│   │   ├── DataTable.tsx         # Table data viewer + editor
│   │   ├── SqlEditor.tsx         # CodeMirror SQL editor
│   │   ├── Sidebar.tsx           # Schema tree browser
│   │   ├── ERDiagram.tsx         # ER diagram visualization
│   │   ├── AiChat.tsx            # AI assistant panel
│   │   ├── CommandPalette.tsx    # Quick search palette
│   │   ├── QueryHistory.tsx      # Query history browser
│   │   └── ...
│   ├── pages/                    # Route pages
│   ├── stores/                   # Zustand state stores
│   ├── locales/                  # i18n translations
│   └── hooks/                    # Custom React hooks
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── lib.rs                # Tauri command handlers
│   │   ├── db/
│   │   │   ├── connection.rs     # Connection manager
│   │   │   ├── queries.rs        # All SQL query logic
│   │   │   └── models.rs         # Data models
│   │   ├── ai.rs                 # OpenAI integration
│   │   ├── backup.rs             # pg_dump/pg_restore
│   │   ├── ssh_tunnel.rs         # SSH tunneling
│   │   └── storage.rs            # Config persistence
│   ├── Cargo.toml
│   └── tauri.conf.json
└── .github/workflows/
    └── release.yml               # CI/CD for macOS + Windows
```

---

## Release & Auto-Update

Releases are automated via GitHub Actions. To create a new release:

```bash
# Bump version in tauri.conf.json and package.json, then:
git tag v0.2.0
git push --tags
```

This triggers builds for **macOS** (Apple Silicon + Intel) and **Windows** (NSIS installer), and publishes them as a GitHub Release. The built-in auto-updater checks for new versions on app startup.

---

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

---

## License

[MIT](LICENSE)
