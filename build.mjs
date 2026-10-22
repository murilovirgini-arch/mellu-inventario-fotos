import {mkdirSync,copyFileSync} from "node:fs";mkdirSync("public",{recursive:true});for(const f of ["index.html","app.js","style.css","analysis-recovery.mjs"])copyFileSync(f,"public/"+f);
