# Markdown Vault Render

Universal renderer and IDE extension for tabletop RPG, lore, and vault Markdown documents.

Compiles Markdown into clean, print-ready **PDFs** (via headless Chrome) and beautifully formatted **Word documents (.docx)** (via Pandoc), complete with Obsidian-style wikilinks, OpenXML pagebreaks, automatic image conversion, and D&D 5e statblock formatting.

---

## Features

- 📄 **Print-Ready PDFs:** Formats clean, multi-column print HTML and compiles to PDF using headless Chrome/Chromium.
- 📝 **Microsoft Word (.docx) Compilation:** Converts Markdown to clean Word documents with proper bullet lists, OpenXML horizontal rules, and page breaks.
- ⚔️ **D&D / Tabletop Statblocks:** Automatically recognizes `<div class="statblock">` or Pandoc fenced divs `::: {.statblock}` and styles them with borders, shading, and padding via an OpenXML post-processor.
- 🔗 **Wikilinks & Relative Link Handling:** Converts `[[Target|Display]]` and embedded `![[Image/Note]]` seamlessly. Replaces hyperlinks with bold text for print PDF exports.
- 🖼️ **On-the-fly Image Conversion:** Converts `.webp` and `.svg` files to `.png` on-the-fly so Word Online / Microsoft Word can display them natively.
- 🧩 **Zero-Clutter Consumer Repos:** Works across **any** Markdown repository. No need to install scripts or `node_modules` into your content vaults.
- 💻 **Universal IDE Extension:** Installs into Antigravity IDE and VS Code, offering right-click context menus:
  - `Render to PDF`
  - `Render to Word (.docx)`

---

## Installation

### 1. Requirements

- **Node.js** (v18+)
- **Google Chrome**, Chromium, Brave, or Edge (for PDF rendering)
- **Pandoc** (for DOCX rendering):
  ```bash
  brew install pandoc
  ```
- **Optional (for DOCX statblock styling & SVG conversion):**
  ```bash
  pip3 install python-docx
  brew install librsvg
  ```

### 2. Global CLI Installation

From this repository:
```bash
npm install
npm link
```
Now `render-pdf`, `render-docx`, and `render-all` are available everywhere in your shell!

### 3. IDE Extension Installation

To package and install the extension into Antigravity IDE & VS Code:
```bash
cd extension
npm run package
npm run install-extension
```

---

## CLI Usage

Run these commands inside **any** Markdown repository or vault:

### Render a Single File to PDF
```bash
render-pdf "04-Dramatis-Personae/Tali.md"
# Or auto-detect the most recently modified markdown file:
render-pdf
```
Output: `rendered/<relative-path>/<filename>.pdf` and `.html`

### Render a Single File to Word (.docx)
```bash
render-docx "04-Dramatis-Personae/Tali.md"
# Flat output directly into target directory:
render-docx "04-Dramatis-Personae/Tali.md" --flat
```
Output: `rendered-onedrive/<relative-path>/<filename>.docx`

### Batch Render All Files in Vault
```bash
render-all
```

---

## IDE Extension Usage

1. Open any `.md` file in Antigravity IDE or VS Code.
2. Right-click anywhere in the editor or the file in the Explorer tree.
3. Select:
   - **Render to PDF**
   - **Render to Word (.docx)**
4. The file renders with a progress toast and opens automatically in the editor preview (for PDF) or OS default application (for DOCX).

---

## Custom Styling & Overrides

By default, the renderer uses the bundled clean-print styles and Word templates. You can customize them per-vault:

- **CSS:** Place custom CSS in `<vault>/styles/clean-print.css` or configure `"markdown.styles"` in `.vscode/settings.json`.
- **DOCX Template:** Place a custom Word template in `<vault>/styles/reference.docx`.
- **Lua Filter:** Place a custom filter in `<vault>/scripts/docx-filter.lua`.

If not present in the vault, the renderer automatically falls back to its own bundled assets.

---

## Repository Structure

```text
markdown-vault-render/
├── assets/
│   ├── clean-print.css         # Default print stylesheet
│   ├── reference.docx          # Default Pandoc Word template
│   ├── docx-filter.lua         # Pandoc OpenXML Lua filter
│   └── style-statblocks.py     # DOCX statblock post-processing script
├── bin/
│   ├── cli.js                  # Unified CLI
│   ├── render-pdf.js           # PDF CLI command
│   ├── render-docx.js          # DOCX CLI command
│   └── render-all.js           # Batch render CLI command
├── lib/
│   ├── index.js                # Library entry point
│   ├── render-pdf.js           # Headless Chrome HTML & PDF engine
│   ├── render-docx.js          # Preprocessing & Pandoc DOCX engine
│   ├── wikilinks.js            # Wikilink & link converter
│   └── utils.js                # Browser/Pandoc discovery & asset loader
├── extension/                  # Antigravity IDE / VS Code Extension
│   ├── package.json
│   ├── extension.js            # Universal right-click command provider
│   ├── runner.js               # Subprocess runner
│   ├── lib/ & assets/          # Bundled runtime engine
│   └── markdown-vault-render-1.1.0.vsix
├── package.json
└── README.md
```

## License

MIT
