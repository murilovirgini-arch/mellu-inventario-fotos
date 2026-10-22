import {GoogleGenAI} from "@google/genai";
import {randomUUID,createHash} from "node:crypto";
import {json,storeFor,originOK,imageData} from "../../lib/common.mjs";
import {mergeReadings} from "../../lib/recognition.mjs";
const uuid=/^[a-f0-9-]{36}$/i;
const prompt="Leia esta foto de UMA embalagem. Extraia somente informações claramente visíveis, sem completar letras ou números cortados. Responda JSON: {\"brand\":marca ou null,\"name\":nome comercial/tipo E linha do produto, copiando os dois textos, ou null,\"specifications\":variante essencial de identificação, como fragrância ou cor, ou null,\"content\":peso ou volume líquido com unidade, por exemplo 500 g ou 200 ml, ou null,\"barcode\":somente os dígitos impressos abaixo das barras, como string, ou null,\"validity\":validade como impressa ou null}. A descrição será marca + nome + variante + peso/volume. Priorize o rótulo FRONTAL para marca, nome e variante; use outras faces para completar peso/volume. Não use fabricante/distribuidor/endereço como nome, não inclua propaganda, benefícios, ingredientes extensos, lote, composição, número de aplicações nem validade na descrição. Preserve todos os dígitos e zeros iniciais do código; se não estiverem todos nítidos, barcode=null. Não confunda fabricação ou lote com validade.";
export default async(req,context)=>{
 if(req.method!=="POST")return json({error:"Método inválido."},405);
 if(!originOK(req))return json({error:"Origem inválida."},403);
 try{
 const body=await req.json(),store=storeFor(context);
 let results=[],ids=[],model=process.env.MELLU_AI_MODEL||"gemini-3.8-flash";
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
  if(body.stage==="extract"&&body.images.length>3)throw Error("Envio de fotos inválido. Atualize a página.");
  const images=body.images.map(imageData);
  if(images.some(x=>!x||x.data.length>200000))throw Error("Foto inválida ou muito grande.");
  const direct=process.env.MELLU_GEMINI_API_KEY;
  const ai=new GoogleGenAI(direct?{apiKey:direct,httpOptions:{baseUrl:"https://generativelanguage.googleapis.com"}}:{});
  const extracted=await Promise.all(images.map(async img=>{
   const bytes=Buffer.from(img.data,"base64"),id=createHash("sha256").update(bytes).digest("hex");
   const cacheKey="ocr/v2/"+model+"/"+id;
   let result=await store.get(cacheKey,{type:"json"});
   if(!result){
    const r=await ai.models.generateContent({model,contents:[{role:"user",parts:[{text:prompt},{inlineData:img}]}],config:{responseMimeType:"application/json",temperature:0}});
    result=JSON.parse(r.text);
    await store.setJSON(cacheKey,result);
   }
   await store.set("images/"+id,bytes,{metadata:{contentType:img.mimeType},onlyIfNew:true});
   return {result,id};
  }));
  results=extracted.map(x=>x.result);ids=extracted.map(x=>x.id);
  if(body.stage==="extract"){
   const batch_id=randomUUID();await store.setJSON("batches/"+batch_id,{results,photos:ids,model});
   return json({batch_id,photo_count:images.length,model});
  }
 }
 const product=mergeReadings(results),analysis_id=randomUUID();
 ids=[...new Set(ids)];
 await store.setJSON("analyses/"+analysis_id,{product,photos:ids,model,created_at:new Date().toISOString()});
 return json({analysis_id,model,product,warnings:product.validity?[]:["Validade não legível. Acrescente uma foto da validade se ela estiver na embalagem."]});
  }catch(e){
 console.error("analysis",e.message);
 const upstreamStatus=Number(e.status??e.statusCode??e.response?.status);
 const temporary=[408,429,500,502,503,504].includes(upstreamStatus)||["TimeoutError","AbortError","SyntaxError"].includes(e.name);
 if(temporary)return json({error:"O serviço de leitura está ocupado ou demorou para responder. Suas fotos foram preservadas.",retryable:true},upstreamStatus===429?429:503);
 return json({error:/foto|fotos|código|validades|nome/.test(e.message)?e.message:"Não foi possível analisar agora. As fotos continuam na tela; tente novamente."},422);}
};
