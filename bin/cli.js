#!/usr/bin/env node

const command = process.argv[2];

function printUsage() {
  console.log(`
Usage:
  markdown-vault-render <command> [options]

Commands:
  pdf [file] [--css=file] [--out-dir=rendered]
      Render markdown file to HTML and PDF via Chrome.

  docx [file] [--reference-doc=file] [--flat] [--tree] [--out-dir=rendered-onedrive]
      Render markdown file to DOCX via Pandoc.

  all [--out-dir=rendered]
      Batch render all markdown files in workspace to HTML and PDF.

Examples:
  markdown-vault-render pdf Note.md
  markdown-vault-render docx Note.md --flat
  markdown-vault-render all
`);
}

if (!command || command === '--help' || command === '-h') {
  printUsage();
  process.exit(0);
}

// Re-route to appropriate script
process.argv.splice(2, 1);
if (command === 'pdf') {
  require('./render-pdf');
} else if (command === 'docx') {
  require('./render-docx');
} else if (command === 'all') {
  require('./render-all');
} else {
  // If first arg looks like a file, default to pdf
  process.argv.splice(2, 0, command);
  require('./render-pdf');
}
