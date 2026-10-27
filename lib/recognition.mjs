export function expiryParts(value){
 const s=String(value).trim().replace(/^(?:validade|val|v)\s*[:.]?\s*/i,"").replace(/[.\s-]+/g,"/");
 let m=s.match(/^(\d{4})\/(\d{1,2})(?:\/(\d{1,2}))?$/),year,month,day;
 if(m){year=Number(m[1]);month=Number(m[2]);day=m[3]?Number(m[3]):null;}
 else if((m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/))){day=Number(m[1]);month=Number(m[2]);year=Number(m[3]);}
 else if((m=s.match(/^(\d{1,2})\/(\d{2}|\d{4})$/))){month=Number(m[1]);year=Number(m[2]);day=null;}
 else return null;
 if(year<100)year+=2000;
 if(month<1||month>12||year<1900||year>2199)return null;
 if(day!==null&&(day<1||day>new Date(Date.UTC(year,month,0)).getUTCDate()))return null;
 return {monthKey:year+"-"+String(month).padStart(2,"0"),day};
}
export function validEAN(s){
 if(typeof s!=="string"||!/^(?:[0-9]{8}|[0-9]{12,14})$/.test(s))return false;
 let sum=0;for(let i=s.length-2,j=0;i>=0;i--,j++)sum+=Number(s[i])*(j%2===0?3:1);
 return (10-sum%10)%10===Number(s.at(-1));
}
export function barcodeDigits(value){
 if(value==null)return "";
 // OCR may add spaces or punctuation, but never insert or infer digits.
 return String(value).normalize("NFKC").replace(/[^0-9]/g,"");
}
export function identifierForSave({barcode="",internal_code=""}={}){
 const code=barcodeDigits(barcode);
 if(validEAN(code))return {identifier:code,barcode:code,internal_code:"",barcode_status:"validated"};
 const internal=String(internal_code||"").trim().replace(/\s+/g," ").slice(0,80);
 if(internal)return {identifier:"INTERNO: "+internal,barcode:"",internal_code:internal,barcode_status:"pending"};
 return {identifier:"",barcode:"",internal_code:"",barcode_status:code?"invalid":"missing"};
}
export function mergeReadings(results){
 const codes=[...new Set(results.flatMap(x=>[x.barcode,...(Array.isArray(x.barcode_candidates)?x.barcode_candidates:[])])
  .map(barcodeDigits).filter(Boolean))];
 const uniqueValid=[...new Set(codes.filter(validEAN))];
 const barcodeStatus=results.some(x=>x.barcode_conflict)||uniqueValid.length>1?"conflict":uniqueValid.length===1?"validated":codes.length>1?"conflict":codes.length===1?"pending":"missing";
 const barcode=barcodeStatus==="validated"?uniqueValid[0]:codes.length===1?codes[0]:"";
 const internalCodes=[...new Set(results.flatMap(x=>[x.internal_code,...(Array.isArray(x.internal_code_candidates)?x.internal_code_candidates:[])])
  .map(v=>typeof v==="string"?v.trim().replace(/\s+/g," "):"").filter(Boolean))];
 const internalCode=internalCodes.length===1?internalCodes[0]:"";
 const clean=v=>typeof v==="string"?v.trim().replace(/\s+/g," "):"";
 const pick=field=>results.filter(x=>field!=="brand"||x.brand_complete!==false).map(x=>clean(x[field])).filter(Boolean).sort((a,b)=>b.length-a.length)[0]||"";
 const name=pick("name");if(!name)throw Error("Não consegui ler o nome. Acrescente uma foto nítida da frente da embalagem.");
 const parts=[pick("brand"),name,pick("specifications"),pick("content")];
 const description=parts.filter((v,i)=>v&&!parts.slice(0,i).some(p=>p.toLowerCase().includes(v.toLowerCase()))).join(" · ").slice(0,300);
 const dates=[...new Set(results.map(x=>String(x.validity||"").trim()).filter(Boolean))];
 const parsed=dates.map(expiryParts);
 if(dates.length>1){
  const sameMonth=parsed.every(Boolean)&&new Set(parsed.map(d=>d.monthKey)).size===1;
  const days=new Set(parsed.filter(Boolean).map(d=>d.day).filter(d=>d!==null));
  if(!sameMonth||days.size>1)throw Error("As fotos mostram validades diferentes. Fotografe somente uma unidade/lote por contagem.");
 }
 const fullDate=parsed.findIndex(d=>d&&d.day!==null);
 const validity=dates[fullDate>=0?fullDate:0]||"";
 return {name:description,barcode,barcode_status:barcodeStatus,barcode_candidates:codes,
  internal_code:internalCode,internal_code_candidates:internalCodes,validity};
}
