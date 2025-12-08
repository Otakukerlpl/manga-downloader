#!/usr/bin/env node
const fetch = require('node-fetch');

async function pingOnce(url, timeout = 5000) {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const t0 = Date.now();
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
    clearTimeout(id);
    if (!res) return -1;
    const t1 = Date.now();
    return t1 - t0;
  } catch (e) {
    return -1;
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    console.error('Usage: ping-url <url> [timeout_ms]');
    process.exit(2);
  }

  const url = argv[0];
  const timeout = Number(argv[1]) || 5000;

  console.log(`Pinging: ${url} (timeout ${timeout} ms)`);
  const ms = await pingOnce(url, timeout);
  if (ms >= 0) {
    console.log(`${url} — ${ms} ms`);
    process.exit(0);
  } else {
    console.error(`${url} — failed or timed out`);
    process.exit(1);
  }
}

main();
