const { extractImageUrls } = require('../src/downloader');

(async () => {
  const url = process.argv[2] || 'https://miku-doujin.com/fpxwd/';
  try {
    console.log('URL:', url, '\n');

    console.log('--- Cheerio extraction (no Puppeteer) ---');
    const r1 = await extractImageUrls(url, { usePuppeteer: false, onLog: (t) => process.stdout.write(t) });
    console.log('\nFound images (cheerio):', r1.imageUrls.length);
    r1.imageUrls.forEach((u, i) => console.log(i + 1, u));

    console.log('\n--- Puppeteer extraction (if installed) ---');
    try {
      const r2 = await extractImageUrls(url, { usePuppeteer: true, onLog: (t) => process.stdout.write(t) });
      console.log('\nFound images (puppeteer):', r2.imageUrls.length);
      r2.imageUrls.forEach((u, i) => console.log(i + 1, u));
    } catch (e) {
      console.error('\nPuppeteer extraction failed:', e.message || e);
      console.error('If you want Puppeteer extraction, run `npm install puppeteer` first.');
    }

  } catch (err) {
    console.error('Error:', err.message || err);
    process.exitCode = 1;
  }
})();
