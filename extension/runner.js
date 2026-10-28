#!/usr/bin/env node

const format = process.argv[2];
const targetFile = process.argv[3];
const workspaceRoot = process.argv[4];

if (!targetFile) {
  console.error('No target file provided.');
  process.exit(1);
}

try {
  if (format === 'docx') {
    const { renderDocx } = require('./lib/render-docx');
    const result = renderDocx(targetFile, { workspaceRoot });
    console.log('OUTPUT_FILE:' + result.docxPath);
  } else {
    const { renderPdf } = require('./lib/render-pdf');
    const result = renderPdf(targetFile, { workspaceRoot });
    console.log('OUTPUT_FILE:' + result.pdfPath);
  }
} catch (err) {
  console.error(err.message || String(err));
  process.exit(1);
}
