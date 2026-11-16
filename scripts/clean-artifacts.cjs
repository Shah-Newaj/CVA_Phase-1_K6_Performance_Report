const fs = require('fs');
const path = require('path');

const artifactDir = path.resolve(__dirname, '..', 'artifacts');
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp']);

fs.mkdirSync(artifactDir, { recursive: true });

let removed = 0;

removeImages(artifactDir);

console.log(`Removed ${removed} old artifact image${removed === 1 ? '' : 's'}.`);

function removeImages(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      removeImages(fullPath);
      continue;
    }

    if (!imageExtensions.has(path.extname(entry.name).toLowerCase())) {
      continue;
    }

    fs.unlinkSync(fullPath);
    removed += 1;
  }
}
