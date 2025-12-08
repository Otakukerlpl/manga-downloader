
/**
 * Known domains and their optimal CSS selectors for manga images.
 * Keys can be full hostnames or partial matches.
 */
const DOMAIN_PRESETS = {
    // Popular sites (examples)
    'mangaplus.shueisha.co.jp': 'img.lazy-load-image',
    'webtoons.com': '#_imageList img',
    'mangadex.org': 'img.img-fluid',
    // Generic fallbacks for common platforms
    'blogspot.com': '.separator img',
    'wordpress.com': '.entry-content img',
};

/**
 * Tries to find a preset selector for a given URL.
 * Returns null if no specific preset is found.
 */
function getPresetSelector(urlStr) {
    try {
        const u = new URL(urlStr);
        const host = u.hostname.toLowerCase();

        // Exact match
        if (DOMAIN_PRESETS[host]) return DOMAIN_PRESETS[host];

        // Partial match (e.g. searching for 'webtoons.com' in 'www.webtoons.com')
        for (const [domain, selector] of Object.entries(DOMAIN_PRESETS)) {
            if (host.includes(domain)) return selector;
        }

        return null;
    } catch (e) {
        return null;
    }
}

module.exports = { getPresetSelector, DOMAIN_PRESETS };
