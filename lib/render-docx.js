const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const {
  findWorkspaceRoot,
  findPandocPath,
  getBundledAssetPath
} = require('./utils');
const { convertWikiLinks } = require('./wikilinks');

function preprocessMarkdown(rawMarkdown) {
  // 1. Strip HTML comment metadata (<!-- ... -->)
  let clean = rawMarkdown.replace(/^\s*<!--[\s\S]*?-->\r?\n?/, '');

  // 2. Convert legacy wikilinks to clean text / relative docx links
  clean = convertWikiLinks(clean, { forDocx: true });

  // 3. Convert lines starting with unicode bullets (• or ·) to standard Markdown bullet items (- )
  clean = clean.replace(/^([ \t]*)[•·][ \t]+/gm, '$1- ');

  // 4. Prevent duplicate titles:
  const yamlMatch = clean.match(/^\s*---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (yamlMatch) {
    const yamlBody = yamlMatch[1];
    const afterYaml = clean.substring(yamlMatch[0].length).trim();
    const firstHeaderMatch = afterYaml.match(/^#\s+(.+)$/m);
    const titleMatch = yamlBody.match(/^title:\s*["']?([^"'\r\n]+)["']?/m);

    if (titleMatch && firstHeaderMatch) {
      const yamlTitle = titleMatch[1].trim().toLowerCase();
      const headerTitle = firstHeaderMatch[1].trim().toLowerCase();
      if (yamlTitle === headerTitle) {
        const modifiedYaml = yamlBody.replace(/^title:\s*["']?[^"'\r\n]+["']?\r?\n?/m, '');
        clean = `---\n${modifiedYaml}\n---\n\n` + afterYaml;
      }
    }
  }

  // 5. Convert <div class="statblock"...> containers into Pandoc fenced divs ::: {.statblock}
  clean = clean.replace(/<div\b[^>]*class=["'][^"']*\bstatblock\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi, (match, inner) => {
    return `\n\n::: {.statblock}\n${inner.trim()}\n:::\n\n`;
  });

  // 6. Convert <div class="npc-block"...> or <div class="npc-card"...> containers into Markdown blockquotes
  clean = clean.replace(/<div\b[^>]*class=["'][^"']*\bnpc-(?:block|card)\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi, (match, inner) => {
    const lines = inner.trim().split(/\r?\n/).map(l => `> ${l}`);
    return `\n\n${lines.join('\n')}\n\n`;
  });

  return clean;
}

function convertDocumentImages(markdownText, sourceDir) {
  const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const tempImages = [];

  const convertedMarkdown = markdownText.replace(imgRegex, (match, alt, srcPath) => {
    if (srcPath.startsWith('http://') || srcPath.startsWith('https://')) {
      return match;
    }

    const absImgPath = path.isAbsolute(srcPath) ? srcPath : path.resolve(sourceDir, srcPath);
    if (!fs.existsSync(absImgPath)) {
      return match;
    }

    const ext = path.extname(absImgPath).toLowerCase();
    if (ext === '.webp' || ext === '.svg') {
      const stem = path.basename(absImgPath, ext);
      const tmpPngName = `.${stem}.tmp-docx-${Date.now()}-${Math.random().toString(36).substring(2, 6)}.png`;
      const tmpPngPath = path.join(sourceDir, tmpPngName);

      try {
        if (ext === '.webp') {
          execSync(`/usr/bin/sips -s format png "${absImgPath}" --out "${tmpPngPath}"`, { stdio: 'ignore' });
        } else if (ext === '.svg') {
          const rsvg = fs.existsSync('/opt/homebrew/bin/rsvg-convert') ? '/opt/homebrew/bin/rsvg-convert' : 'rsvg-convert';
          execSync(`"${rsvg}" -f png "${absImgPath}" -o "${tmpPngPath}"`, { stdio: 'ignore' });
        }
        if (fs.existsSync(tmpPngPath)) {
          tempImages.push(tmpPngPath);
          return `![${alt}](${tmpPngName})`;
        }
      } catch {
        return match;
      }
    }
    return match;
  });

  return { convertedMarkdown, tempImages };
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

function renderDocx(targetFile, options = {}) {
  const startTime = Date.now();
  const workspaceRoot = options.workspaceRoot || findWorkspaceRoot(targetFile);

  const pandocPath = options.pandocPath || findPandocPath();
  if (!pandocPath) {
    throw new Error('Pandoc was not found. Please install pandoc: brew install pandoc');
  }

  let fileToRender = targetFile;
  if (!fileToRender) {
    fileToRender = findMostRecentFile(workspaceRoot);
    if (fileToRender) {
      console.log(`ℹ️  No file specified. Using most recently modified file: ${fileToRender}`);
    }
  }

  if (!fileToRender) {
    throw new Error('No markdown file specified or found in workspace.');
  }

  const absPath = path.isAbsolute(fileToRender) ? fileToRender : path.resolve(workspaceRoot, fileToRender);
  if (!fs.existsSync(absPath)) {
    throw new Error(`File not found: ${absPath}`);
  }

  const ext = path.extname(absPath).toLowerCase();
  if (ext !== '.md') {
    throw new Error(`Unsupported file type ${ext}. Please specify a .md file.`);
  }

  const stem = path.basename(absPath, ext);
  const sourceDir = path.dirname(absPath);

  let relDir = path.dirname(path.relative(workspaceRoot, absPath));
  if (relDir.startsWith('rendered/')) relDir = relDir.replace(/^rendered\/?/, '');
  if (relDir === '.') relDir = '';

  const baseOutDir = path.resolve(workspaceRoot, options.outDir || 'rendered-onedrive');
  if (!fs.existsSync(baseOutDir)) {
    fs.mkdirSync(baseOutDir, { recursive: true });
  }

  const treeOutDir = path.join(baseOutDir, relDir);
  fs.mkdirSync(treeOutDir, { recursive: true });

  const treeDocxPath = path.join(treeOutDir, `${stem}.docx`);
  const flatDocxPath = path.join(baseOutDir, `${stem}.docx`);
  const primaryOutPath = options.flatOnly ? flatDocxPath : treeDocxPath;

  // Resolve reference.docx
  let referenceDoc = options.referenceDoc ? path.resolve(workspaceRoot, options.referenceDoc) : null;
  if (!referenceDoc || !fs.existsSync(referenceDoc)) {
    const localRef = path.join(workspaceRoot, 'styles', 'reference.docx');
    referenceDoc = fs.existsSync(localRef) ? localRef : getBundledAssetPath('reference.docx');
  }

  // Resolve docx-filter.lua
  let luaFilter = options.luaFilter ? path.resolve(workspaceRoot, options.luaFilter) : null;
  if (!luaFilter || !fs.existsSync(luaFilter)) {
    const localLua = path.join(workspaceRoot, 'scripts', 'docx-filter.lua');
    luaFilter = fs.existsSync(localLua) ? localLua : getBundledAssetPath('docx-filter.lua');
  }

  // Resolve style-statblocks.py
  let styleScript = options.statblockScript ? path.resolve(workspaceRoot, options.statblockScript) : null;
  if (!styleScript || !fs.existsSync(styleScript)) {
    const localScript = path.join(workspaceRoot, 'scripts', 'style-statblocks.py');
    styleScript = fs.existsSync(localScript) ? localScript : getBundledAssetPath('style-statblocks.py');
  }

  // Preprocess markdown
  const rawContent = fs.readFileSync(absPath, 'utf8');
  let cleanContent = preprocessMarkdown(rawContent);
  const { convertedMarkdown, tempImages } = convertDocumentImages(cleanContent, sourceDir);
  cleanContent = convertedMarkdown;

  const tempMdName = `.${stem}.tmp.render-docx.md`;
  const tempMdPath = path.join(sourceDir, tempMdName);
  fs.writeFileSync(tempMdPath, cleanContent, 'utf8');

  const pandocArgs = [
    `"${pandocPath}"`,
    '-f', 'gfm+fenced_divs',
    '-t', 'docx',
    `"${tempMdName}"`,
    `-o "${primaryOutPath}"`
  ];

  if (fs.existsSync(referenceDoc)) {
    pandocArgs.push(`--reference-doc="${referenceDoc}"`);
  }

  if (fs.existsSync(luaFilter)) {
    pandocArgs.push(`--lua-filter="${luaFilter}"`);
  }

  try {
    execSync(pandocArgs.join(' '), { cwd: sourceDir });

    // Post-process statblocks
    if (fs.existsSync(styleScript)) {
      try {
        execSync(`python3 "${styleScript}" "${primaryOutPath}"`, { encoding: 'utf8', stdio: 'ignore' });
      } catch (err) {
        // Warning only
      }
    }

    const stats = fs.statSync(primaryOutPath);
    const mb = (stats.size / (1024 * 1024)).toFixed(2);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    return {
      success: true,
      absSourcePath: absPath,
      docxPath: primaryOutPath,
      sizeBytes: stats.size,
      sizeMb: mb,
      elapsedSec: elapsed
    };
  } finally {
    if (fs.existsSync(tempMdPath)) {
      try { fs.unlinkSync(tempMdPath); } catch {}
    }
    for (const imgPath of tempImages) {
      if (fs.existsSync(imgPath)) {
        try { fs.unlinkSync(imgPath); } catch {}
      }
    }
  }
}

module.exports = {
  preprocessMarkdown,
  convertDocumentImages,
  renderDocx
};
