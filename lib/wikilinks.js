const path = require('path');

function resolveWikiLink(target, currentRelDir = '', vaultMap = null) {
  let [noteName, anchor] = target.split('#');
  noteName = noteName.trim();
  const slugAnchor = anchor ? `#${encodeURIComponent(anchor.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-'))}` : '';

  if (!noteName && anchor) {
    return slugAnchor;
  }

  const mappedHtml = vaultMap ? vaultMap.get(noteName.toLowerCase()) : null;
  if (mappedHtml) {
    const fromDir = path.join('rendered', currentRelDir);
    const toFile = path.join('rendered', mappedHtml);
    let relPath = path.relative(fromDir, toFile);
    return relPath.split('/').map(encodeURIComponent).join('/') + slugAnchor;
  }
  return encodeURIComponent(noteName) + '.html' + slugAnchor;
}

function convertWikiLinks(text, options = {}, currentRelDir = '', vaultMap = null) {
  const forPdf = !!options.forPdf;
  const forDocx = !!options.forDocx;

  // Handle embedded wikilinks: ![[target]]
  text = text.replace(/!\[\[([^\\]]+)(?:\\\|([^\\]]+))?\]\]/g, (match, target, display) => {
    let disp = (display || target).trim();
    if (forPdf || forDocx) {
      return `**${disp}**`;
    } else {
      const href = resolveWikiLink(target, currentRelDir, vaultMap);
      return `<strong><a href="${href}" class="wiki-link">${disp}</a></strong>`;
    }
  });

  // Handle standard wikilinks: [[Target|Display]] or [[Target]]
  text = text.replace(/\[\[([^\\]|\\\\]+)(?:\\\\?\\|([^\\]]+))?\]\]/g, (match, target, display) => {
    let disp = (display || target).trim();
    if (!display && target.includes('#')) {
      disp = target.split('#')[1].trim();
    }
    if (forPdf) {
      return `**${disp}**`;
    } else if (forDocx) {
      return `[${disp}](${encodeURIComponent(target)}.docx)`;
    } else {
      const href = resolveWikiLink(target, currentRelDir, vaultMap);
      return `<a href="${href}" class="wiki-link">${disp}</a>`;
    }
  });

  return text;
}

module.exports = {
  resolveWikiLink,
  convertWikiLinks
};
