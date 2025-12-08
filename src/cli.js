#!/usr/bin/env node

const path = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const downloader = require('./downloader');

const argv = yargs(hideBin(process.argv))
  .usage('Usage: $0 --url <chapter-page-url> [options]')
  .option('url', { type: 'string', describe: 'Chapter page URL that lists image URLs', demandOption: true })
  .option('selector', { type: 'string', describe: 'CSS selector to find image tags (defaults to img)', default: 'img' })
  .option('output', { type: 'string', describe: 'Output directory', default: './downloads' })
  .option('concurrency', { type: 'number', describe: 'Concurrent downloads', default: 5 })
  .option('cbz', { type: 'boolean', describe: 'Create CBZ archive after download', default: false })
  .option('use-puppeteer', { type: 'boolean', describe: 'Use Puppeteer (JS rendering) to extract images', default: false })
  .option('interactive-auth', { type: 'boolean', describe: 'If using Puppeteer, open visible browser for manual login/unlock', default: false })
  .example('$0 --url "https://example.com/chapter1.html" --selector ".page img"')
  .help()
  .argv;

(async () => {
  try {
    const outDir = path.resolve(process.cwd(), argv.output);
    await downloader.downloadChapter(argv.url, {
      selector: argv.selector,
      outDir,
      concurrency: argv.concurrency,
      makeCbz: argv.cbz,
      usePuppeteer: !!argv['use-puppeteer'],
      interactiveAuth: !!argv['interactive-auth'],
    });
    console.log('\nDone.');
  } catch (err) {
    console.error('Error:', err.message || err);
    process.exit(1);
  }
})();
