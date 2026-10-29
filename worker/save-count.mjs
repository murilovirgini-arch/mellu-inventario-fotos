import {json,storeFor,originOK} from "../lib/common.mjs";
import {identifierForSave} from "../lib/recognition.mjs";
import catalog from "../data/catalog.mjs";
import {gunzipSync} from "node:zlib";
const stock=JSON.parse(gunzipSync(Buffer.from(catalog,"base64")).toString());
const uuid=/^[a-f0-9-]{36}$/i;
export default async(req,context)=>{
 if(req.method!=="POST")return json({error:"Método inválido."},405);
 if(!originOK(req))return json({error:"Origem inválida."},403);
 try{
 const d=await req.json();
 if(!uuid.test(d.request_id)||!uuid.test(d.analysis_id)||!Number.isSafeInteger(d.quantity)||d.quantity<0||typeof d.location!=="string"||!d.location.trim()||d.location.length>120)throw Error("Quantidade ou localização inválida.");
 const store=storeFor(context),analysis=await store.get("analyses/"+d.analysis_id,{type:"json"});
 if(!analysis)throw Error("Leitura não encontrada. Analise as fotos novamente.");
 const chosen=identifierForSave({barcode:d.barcode,internal_code:d.internal_code});
 if(!chosen.identifier)throw Error(chosen.barcode_status==="invalid"?"Código EAN/UPC inválido. Corrija os dígitos ou informe o código interno do produto.":"Informe um EAN/UPC válido ou um código interno para identificar o produto.");
 if(Object.hasOwn(d,"validity")&&(typeof d.validity!=="string"||d.validity.length>120))throw Error("Validade inválida.");
 const validity=Object.hasOwn(d,"validity")?d.validity.trim():String(analysis.product.validity||"");
 const product={...analysis.product,...chosen,validity,name:String(d.product_name||analysis.product.name||"").trim().slice(0,300)};
 if(!product.name)throw Error("Informe o nome do produto antes de salvar.");
 const key="products/"+encodeURIComponent(chosen.identifier)+"/"+d.request_id;
 const old=await store.get(key,{type:"json"});
 if(old&&(old.analysis_id!==d.analysis_id||old.quantity!==d.quantity||old.location!==d.location.trim()))return json({error:"Identificador já utilizado com outros dados."},409);
 if(old?.status==="confirmed")return json({request_id:d.request_id,pagina1:true,historico:true});
 const record=old?(Object.hasOwn(d,"validity")?{...old,product:{...old.product,validity}}:old):{...analysis,product,request_id:d.request_id,analysis_id:d.analysis_id,quantity:d.quantity,location:d.location.trim(),status:"pending",created_at:new Date().toISOString()};
 await store.setJSON(key,record);
 const sheetsURL=context.env.MELLU_SHEETS_URL||"https://script.google.com/macros/s/AKfycbz6104ODjZ88oS9FD0Sb_9CIh2qtzz3vLCbDqCTPvQM3-ZTMHrimfM1XnRDAEUqUjSK/exec";
 const response=await fetch(sheetsURL,{method:"POST",headers:{"Content-Type":"text/plain"},body:JSON.stringify({request_id:d.request_id,codigo:record.product.barcode||"INTERNO: "+record.product.internal_code,nome:record.product.name,validade:record.product.validity,estoque_real:d.quantity,estoque_sistema:stock[record.product.barcode]?.stock??"",localizacao:record.location}),signal:AbortSignal.timeout(45000)});
 const r=await response.json();
 if(!r.ok||r.request_id!==d.request_id||!r.pagina1||!r.historico)throw Error(r.message||"A planilha ainda não confirmou as duas abas. Tente reenviar.");
 await store.setJSON(key,{...record,status:"confirmed",confirmed_at:new Date().toISOString()});
 return json({request_id:d.request_id,pagina1:true,historico:true});
 }catch(e){return json({error:e.message||"Não foi possível confirmar. Tente reenviar."},503);}
};

