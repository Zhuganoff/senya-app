const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const esbuild = require('esbuild');
const dir = path.resolve(__dirname, '../../aisports/vendor');
const output = path.join(dir, 'metamask-connect-2.1.1.js');
fs.mkdirSync(dir, { recursive: true });
esbuild.buildSync({
  absWorkingDir: __dirname, entryPoints: ['entry.js'], outfile: output,
  bundle: true, format: 'iife', globalName: 'AISportsMetaMaskConnect',
  platform: 'browser', target: ['es2020'], minify: true, legalComments: 'linked',
  define: { 'process.env.NODE_ENV': '"production"' },
  banner: { js: '/* MetaMask Connect 2.1.1, copyright ConsenSys. See metamask-connect-LICENSE.txt and metamask-connect-manifest.json. */' }
});
fs.copyFileSync(path.join(__dirname, 'node_modules/@metamask/connect-evm/LICENSE'), path.join(dir, 'metamask-connect-LICENSE.txt'));
const bytes = fs.readFileSync(output);
const lock = JSON.parse(fs.readFileSync(path.join(__dirname, 'package-lock.json')));
fs.writeFileSync(path.join(dir, 'metamask-connect-manifest.json'), JSON.stringify({
  package: '@metamask/connect-evm', version: '2.1.1',
  source: 'https://github.com/MetaMask/connect-monorepo',
  npm_integrity: lock.packages['node_modules/@metamask/connect-evm'].integrity,
  build: 'npm ci --ignore-scripts && npm run build (tools/wallet-sdk)',
  sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  sri: 'sha384-' + crypto.createHash('sha384').update(bytes).digest('base64'),
  bytes: bytes.length,
  dependencies: Object.fromEntries(Object.entries(lock.packages).filter(([p]) => p.startsWith('node_modules/')).map(([p,v])=>[p.slice(13),{version:v.version,integrity:v.integrity}]))
}, null, 2) + '\n');
