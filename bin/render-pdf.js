#!/usr/bin/env node

const { renderPdf } = require('../lib/render-pdf');

function parseArgs() {
  const args = process.argv.slice(2);
  let targetFile = null;
  const options = {};

  for (const arg of args) {
    if (arg.startsWith('--out-dir=')) {
      options.outDir = arg.split('=')[1];
    } else if (arg.startsWith('--css=')) {
      options.customCss = arg.split('=')[1];
    } else if (!arg.startsWith('--') && !targetFile) {
      targetFile = arg;
    }
  }
  return { targetFile, options };
}

async function main() {
  try {
    const { targetFile, options } = parseArgs();
    console.log('⏳ Rendering PDF via Chrome...');
    const result = renderPdf(targetFile, options);
    console.log(`🌐 Rendered HTML: ${result.htmlPath}`);
    console.log(`✅ Success! PDF created: ${result.pdfPath} (${result.sizeMb} MB)`);
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
