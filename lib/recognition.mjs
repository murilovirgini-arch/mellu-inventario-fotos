export function validEAN(s){
 if(!/^(?:[0-9]{8}|[0-9]{12,14})$/.test(s))return false;
 let sum=0;for(let i=s.length-2,j=0;i>=0;i--,j++)sum+=Number(s[i])*(j%2===0?3:1);
 return (10-sum%10)%10===Number(s.at(-1));
}
export function mergeReadings(results){
 if(results.some(x=>x.barcode_conflict))throw Error("Os números e as barras do código divergem. Tire outra foto nítida do código.");
 const codes=[...new Set(results.map(x=>String(x.barcode||"").replace(/\D/g,"")).filter(Boolean))];
 if(codes.length!==1||!validEAN(codes[0]))throw Error("Não consegui confirmar um único código de barras válido. Tire uma foto nítida dos números abaixo das barras e tente novamente.");
 const clean=v=>typeof v==="string"?v.trim().replace(/\s+/g," "):"";
 const pick=field=>results.filter(x=>field!=="brand"||x.brand_complete!==false).map(x=>clean(x[field])).filter(Boolean).sort((a,b)=>b.length-a.length)[0]||"";
 const name=pick("name");if(!name)throw Error("Não consegui ler o nome. Acrescente uma foto nítida da frente da embalagem.");
 const parts=[pick("brand"),name,pick("specifications"),pick("content")];
 const description=parts.filter((v,i)=>v&&!parts.slice(0,i).some(p=>p.toLowerCase().includes(v.toLowerCase()))).join(" · ").slice(0,300);
 const dates=[...new Set(results.map(x=>String(x.validity||"").trim()).filter(Boolean))];
 if(dates.length>1)throw Error("As fotos mostram validades diferentes. Fotografe somente uma unidade/lote por contagem.");
 return {name:description,barcode:codes[0],validity:dates[0]||""};
}
