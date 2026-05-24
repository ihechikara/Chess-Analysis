const { copyFileSync } = require('fs');
const { join } = require('path');

const binDir = join(__dirname, '..', 'node_modules', 'stockfish', 'bin');
const destDir = join(__dirname, '..', 'src');

for (const file of ['stockfish-18-lite-single.js', 'stockfish-18-lite-single.wasm']) {
  copyFileSync(join(binDir, file), join(destDir, file));
  console.log(`Copied ${file} → src/`);
}
