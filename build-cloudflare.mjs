import {mkdirSync,copyFileSync,writeFileSync} from 'node:fs';
import {build} from 'esbuild';
mkdirSync('public/lib',{recursive:true});
for(const file of ['index.html','app.js','style.css','analysis-recovery.mjs','camera-session.mjs'])copyFileSync(file,'public/'+file);
copyFileSync('lib/recognition.mjs','public/lib/recognition.mjs');
await build({entryPoints:['lib/photo-barcode.mjs'],outfile:'public/photo-barcode.js',bundle:true,format:'esm',platform:'browser',minify:true});
writeFileSync('public/_headers','/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: same-origin\n/index.html\n  Cache-Control: no-cache\n/app.js\n  Cache-Control: no-cache\n');
