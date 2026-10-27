import {GoogleGenAI} from "@google/genai";
import {randomUUID,createHash} from "node:crypto";
import {json,storeFor,originOK,imageData} from "../../lib/common.mjs";
import {decodePhotoEAN,prepareLabelImages} from "../../lib/barcode.mjs";
import {mergeReadings} from "../../lib/recognition.mjs";
const uuid=/^[a-f0-9-]{36}$/i;
const prompt="Leia esta foto de UMA embalagem. Extraia somente informações claramente visíveis, sem completar letras ou números cortados. Responda JSON: {\"brand\":marca ou null,\"name\":nome comercial/tipo E linha do produto, copiando os dois textos, ou null,\"specifications\":variante essencial de identificação, como fragrância ou cor, ou null,\"content\":peso ou volume líquido com unidade, por exemplo 500 g ou 200 ml, ou null,\"barcode\":dígitos impressos abaixo das barras, como string, ou null,\"internal_code\":código interno/SKU claramente impresso que não seja o código de barras, como string, ou null,\"validity\":validade como impressa ou null}. A descrição será marca + nome + variante + peso/volume. Priorize o rótulo FRONTAL para marca, nome e variante; use outras faces para completar peso/volume. Não use fabricante/distribuidor/endereço como nome, não inclua propaganda, benefícios, ingredientes extensos, lote, composição, número de aplicações nem validade na descrição. Preserve todos os dígitos e zeros iniciais do código; se somente parte dos dígitos estiver legível, copie exatamente essa parte, sem completar. Não confunda fabricação ou lote com validade. Nunca classifique lote, fabricação ou validade como código interno.";
const fastPrompt=prompt+" Inclua também brand_complete (booleano). Para brand, copie somente o logotipo inteiro: se o começo ou o fim da palavra estiver cortado, oculto pela curvatura ou sem leitura segura, use brand=null e brand_complete=false. Quando o logotipo estiver inteiro, brand_complete=true. Inclua sufixos do próprio logotipo, como PRO. Não complete a marca por semelhança ou memória.";
async function readLabelTogether(images,model){
 const direct=process.env.MELLU_GEMINI_API_KEY;
 const ai=new GoogleGenAI(direct?{apiKey:direct,httpOptions:{baseUrl:"https://generativelanguage.googleapis.com"}}:{});
 images=prepareLabelImages(images);
 const instruction="Todas as fotos são ângulos do MESMO produto. Combine as partes visíveis. A marca pode aparecer distorcida numa face e estar inteira em outra: use a face em que o logotipo aparece por inteiro. Para o nome, priorize o título comercial completo no painel frontal, preservando a linha. Não troque o nome do produto por slogan como EPILAÇÃO PROFISSIONAL. "+fastPrompt;
 const r=await ai.models.generateContent({model,contents:[{role:"user",parts:[{text:instruction},...images.map(img=>({inlineData:img}))]}],config:{responseMimeType:"application/json",temperature:0,thinkingConfig:{thinkingLevel:"minimal"},mediaResolution:"MEDIA_RESOLUTION_HIGH"}});
 const result=parseGeminiJSON(r.text);
 if(!result||typeof result!=="object"||Array.isArray(result))throw new SyntaxError("Leitura inválida");
 return result;
}
function parseGeminiJSON(value){
 const text=String(value||"").trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"");
 try{return JSON.parse(text);}catch{}
 const start=text.indexOf("{"),end=text.lastIndexOf("}");
 if(start>=0&&end>start)return JSON.parse(text.slice(start,end+1));
 throw new SyntaxError("A IA retornou uma resposta sem JSON válido.");
}
export default async(req,context)=>{
 if(req.method!=="POST")return json({error:"Método inválido."},405);
 if(!originOK(req))return json({error:"Origem inválida."},403);
 try{
 const body=await req.json(),store=storeFor(context);
 const started=Date.now(),probe=body.stage==="compare";
 let results=[],ids=[],model=body.quality==="standard"?"gemini-3.8-flash":body.quality==="fast"?"gemini-3.5-flash-lite":process.env.MELLU_AI_MODEL||"gemini-3.5-flash-lite";
 if(Array.isArray(body.batch_ids)){
  if(!body.batch_ids.length||body.batch_ids.some(id=>!uuid.test(id)))throw Error("Leitura das fotos inválida. Analise novamente.");
  for(const id of new Set(body.batch_ids)){
   const batch=await store.get("batches/"+id,{type:"json"});
   if(!batch)throw Error("Leitura das fotos não encontrada. Analise novamente.");
   results.push(...batch.results);ids.push(...batch.photos);model=batch.model;
  }
 }else{
  if(!Array.isArray(body.images)||!body.images.length)throw Error("Envie fotos da embalagem.");
  // Transport batches keep each request below platform payload and time limits.
  if(["extract","compare"].includes(body.stage)&&body.images.length>3)throw Error("Envio de fotos inválido. Atualize a página.");
  const images=body.images.map(imageData);
  if(images.some(x=>!x||x.data.length>200000))throw Error("Foto inválida ou muito grande.");
  const direct=process.env.MELLU_GEMINI_API_KEY;
  const ai=new GoogleGenAI(direct?{apiKey:direct,httpOptions:{baseUrl:"https://generativelanguage.googleapis.com"}}:{});
  if(probe&&body.joint===true){
   const result=await readLabelTogether(images,model);
   const decoded=[...new Set(images.map(img=>decodePhotoEAN(Buffer.from(img.data,"base64"),img.mimeType)).filter(Boolean))];
   if(decoded.length===1){const printed=String(result.barcode||"").replace(/\D/g,"");result.barcode=printed||decoded[0];result.barcode_candidates=[...new Set([printed,decoded[0]].filter(Boolean))];result.barcode_conflict=!!printed&&printed!==decoded[0];}
   return json({model,elapsed_ms:Date.now()-started,readings:[result]});
  }
  const extracted=await Promise.all(images.map(async img=>{
   const bytes=Buffer.from(img.data,"base64"),id=createHash("sha256").update(bytes).digest("hex");
   const cacheKey=(model.includes("flash-lite")?"ocr/v4-fast-high/":"ocr/v2/")+model+"/"+id;
   let result=probe?null:await store.get(cacheKey,{type:"json"});
   const cached=!!result,ocrStart=Date.now();
   if(!result){
    const r=await ai.models.generateContent({model,contents:[{role:"user",parts:[{text:model.includes("flash-lite")?fastPrompt:prompt},{inlineData:img}]}],config:{responseMimeType:"application/json",temperature:0,...(model.includes("flash-lite")?{thinkingConfig:{thinkingLevel:"minimal"},mediaResolution:"MEDIA_RESOLUTION_HIGH"}:{})}});
    result=parseGeminiJSON(r.text);
    if(!result||typeof result!=="object"||Array.isArray(result))throw new SyntaxError("Leitura inválida");
    if(model.includes("flash-lite")){
     const decoded=decodePhotoEAN(bytes,img.mimeType);
     if(decoded){const printed=String(result.barcode||"").replace(/\D/g,"");result={...result,barcode:printed||decoded,barcode_candidates:[...new Set([printed,decoded].filter(Boolean))],barcode_conflict:!!printed&&printed!==decoded};}
    }
    if(!probe)await store.setJSON(cacheKey,result);
   }
   console.info("vision_timing",JSON.stringify({model,cached,ms:Date.now()-ocrStart}));
   if(!probe)await store.set("images/"+id,bytes,{metadata:{contentType:img.mimeType},onlyIfNew:true});
   return {result,id};
  }));
  results=extracted.map(x=>x.result);ids=extracted.map(x=>x.id);
  if(probe)return json({model,elapsed_ms:Date.now()-started,readings:results});
  if(body.stage==="extract"){
   const batch_id=randomUUID();await store.setJSON("batches/"+batch_id,{results,photos:ids,model});
   return json({batch_id,photo_count:images.length,model});
  }
 }
 const product=mergeReadings(results),analysis_id=randomUUID();
 if(model.includes("flash-lite")){
  const normalize=s=>String(s||"").toLowerCase().trim();
  const brands=new Set(results.filter(x=>x.brand_complete!==false&&x.brand).map(x=>normalize(x.brand)));
  const names=new Set(results.filter(x=>x.name).map(x=>normalize(x.name)));
  if(brands.size>1||names.size>1){
   const choices=[];const signatures=new Set();
   results.forEach((r,i)=>{if(r.name||r.brand){const sig=normalize(r.brand)+"|"+normalize(r.name);if(!signatures.has(sig)){signatures.add(sig);choices.push(ids[i]);}}});
   const photoIds=[...new Set(choices)].slice(0,2);
   const key="descriptions/v1/"+model+"/"+createHash("sha256").update(photoIds.join("|")).digest("hex");
   let corrected=await store.get(key,{type:"json"});
   if(!corrected){
    const images=await Promise.all(photoIds.map(async id=>{const photo=await store.getWithMetadata("images/"+id,{type:"arrayBuffer"});if(!photo)throw Error("Foto não encontrada. Analise novamente.");return {mimeType:photo.metadata.contentType,data:Buffer.from(photo.data).toString("base64")};}));
    corrected=await readLabelTogether(images,model);
    await store.setJSON(key,corrected);
   }
   product.name=mergeReadings([{...corrected,barcode:product.barcode,validity:product.validity,barcode_conflict:false}]).name;
  }
 }
 ids=[...new Set(ids)];
 await store.setJSON("analyses/"+analysis_id,{product,photos:ids,model,created_at:new Date().toISOString()});
 return json({analysis_id,model,product,warnings:product.validity?[]:["Validade não legível. Acrescente uma foto da validade se ela estiver na embalagem."]});
  }catch(e){
 console.error("analysis",e.message);
 const upstreamStatus=Number(e.status??e.statusCode??e.response?.status);
 const temporary=[408,425,429,500,502,503,504].includes(upstreamStatus)||["TimeoutError","AbortError","TypeError"].includes(e.name);
 if(temporary)return json({error:"Falha de conexão ou serviço Gemini temporariamente indisponível. Suas fotos foram preservadas; tente novamente.",code:"connection",retryable:true},upstreamStatus===429?429:503);
 if(e instanceof SyntaxError)return json({error:"A IA respondeu, mas não foi possível interpretar a resposta. Suas fotos foram preservadas; tente novamente.",code:"recognition_response",retryable:true},502);
 return json({error:/foto|fotos|código|validades|nome/i.test(e.message)?e.message:"Não foi possível reconhecer as informações desta foto. As fotos continuam na tela; confira o foco e tente novamente.",code:"recognition"},422);}
};
