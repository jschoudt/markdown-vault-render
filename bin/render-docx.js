#!/usr/bin/env node

const { renderDocx } = require('../lib/render-docx');

function parseArgs() {
  const args = process.argv.slice(2);
  let targetFile = null;
  const options = {
    outDir: 'rendered-onedrive',
    flatOnly: false,
    treeOnly: false
  };

  for (const arg of args) {
    if (arg.startsWith('--out-dir=')) {
      options.outDir = arg.split('=')[1];
    } else if (arg.startsWith('--reference-doc=')) {
      options.referenceDoc = arg.split('=')[1];
    } else if (arg.startsWith('--lua-filter=')) {
      options.luaFilter = arg.split('=')[1];
    } else if (arg === '--flat') {
      options.flatOnly = true;
    } else if (arg === '--tree') {
      options.treeOnly = true;
    } else if (!arg.startsWith('--') && !targetFile) {
      targetFile = arg;
    }
  }

  return { targetFile, options };
}

async function main() {
  try {
    const { targetFile, options } = parseArgs();
    console.log('⏳ Converting to Word document with Pandoc...');
    const result = renderDocx(targetFile, options);
    console.log(`✅ Success! Rendered in ${result.elapsedSec}s (${result.sizeMb} MB):`);
    console.log(`   📁 Output: ${result.docxPath}`);
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
