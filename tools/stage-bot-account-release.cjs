// Prepare only: does not publish, call the network, change bot settings or read credentials.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=process.argv[2]&&path.resolve(process.argv[2]);
if(!out||fs.existsSync(out))throw Error('Provide a new, nonexistent output directory');
if(out.startsWith('/Users/dombot/projects/'))throw Error('Do not stage into a live repository');
const files=['aisports/index.html','aisports/bot-account.js','aisports/wallet-connect.js','aisports/version.json','version.json','qr.js',
 'aisports/vendor/metamask-connect-2.1.1.js','aisports/vendor/metamask-connect-2.1.1.js.LEGAL.txt','aisports/vendor/metamask-connect-LICENSE.txt','aisports/vendor/metamask-connect-manifest.json'];
const build=JSON.parse(fs.readFileSync(path.join(root,'aisports/version.json'))).build;
if(!fs.readFileSync(path.join(root,'aisports/index.html'),'utf8').includes(`const BUILD = "${build}"`))throw Error('Build mismatch');
const manifest={build,origin:'https://zhuganoff.github.io',base_path:'/senya-app/',published:false,files:[]};
for(const file of files){const source=path.join(root,file),target=path.join(out,file),bytes=fs.readFileSync(source);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);manifest.files.push({path:file,url:`${manifest.origin}${manifest.base_path}${file}`,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});}
fs.writeFileSync(path.join(out,'release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({prepared:out,build,files:files.length,published:false}));
