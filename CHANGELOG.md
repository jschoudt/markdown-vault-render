# Changelog

All notable changes to the **markdown-vault-render** toolchain, CLI, and IDE extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-10-27

### Added
- **Initial Repository Extraction**:
  - Extracted the Markdown rendering pipeline out of `GodsfellMarkdown` into an independent, standalone toolchain and IDE extension suitable for any tabletop, lore, or Obsidian vault.
- **Unified Modular Rendering Engine (`lib/`)**:
  - `render-pdf.js`: Generates clean multi-column print HTML via `marked` and compiles print-ready PDFs headlessly using Google Chrome, Chromium, Brave, or Edge.
  - `render-docx.js`: Pandoc-driven Word document compilation with markdown preprocessing (bullet normalization, YAML title deduplication, container transformations), on-the-fly image format conversion (`.webp` and `.svg` to `.png` via `sips` / `rsvg-convert`), and post-processed OpenXML statblock cards.
  - `wikilinks.js`: Obsidian-style `[[target|display]]` and embedded `![[target]]` resolution with relative link conversion.
  - `utils.js`: Automatic cross-platform binary discovery, workspace root resolution, and cascading asset loading.
- **Bundled Default Styles & Assets (`assets/`)**:
  - Shipped default tabletop print stylesheet (`clean-print.css`), Word template (`reference.docx`), Pandoc Lua filter (`docx-filter.lua`), and Python statblock styler (`style-statblocks.py`).
  - Added cascading asset overrides: explicit CLI flag $\rightarrow$ local vault styles $\rightarrow$ bundled fallback assets.
- **Global Command-Line Interface (`bin/`)**:
  - `render-pdf`: Single-document or auto-detect PDF renderer.
  - `render-docx`: Single-document Word (.docx) compiler.
  - `render-all`: Vault-wide batch PDF compiler.
  - `markdown-vault-render`: Unified multi-command CLI runner.
- **Universal IDE Extension (`extension/`)**:
  - Decoupled from repository-local scripts; bundles its own runtime engine and assets (169 KB `.vsix`).
  - Native right-click context menu and command palette commands:
    - `Markdown: Render to PDF`
    - `Markdown: Render to Word (.docx)`
    - `godsfell.renderPdf` (legacy alias preserved)
  - Non-blocking execution with progress notifications and cancellation support.
