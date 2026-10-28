const utils = require('./utils');
const wikilinks = require('./wikilinks');
const renderPdf = require('./render-pdf');
const renderDocx = require('./render-docx');

module.exports = {
  ...utils,
  ...wikilinks,
  ...renderPdf,
  ...renderDocx
};
