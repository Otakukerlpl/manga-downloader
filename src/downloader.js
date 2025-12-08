const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const pLimit = require('p-limit');
const archiver = require('archiver');
const { pipeline } = require('stream');
const { promisify } = require('util');
const { getPresetSelector } = require('./presets');
const streamPipeline = promisify(pipeline);

async function fetchImageUrlsWithPuppeteer(url, selector, onLog) {
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch (e) {
    throw new Error('Puppeteer is not installed. Run `npm install puppeteer` to enable JS rendering.');
  }

  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setUserAgent('manga-sniffer/0.1');
    onLog && onLog('Opening page in headless browser...\n');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await autoScroll(page);

    // Get Title too? For now just images, but we could return object
    const imgs = await page.$$eval(selector || 'img', els => els.map(el => el.getAttribute('src') || el.getAttribute('data-src') || el.getAttribute('data-original') || ''));

    // We can also extract title from puppeteer if needed, but cheeerio is usually enough for title
    return imgs.filter(Boolean);
  } finally {
    await browser.close();
  }
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let total = 0;
      const distance = 250;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        total += distance;
        if (total > document.body.scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 200);
    });
  });
}

function makeLogger(options) {
  const onLog = options && typeof options.onLog === 'function' ? options.onLog : null;
  return {
    log: (...args) => {
      const text = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
      if (onLog) onLog(text + '\n'); else process.stdout.write(text + '\n');
    },
    progress: (text) => {
      if (onLog) onLog(text); else process.stdout.write(text);
    }
  };
}

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36';

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Referer': new URL(url).origin + '/'
    }
  });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  return await res.text();
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function resolveUrl(base, relative) {
  try {
    return new URL(relative, base).toString();
  } catch (e) {
    return relative;
  }
}

async function downloadImage(url, destPath, referer) {
  const headers = { 'User-Agent': USER_AGENT };
  if (referer) headers['Referer'] = referer;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  await streamPipeline(res.body, fs.createWriteStream(destPath));
}

async function makeCbz(sourceDir, outFile) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outFile);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', () => resolve());
    archive.on('error', (err) => reject(err));
    archive.pipe(output);
    const files = fs.readdirSync(sourceDir).filter(f => f.match(/\.(jpe?g|png|gif|webp)$/i)).sort();
    for (const file of files) {
      archive.file(path.join(sourceDir, file), { name: file });
    }
    archive.finalize();
  });
}

const AD_KEYWORDS = ['banner', 'logo', 'facebook', 'twitter', 'ads', 'advert', 'promo', 'icon', 'google', 'analytics'];
function isAd(url) {
  const lower = url.toLowerCase();
  return AD_KEYWORDS.some(kw => lower.includes(kw));
}

async function extractImageUrls(url, options = {}) {
  let { selector = 'img' } = options;

  if (!selector || selector === 'img') {
    const preset = getPresetSelector(url);
    if (preset) selector = preset;
  }

  let imageUrls = [];
  let pageTitle = '';

  if (options.usePuppeteer) {
    const imgs = await fetchImageUrlsWithPuppeteer(url, selector, options.onLog);
    imageUrls = imgs.map(u => resolveUrl(url, u));
    // Puppeteer title fetch could be added here if needed, but let's rely on simple fetch for title first
    // or we can allow extraction without title if Puppeteer is forced.
  } else {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    // Extract Title
    pageTitle = $('h1').first().text().trim() || $('title').text().trim();

    const nodes = $(selector).toArray();
    imageUrls = nodes.map(n => $(n).attr('src') || $(n).attr('data-src') || $(n).attr('data-original')).filter(Boolean).map(u => resolveUrl(url, u));
  }

  const seen = new Set();
  imageUrls = imageUrls.filter(u => {
    if (!u) return false;
    if (seen.has(u)) return false;
    if (isAd(u)) return false;
    seen.add(u);
    return true;
  });

  return { imageUrls, selector, title: pageTitle };
}

async function downloadChapter(chapterUrl, options = {}) {
  const { outDir = './downloads', concurrency = 5, makeCbz: cbz = false, onImage } = options;
  const logger = makeLogger(options);

  logger.log(`Fetching page: ${chapterUrl}`);

  const { imageUrls, title } = await extractImageUrls(chapterUrl, options);

  if (imageUrls.length === 0) throw new Error('No images found (or all filtered as ads). Check selector.');
  logger.log(`Found ${imageUrls.length} images.`);

  // Determine Folder Name
  // If we have a title, use it. Otherwise fallback to URL path.
  let folderName = '';
  if (title) {
    // sanitize title
    folderName = title.replace(/[<>:"/\\|?*]+/g, '_').trim();
  }
  if (!folderName) {
    folderName = encodeURIComponent(new URL(chapterUrl).pathname.replace(/\/+/, '_'));
  }

  const chapterFolder = path.join(outDir, folderName);
  ensureDir(chapterFolder);

  logger.log(`Downloading to: ${chapterFolder}`);

  const limit = pLimit(concurrency);
  const tasks = imageUrls.map((imgUrl, idx) => limit(async () => {
    if (onImage) onImage(imgUrl);

    const ext = path.extname(new URL(imgUrl).pathname).split('?')[0] || '.jpg';
    const filename = String(idx + 1).padStart(3, '0') + ext;
    const dest = path.join(chapterFolder, filename);
    logger.progress(`Downloading ${idx + 1}/${imageUrls.length} -> ${filename}\r`);

    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      logger.log(`Skipped (exists) ${filename}`);
      return;
    }
    await downloadImage(imgUrl, dest, chapterUrl);
    logger.log(`Saved ${filename}`);
  }));

  await Promise.all(tasks);
  logger.log('\nAll images downloaded to ' + chapterFolder);

  if (cbz) {
    const outFile = chapterFolder + '.cbz';
    logger.log('Creating CBZ ' + outFile);
    await makeCbz(chapterFolder, outFile);
    logger.log('CBZ created: ' + outFile);
  }
}

module.exports = { downloadChapter, extractImageUrls };
