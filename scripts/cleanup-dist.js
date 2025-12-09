const fs = require('fs');
const path = require('path');

const cwd = process.cwd();
const distDir = path.join(cwd, 'dist');

function readPackageVersion() {
  const pkgPath = path.join(cwd, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  return pkg.version;
}

function listDist() {
  try {
    return fs.readdirSync(distDir, { withFileTypes: true });
  } catch (err) {
    console.error('Could not read dist directory:', err.message);
    process.exit(2);
  }
}

function isCandidate(direntName) {
  // target common installer artifacts: "Manga Downloader Setup <ver>.exe" and the .blockmap
  const lower = direntName.toLowerCase();
  return (
    /manga downloader setup .*\.exe$/i.test(direntName) ||
    /\.exe\.blockmap$/i.test(direntName)
  );
}

function main() {
  const version = readPackageVersion();
  const args = process.argv.slice(2);
  const doDelete = args.includes('--yes') || args.includes('-y');

  const entries = listDist();
  const toDelete = [];

  entries.forEach((dirent) => {
    const name = dirent.name;

    // always keep these files
    if (name === 'latest.yml' || name.startsWith('builder-') || name === 'builder-debug.yml' || name === 'builder-effective-config.yaml') return;
    // keep the current version files
    if (name.includes(version)) return;

    if (isCandidate(name)) {
      toDelete.push(path.join(distDir, name));
    }
  });

  if (toDelete.length === 0) {
    console.log('No old installer/blockmap files found to delete.');
    return;
  }

  console.log(doDelete ? 'Deleting the following files:' : 'Dry-run: the following files would be deleted:');
  toDelete.forEach((f) => console.log(' -', path.relative(cwd, f)));

  if (!doDelete) {
    console.log('\nRun `node scripts/cleanup-dist.js --yes` to actually delete these files.');
    return;
  }

  // perform deletions
  toDelete.forEach((f) => {
    try {
      fs.unlinkSync(f);
      console.log('Deleted', path.relative(cwd, f));
    } catch (err) {
      console.error('Failed to delete', f, err.message);
    }
  });
}

if (require.main === module) main();
