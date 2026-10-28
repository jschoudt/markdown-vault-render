const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { marked } = require('marked');
const {
  findWorkspaceRoot,
  findChromePath,
  loadCustomStylesheets,
  getTemplateHTML,
  buildVaultFileMap
} = require('./utils');
const { convertWikiLinks } = require('./wikilinks');

marked.setOptions({
  gfm: true,
  breaks: false
});

function renderMarkdownToHTML(markdownText, sourceDir, customCss = '', options = {}) {
  // 1. Strip YAML frontmatter (---) and HTML comment metadata (<!-- ... -->)
  let cleanMarkdown = markdownText
    .replace(/^\s*---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
    .replace(/^\s*<!--[\s\S]*?-->\r?\n?/, '');

  // 2. Convert wikilinks
  cleanMarkdown = convertWikiLinks(cleanMarkdown, options, options.currentRelDir || '', options.vaultMap || null);

  // 3. Process standard relative Markdown links [Text](path/to/target.md)
  if (options.forPdf) {
    cleanMarkdown = cleanMarkdown.replace(/(?<!\!)\[([^\]]+)\]\([^)]+\)/g, '**$1**');
  } else {
    cleanMarkdown = cleanMarkdown.replace(/(\[[^\]]+\]\([^)]+?)\.md(#[^)]+)?\)/g, '$1.html$2)');
  }

  // 4. Render Markdown to HTML via marked
  const renderedContent = marked.parse(cleanMarkdown);

  return getTemplateHTML(sourceDir, customCss).replace('{{ body }}', renderedContent);
}

function findMostRecentFile(workspaceRoot) {
  try {
    const output = execSync(
      'find . -name "*.md" -not -path "*/.*" -not -path "./node_modules/*" -not -path "./rendered/*" -not -path "./rendered-onedrive/*" -exec stat -f "%m %N" {} + | sort -rn | head -n 1',
      { encoding: 'utf8', cwd: workspaceRoot }
    ).trim();
    if (output) {
      return output.split(' ').slice(1).join(' ');
    }
  } catch {
    // ignore
  }
  return null;
}

function renderPdf(targetFile, options = {}) {
  const workspaceRoot = options.workspaceRoot || findWorkspaceRoot(targetFile);
  let fileToRender = targetFile;

  if (!fileToRender) {
    fileToRender = findMostRecentFile(workspaceRoot);
    if (fileToRender) {
      console.log(`ℹ️  No file specified. Using most recently modified file: ${fileToRender}`);
    }
  }

  if (!fileToRender) {
    throw new Error('No markdown or HTML file specified or found in workspace.');
  }

  const absPath = path.isAbsolute(fileToRender) ? fileToRender : path.resolve(workspaceRoot, fileToRender);
  if (!fs.existsSync(absPath)) {
    throw new Error(`File not found: ${absPath}`);
  }

  const ext = path.extname(absPath).toLowerCase();
  const stem = path.basename(absPath, ext);

  let relDir = path.dirname(path.relative(workspaceRoot, absPath));
  if (relDir.startsWith('rendered/')) {
    relDir = relDir.replace(/^rendered\/?/, '');
  } else if (relDir === 'rendered' || relDir === '.') {
    relDir = '';
  }

  const outBaseDir = path.resolve(workspaceRoot, options.outDir || 'rendered');
  const outDir = path.join(outBaseDir, relDir);
  fs.mkdirSync(outDir, { recursive: true });

  const htmlPath = path.join(outDir, `${stem}.html`);
  const pdfPath = path.join(outDir, `${stem}.pdf`);
  const printTmpHtmlPath = path.join(outDir, `${stem}.print.tmp.html`);
  const sourceDir = path.dirname(absPath);

  if (ext === '.md') {
    const mdContent = fs.readFileSync(absPath, 'utf8');
    const customCss = loadCustomStylesheets(workspaceRoot, options.customCss);
    const vaultMap = buildVaultFileMap(workspaceRoot);

    // 1. Render interactive HTML with working links
    const htmlContent = renderMarkdownToHTML(mdContent, sourceDir, customCss, {
      forPdf: false,
      currentRelDir: relDir,
      vaultMap
    });
    fs.writeFileSync(htmlPath, htmlContent, 'utf8');

    // 2. Render print-specific HTML (with bold text for links) for clean PDF export
    const printHtmlContent = renderMarkdownToHTML(mdContent, sourceDir, customCss, {
      forPdf: true,
      currentRelDir: relDir,
      vaultMap
    });
    fs.writeFileSync(printTmpHtmlPath, printHtmlContent, 'utf8');
  } else if (ext === '.html') {
    if (absPath !== htmlPath) {
      fs.copyFileSync(absPath, htmlPath);
    }
    fs.copyFileSync(htmlPath, printTmpHtmlPath);
  } else {
    throw new Error(`Unsupported file type ${ext}. Please specify a .md or .html file.`);
  }

  const chromePath = options.chromePath || findChromePath();
  if (!chromePath) {
    if (fs.existsSync(printTmpHtmlPath)) fs.unlinkSync(printTmpHtmlPath);
    throw new Error('Google Chrome / Chromium was not found on this system.');
  }

  try {
    execSync(
      `"${chromePath}" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="${pdfPath}" "file://${printTmpHtmlPath}" 2>/dev/null`
    );
    if (fs.existsSync(printTmpHtmlPath)) {
      fs.unlinkSync(printTmpHtmlPath);
    }
    const stats = fs.statSync(pdfPath);
    return {
      success: true,
      absSourcePath: absPath,
      pdfPath,
      htmlPath,
      sizeBytes: stats.size,
      sizeMb: (stats.size / (1024 * 1024)).toFixed(2)
    };
  } catch (err) {
    if (fs.existsSync(printTmpHtmlPath)) {
      fs.unlinkSync(printTmpHtmlPath);
    }
    throw new Error(`Chrome PDF export failed: ${err.message}`);
  }
}

function renderAll(workspaceRoot, options = {}) {
  const root = workspaceRoot || findWorkspaceRoot();
  const chromePath = options.chromePath || findChromePath();

  if (!chromePath) {
    throw new Error('Google Chrome / Chromium was not found on this system.');
  }

  const files = execSync(
    'find . -name "*.md" -not -path "*/.git/*" -not -path "*/node_modules/*" -not -path "./rendered/*" -not -path "./rendered-onedrive/*"',
    { encoding: 'utf8', cwd: root }
  ).trim().split('\n').filter(Boolean).map(f => f.replace(/^\.\//, ''));

  const customCss = loadCustomStylesheets(root, options.customCss);
  const vaultMap = buildVaultFileMap(root);
  const results = [];

  for (let i = 0; i < files.length; i++) {
    const relPath = files[i];
    const absPath = path.resolve(root, relPath);
    const ext = path.extname(absPath);
    const stem = path.basename(absPath, ext);
    let relDir = path.dirname(relPath);
    if (relDir === '.') relDir = '';

    const outDir = path.join(root, options.outDir || 'rendered', relDir);
    fs.mkdirSync(outDir, { recursive: true });

    const htmlPath = path.join(outDir, `${stem}.html`);
    const printTmpHtmlPath = path.join(outDir, `${stem}.print.tmp.html`);
    const pdfPath = path.join(outDir, `${stem}.pdf`);
    const sourceDir = path.dirname(absPath);

    const mdContent = fs.readFileSync(absPath, 'utf8');

    // 1. Generate interactive HTML
    const htmlContent = renderMarkdownToHTML(mdContent, sourceDir, customCss, {
      forPdf: false,
      currentRelDir: relDir,
      vaultMap
    });
    fs.writeFileSync(htmlPath, htmlContent, 'utf8');

    // 2. Generate print HTML
    const printHtmlContent = renderMarkdownToHTML(mdContent, sourceDir, customCss, {
      forPdf: true,
      currentRelDir: relDir,
      vaultMap
    });
    fs.writeFileSync(printTmpHtmlPath, printHtmlContent, 'utf8');

    try {
      execSync(
        `"${chromePath}" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="${pdfPath}" "file://${printTmpHtmlPath}" 2>/dev/null`
      );
      if (fs.existsSync(printTmpHtmlPath)) {
        fs.unlinkSync(printTmpHtmlPath);
      }
      results.push({ relPath, success: true, pdfPath });
    } catch (err) {
      if (fs.existsSync(printTmpHtmlPath)) {
        fs.unlinkSync(printTmpHtmlPath);
      }
      results.push({ relPath, success: false, error: err.message });
    }
  }

  return results;
}

module.exports = {
  renderMarkdownToHTML,
  renderPdf,
  renderAll
};
