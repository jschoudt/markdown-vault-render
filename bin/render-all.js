#!/usr/bin/env node

const { renderAll } = require('../lib/render-pdf');

async function main() {
  const startTime = Date.now();
  console.log('🚀 Scanning Markdown files in workspace...');
  try {
    const results = renderAll(process.cwd());
    const successes = results.filter(r => r.success).length;
    const failures = results.filter(r => !r.success).length;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n🎉 Completed in ${elapsed}s: ${successes} rendered, ${failures} errors.`);
    if (failures > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error(`❌ Batch render failed: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
