const fs = require('fs');
const path = require('path');

function getFiles(dir, files = []) {
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (file === 'node_modules' || file === '.git' || file === '.expo') continue;
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      getFiles(filePath, files);
    } else {
      files.push({ path: filePath, mtime: stat.mtimeMs });
    }
  }
  return files;
}

const files = getFiles('.');
files.sort((a, b) => b.mtime - a.mtime);
console.log(files.slice(0, 20).map(f => `${new Date(f.mtime).toLocaleString()} - ${f.path}`).join('\n'));
