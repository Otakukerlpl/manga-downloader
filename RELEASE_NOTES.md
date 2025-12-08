# v1.1.2

Release 1.1.2

Changes:
- Add support for `go-manga.com` reader (selector and domain filter)
- Use Puppeteer automatically for domains that require JS rendering (go-manga)
- Add CLI flags: `--use-puppeteer`, `--interactive-auth`
- Add download retry logic and Puppeteer fallback for image downloads (handles TLS/Cloudflare errors)
- Improve presets for `miku-doujin.com`
- Add debug helper script `scripts/debug-miku.js`

Notes:
- Puppeteer is required for JS-rendered sites: `npm install puppeteer`
- You can enable interactive login with `--interactive-auth` when using Puppeteer

Enjoy!
