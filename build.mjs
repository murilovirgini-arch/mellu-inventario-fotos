import {mkdirSync,copyFileSync} from "node:fs";mkdirSync("public",{recursive:true});for(const f of ["index.html","app.js","style.css"])copyFileSync(f,"public/"+f);
