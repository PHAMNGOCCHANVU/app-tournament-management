const fs = require('fs');
const path = require('path');

let indexHtml = fs.readFileSync(path.join(__dirname, 'Index.html'), 'utf8');

// Replace all <?!= include('FileName'); ?> scriptlets with actual file contents
indexHtml = indexHtml.replace(/<\?!= include\('([^']+)'\); \?>/g, (match, fileName) => {
  const filePath = path.join(__dirname, `${fileName}.html`);
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf8');
  }
  console.warn(`Warning: File not found: ${filePath}`);
  return match;
});

// Replace server-injected parameters with local preview defaults
indexHtml = indexHtml.replace(/<\?= initialPage \?>/g, 'dashboard');
indexHtml = indexHtml.replace(/<\?= tournamentId \?>/g, '');

// Save to preview.html
fs.writeFileSync(path.join(__dirname, 'preview.html'), indexHtml, 'utf8');
console.log('Successfully generated preview.html (' + indexHtml.length + ' bytes)');
