if (process.argv.includes('--mini-notion-pdf')) require('./pdf.cjs');
else require('./desktop.cjs');
