import {mkdirSync,copyFileSync} from "node:fs";
mkdirSync("public",{recursive:true});
mkdirSync("public/lib",{recursive:true});
for(const f of ["index.html","app.js","style.css","analysis-recovery.mjs","camera-session.mjs"])copyFileSync(f,"public/"+f);
// app.js imports the shared identifier validator in the browser.
copyFileSync("lib/recognition.mjs","public/lib/recognition.mjs");
