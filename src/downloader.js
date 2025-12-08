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

// Enhanced Ad Keywords
const AD_KEYWORDS = ['banner', 'logo', 'facebook', 'twitter', 'ads', 'advert', 'promo', 'icon', 'google', 'analytics', 'live', 'casino', 'bet', 'slot', 'game', 'gif'];

async function fetchImageUrlsWithPuppeteer(url, selector, onLog, options = {}) {
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch (e) {
    throw new Error('Puppeteer is not installed. Run `npm install puppeteer` to enable JS rendering.');
  }
  const launchOpts = { args: ['--no-sandbox', '--disable-setuid-sandbox'] };
  // If interactiveAuth is requested, run with visible browser to allow manual login.
  if (options.interactiveAuth) {
    launchOpts.headless = false;
    launchOpts.defaultViewport = null;
    launchOpts.args.push('--start-maximized');
  }

  const browser = await puppeteer.launch(launchOpts);
  try {
    const page = await browser.newPage();
    await page.setUserAgent('manga-sniffer/0.1');
    onLog && onLog('Opening page in headless browser...\n');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    // If the site requires authentication/coins, allow the user to login interactively.
    if (options.interactiveAuth) {
      onLog && onLog('Interactive auth enabled. Please log in or unlock content in the opened browser.\n');
      // Wait for user to press Enter in the terminal to continue.
      await new Promise((resolve) => {
        const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
        rl.question('After logging in/unlocking the content in the browser, press Enter here to continue...\n', () => {
          rl.close();
          resolve();
        });
      });
      // Give page a moment to finish any post-login navigation
      await page.waitForTimeout(1200);
      // Re-navigate to ensure content is loaded
      try { await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 }); } catch (e) { /* ignore */ }
      await autoScroll(page);
    }

    // Attempt to remove common overlays/paywall elements (non-bypass: just hide DOM overlays so images become visible)
    try {
      const host = new URL(url).hostname.toLowerCase();
      await page.evaluate((host) => {
        // Generic overlay removal helpers
        const selectors = ['.overlay', '.paywall', '.locked', '.lock', '.lock-overlay', '.premium-overlay', '.modal', '.paywall-overlay'];
        selectors.forEach(s => document.querySelectorAll(s).forEach(el => el.remove()));
        // Try to click obvious unlock buttons
        const btns = Array.from(document.querySelectorAll('button, a')).filter(el => /unlock|ปลด|จ่าย|coin|payment|buy/i.test(el.textContent || el.getAttribute('aria-label') || ''));
        btns.slice(0, 3).forEach(b => { try { b.click(); } catch (e) { } });
      }, host);
    } catch (e) {
      // ignore overlay removal errors
    }

    await autoScroll(page);

    // Get Title too? For now just images, but we could return object
    // Also capture naturalWidth and naturalHeight to filter tiny images (ads/icons)
    const imgsData = await page.$$eval(selector || 'img', els => els.map(el => ({
      src: el.getAttribute('data-src') || el.getAttribute('data-original') || el.getAttribute('src') || (el.style && el.style.backgroundImage ? el.style.backgroundImage.replace(/url\((?:'|")?(.*?)(?:'|")?\)/, '$1') : '') || '',
      width: el.naturalWidth,
      height: el.naturalHeight
    })));

    // Capture cookies
    const cookies = await page.cookies();

    return { imgs: imgsData, cookies };
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

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Referer': new URL(url).origin + '/'
    }
  });
  if (!res.ok) {
    const error = new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
    error.status = res.status;
    throw error;
  }
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

async function downloadImage(url, destPath, referer, cookies, options = {}) {
  const maxRetries = 3;
  const headersBase = { 'User-Agent': USER_AGENT };
  if (referer) headersBase['Referer'] = referer;
  if (cookies && cookies.length > 0) {
    headersBase['Cookie'] = cookies.map(c => `${c.name}=${c.value}`).join('; ');
  }

  // Try fetching with node-fetch and retry on transient errors.
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, { headers: headersBase });
      if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
      await streamPipeline(res.body, fs.createWriteStream(destPath));
      return;
    } catch (err) {
      const isLast = attempt === maxRetries;
      // If last attempt and Puppeteer fallback allowed, try via Puppeteer (helps with Cloudflare/TLS)
      if (isLast && options.usePuppeteer) {
        try {
          await downloadImageViaPuppeteer(url, destPath, referer, cookies, options);
          return;
        } catch (puErr) {
          throw new Error(`Failed to download ${url} via Puppeteer: ${puErr.message || puErr}`);
        }
      }

      if (isLast) {
        throw err;
      }

      // backoff and retry
      const delay = 500 * attempt;
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

async function downloadImageViaPuppeteer(url, destPath, referer, cookies, options = {}) {
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch (e) {
    throw new Error('Puppeteer is not installed. Run `npm install puppeteer` to enable fallback downloads.');
  }

  const launchOpts = { args: ['--no-sandbox', '--disable-setuid-sandbox'] };
  if (options.interactiveAuth) {
    launchOpts.headless = false;
    launchOpts.defaultViewport = null;
  } else {
    launchOpts.headless = true;
  }

  const browser = await puppeteer.launch(launchOpts);
  try {
    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    if (referer) await page.setExtraHTTPHeaders({ Referer: referer });
    // set cookies if provided (ensure proper format)
    if (cookies && cookies.length > 0) {
      try {
        await page.setCookie(...cookies);
      } catch (e) {
        // ignore cookie set errors
      }
    }

    const resp = await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    if (!resp || !resp.ok()) throw new Error(`Puppeteer failed to load ${url} (status: ${resp && resp.status()})`);
    const buffer = await resp.buffer();
    fs.writeFileSync(destPath, buffer);
  } finally {
    await browser.close();
  }
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

function isAd(url, width, height) {
  // Filter by size if available (Manga pages are usually large)
  // Ignore small icons or banners
  if (width && height && width > 0 && height > 0) {
    // Standard banner sizes are often 300x250, 728x90, 160x600 etc.
    // Manga pages are usually at least 600px tall/wide.
    // Let's safe filter small items.
    if (width < 250 || height < 250) return true;
  }

  const lower = url.toLowerCase();
  // If the image comes from an uploads folder on known manga hosts, don't treat it as an ad.
  // This avoids false positives where 'ad' appears inside words like 'upload'.
  if (lower.includes('/uploads/')) return false;

  return AD_KEYWORDS.some(kw => lower.includes(kw));
}

async function extractImageUrls(url, options = {}) {
  let { selector = 'img', onLog } = options;

  if (!selector || selector === 'img') {
    const preset = getPresetSelector(url);
    if (preset) selector = preset;
  }

  let rawImages = []; // Objects { src, width, height }
  let pageTitle = '';
  let cookies = [];
  // Decide whether to use Puppeteer: allow domain-specific defaults
  let usePuppeteer = !!options.usePuppeteer;
  try {
    const hostForAuto = new URL(url).hostname.toLowerCase();
    if (hostForAuto.includes('go-manga.com') || hostForAuto.includes('go-manga')) {
      usePuppeteer = true;
      if (onLog) onLog('Enabling Puppeteer by default for go-manga domain.\n');
    }
  } catch (e) {
    // ignore
  }

  // Helper to run puppeteer extraction
  const runPuppeteer = async () => {
    const { imgs, cookies: capturedCookies } = await fetchImageUrlsWithPuppeteer(url, selector, onLog, options);
    return {
      images: imgs.filter(i => i.src),
      cookies: capturedCookies
    };
  };

  if (usePuppeteer) {
    const result = await runPuppeteer();
    rawImages = result.images;
    cookies = result.cookies;
  } else {
    try {
      const html = await fetchHtml(url);
      const $ = cheerio.load(html);

      // Extract Title
      pageTitle = $('h1').first().text().trim() || $('title').text().trim();

      const nodes = $(selector).toArray();
      // Cheerio can't get natural dimensions
      rawImages = nodes.map(n => ({
        src: $(n).attr('src') || $(n).attr('data-src') || $(n).attr('data-original'),
        width: undefined,
        height: undefined
      })).filter(i => i.src);

      // Fallback: If 0 images found, it might be a dynamic JS site. Retry with Puppeteer.
      if (rawImages.length === 0) {
        if (onLog) onLog(`Standard fetch found 0 images. Retrying with Puppeteer (dynamic content support)...\n`);
        try {
          const result = await runPuppeteer();
          rawImages = result.images;
          cookies = result.cookies;
        } catch (pupErr) {
          throw new Error(`Failed with Puppeteer too: ${pupErr.message}`);
        }
      }

    } catch (err) {
      if (err.status === 403) {
        if (onLog) onLog(`Standard fetch failed (403). Retrying with Puppeteer (this may take a moment)...\n`);
        try {
          const result = await runPuppeteer();
          rawImages = result.images;
          cookies = result.cookies;
        } catch (pupErr) {
          throw new Error(`Failed with Puppeteer too: ${pupErr.message}`);
        }
      } else {
        throw err;
      }
    }
  }

  const seen = new Set();
  const imageUrls = [];

  // Domain-specific filters: keep only real uploaded images on some sites
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('miku-doujin.com')) {
      rawImages = rawImages.filter(i => i.src && i.src.includes('/uploads/'));
      if (onLog) onLog(`Applied miku-doujin.com filter, candidate images: ${rawImages.length}\n`);
    }
    if (host.includes('go-manga.com') || host.includes('go-manga')) {
      // go-manga stores page images under /wp-content/uploads/ — prefer those
      rawImages = rawImages.filter(i => i.src && (i.src.includes('/wp-content/uploads/') || i.src.includes('/uploads/')));
      if (onLog) onLog(`Applied go-manga filter, candidate images: ${rawImages.length}\n`);
    }
  } catch (e) {
    // ignore URL parse errors
  }

  if (onLog) onLog(`Raw images found: ${rawImages.length}\n`);

  for (const img of rawImages) {
    const resolvedUrl = resolveUrl(url, img.src);
    if (!resolvedUrl) {
      // if (onLog) onLog(`Skipping empty src\n`);
      continue;
    }
    if (seen.has(resolvedUrl)) {
      // if (onLog) onLog(`Skipping duplicate: ${resolvedUrl}\n`);
      continue;
    }

    if (isAd(resolvedUrl, img.width, img.height)) {
      if (onLog) onLog(`Filtered Ad: ${resolvedUrl} (Size: ${img.width}x${img.height})\n`);
      continue;
    }

    seen.add(resolvedUrl);
    imageUrls.push(resolvedUrl);
  }

  if (onLog) onLog(`Final images kept: ${imageUrls.length}\n`);

  return { imageUrls, selector, title: pageTitle, cookies };
}

async function downloadChapter(chapterUrl, options = {}) {
  const { outDir = './downloads', concurrency = 5, makeCbz: cbz = false, onImage } = options;
  const logger = makeLogger(options);

  logger.log(`Fetching page: ${chapterUrl}`);

  const { imageUrls, title, cookies } = await extractImageUrls(chapterUrl, options);

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
    await downloadImage(imgUrl, dest, chapterUrl, cookies, options);
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
