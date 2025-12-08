const fetch = require('node-fetch');

// Remote URL for version check from GitHub (Raw content)
const REMOTE_PKG_URL = 'https://raw.githubusercontent.com/Otakukerlpl/manga-downloader/main/package.json';

function parseVersion(v) {
    if (!v) return [0, 0, 0];
    return v.split('.').map(Number);
}

// Returns difference in minor version roughly, or just raw logic
function compareVersions(current, remote) {
    const c = parseVersion(current);
    const r = parseVersion(remote);

    // simple comparison: returns 1 if remote > current, 0 if equal, -1 if remote < current
    if (r[0] > c[0]) return 1;
    if (r[0] < c[0]) return -1;
    if (r[1] > c[1]) return 1;
    if (r[1] < c[1]) return -1;
    if (r[2] > c[2]) return 1;
    if (r[2] < c[2]) return -1;
    return 0;
}

function getVersionGap(current, remote) {
    const c = parseVersion(current);
    const r = parseVersion(remote);

    // Calculate gap based on major/minor
    let gap = 0;
    gap += (r[0] - c[0]) * 1.0;
    gap += (r[1] - c[1]) * 0.1;
    gap += (r[2] - c[2]) * 0.001;

    return gap;
}

async function checkUpdate(currentVersion) {
    try {
        const res = await fetch(REMOTE_PKG_URL);
        if (!res.ok) throw new Error('Network response was not ok');
        const remotePkg = await res.json();
        const remoteVersion = remotePkg.version;

        const gap = getVersionGap(currentVersion, remoteVersion);
        const isUpdateAvailable = compareVersions(currentVersion, remoteVersion) > 0;

        // Force Update Gap rule
        const forceUpdate = gap >= 0.29;

        return {
            available: isUpdateAvailable,
            current: currentVersion,
            remote: remoteVersion,
            force: forceUpdate,
            gap: gap.toFixed(2),
            downloadUrl: 'https://github.com/Otakukerlpl/manga-downloader/releases'
        };
    } catch (err) {
        // Fail silently or return error state
        return { available: false, error: err.message };
    }
}

async function getLatestInstallerUrl() {
    try {
        const res = await fetch('https://api.github.com/repos/Otakukerlpl/manga-downloader/releases/latest');
        if (!res.ok) throw new Error('Failed to fetch releases');
        const release = await res.json();

        // Find .exe asset
        const asset = release.assets.find(a => a.name.endsWith('.exe'));
        if (asset) return asset.browser_download_url;

        // Fallback or zip
        const zip = release.assets.find(a => a.name.endsWith('.zip'));
        if (zip) return zip.browser_download_url;

        throw new Error('No executable asset found');
    } catch (e) {
        throw e;
    }
}

module.exports = { checkUpdate, getLatestInstallerUrl };
