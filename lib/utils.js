const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getBundledAssetPath(assetName) {
  return path.resolve(__dirname, '..', 'assets', assetName);
}

function findWorkspaceRoot(targetPath) {
  const candidates = [];
  if (targetPath) {
    candidates.push(path.isAbsolute(targetPath) ? targetPath : path.resolve(targetPath));
  }
  candidates.push(process.cwd());

  for (const candidate of candidates) {
    try {
      let curr = fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()
        ? candidate
        : path.dirname(candidate);
      while (curr && curr !== path.dirname(curr)) {
        if (
          fs.existsSync(path.join(curr, '.git')) ||
          fs.existsSync(path.join(curr, '.obsidian')) ||
          fs.existsSync(path.join(curr, '.vscode')) ||
          fs.existsSync(path.join(curr, 'package.json'))
        ) {
          return curr;
        }
        curr = path.dirname(curr);
      }
    } catch {
      // ignore and continue
    }
  }
  return targetPath ? path.dirname(path.resolve(targetPath)) : process.cwd();
}

function findChromePath() {
  // macOS standard locations
  const macPaths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
  ];
  for (const p of macPaths) {
    if (fs.existsSync(p)) return p;
  }

  // Windows standard paths
  const winPaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  for (const winPath of winPaths) {
    if (winPath && fs.existsSync(winPath)) return winPath;
  }

  // Linux / PATH
  try {
    return execSync('which google-chrome || which chromium-browser || which chromium || where chrome.exe', { encoding: 'utf8' }).trim().split('\n')[0].trim();
  } catch {
    return null;
  }
}

function findPandocPath() {
  const standardPaths = [
    '/opt/homebrew/bin/pandoc',
    '/usr/local/bin/pandoc',
    '/usr/bin/pandoc'
  ];
  for (const p of standardPaths) {
    if (fs.existsSync(p)) return p;
  }
  try {
    return execSync('which pandoc || where pandoc.exe', { encoding: 'utf8' }).trim().split('\n')[0].trim();
  } catch {
    return null;
  }
}

function loadCustomStylesheets(workspaceRoot, customCssPath) {
  let cssContent = '';

  if (customCssPath && fs.existsSync(customCssPath)) {
    return fs.readFileSync(customCssPath, 'utf8');
  }

  const settingsPath = path.join(workspaceRoot, '.vscode', 'settings.json');
  let styleFiles = [];

  if (fs.existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      if (Array.isArray(settings['markdown.styles'])) {
        styleFiles = settings['markdown.styles'];
      }
    } catch {
      // Ignore JSON parse errors
    }
  }

  if (styleFiles.length === 0) {
    const localCss = path.join(workspaceRoot, 'styles', 'clean-print.css');
    if (fs.existsSync(localCss)) {
      styleFiles.push(localCss);
    }
  }

  for (const styleFile of styleFiles) {
    const fullPath = path.isAbsolute(styleFile)
      ? styleFile
      : path.resolve(workspaceRoot, styleFile);
    if (fs.existsSync(fullPath)) {
      cssContent += `\n/* Stylesheet: ${styleFile} */\n` + fs.readFileSync(fullPath, 'utf8') + '\n';
    }
  }

  if (!cssContent) {
    const defaultCss = getBundledAssetPath('clean-print.css');
    if (fs.existsSync(defaultCss)) {
      cssContent = `\n/* Default Bundled Stylesheet */\n` + fs.readFileSync(defaultCss, 'utf8') + '\n';
    }
  }

  return cssContent;
}

function getTemplateHTML(sourceDir, customCss = '') {
  const baseHref = sourceDir.endsWith('/') ? sourceDir : sourceDir + '/';

  return `<!DOCTYPE html>
<html lang="en">
    <head>
        <meta http-equiv="Content-Type" content="text/html;charset=utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <base href="file://${baseHref}" target="_blank" />
        <link href="https://fonts.googleapis.com/css?family=Open+Sans:400,300,600,700" rel="stylesheet" type="text/css" />
        ${customCss ? `<style id="workspace-custom-css">\n${customCss}\n</style>` : ''}
    </head>
    <body>
        <div class="page">
            <div class="columnWrapper">
{{ body }}
            </div>
        </div>
    </body>
</html>`;
}

function buildVaultFileMap(workspaceRoot) {
  const map = new Map();
  try {
    const files = execSync(
      'find . -name "*.md" -not -path "*/.git/*" -not -path "*/node_modules/*" -not -path "./rendered/*" -not -path "./rendered-onedrive/*"',
      { encoding: 'utf8', cwd: workspaceRoot }
    ).trim().split('\n').filter(Boolean);

    for (let f of files) {
      f = f.replace(/^\.\//, '');
      const stem = path.basename(f, '.md');
      const htmlRel = f.replace(/\.md$/, '.html');
      if (!map.has(stem.toLowerCase())) {
        map.set(stem.toLowerCase(), htmlRel);
      }
    }
  } catch {
    // ignore
  }
  return map;
}

module.exports = {
  getBundledAssetPath,
  findWorkspaceRoot,
  findChromePath,
  findPandocPath,
  loadCustomStylesheets,
  getTemplateHTML,
  buildVaultFileMap
};
