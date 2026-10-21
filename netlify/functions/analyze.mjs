import {GoogleGenAI} from "@google/genai";
import {randomUUID,createHash} from "node:crypto";
import {json,storeFor,originOK,imageData,validEAN} from "../../lib/common.mjs";
export default async(req,context)=>{
 if(req.method!=="POST")return json({error:"Método inválido."},405);
 if(!originOK(req))return json({error:"Origem inválida."},403);
 try{
 const body=await req.json();if(!Array.isArray(body.images)||!body.images.length||body.images.length>6)throw Error("Envie de uma a seis fotos.");
 const images=body.images.map(imageData);if(images.some(x=>!x||x.data.length>200000))throw Error("Foto inválida ou muito grande.");
 const direct=process.env.MELLU_GEMINI_API_KEY;
 const ai=new GoogleGenAI(direct?{apiKey:direct,httpOptions:{baseUrl:"https://generativelanguage.googleapis.com"}}:{});
 const results=await Promise.all(images.map(async img=>{
 const r=await ai.models.generateContent({model:"gemini-3.1-flash-lite",contents:[{role:"user",parts:[{text:'Leia esta foto de UMA embalagem. Extraia somente informações claramente visíveis, sem completar letras ou números cortados. Responda JSON: {"brand":marca ou null,"name":nome comercial/tipo e linha do produto ou null,"specifications":variante essencial de identificação, como fragrância ou cor, ou null,"content":peso ou volume líquido com unidade, por exemplo 500 g ou 200 ml, ou null,"barcode":somente os dígitos impressos abaixo das barras, como string, ou null,"validity":validade como impressa ou null}. A descrição será marca + nome + variante + peso/volume. Priorize o rótulo FRONTAL para marca, nome e variante; use outras faces para completar peso/volume. Não use fabricante/distribuidor/endereço como nome, não inclua propaganda, benefícios, ingredientes extensos, lote, composição, número de aplicações nem validade na descrição. Preserve todos os dígitos e zeros iniciais do código; se não estiverem todos nítidos, barcode=null. Não confunda fabricação ou lote com validade.'},{inlineData:img}]}],config:{responseMimeType:"application/json",temperature:0}});
 return JSON.parse(r.text);
 }));
 const codes=[...new Set(results.map(x=>String(x.barcode||"").replace(/\D/g,"")).filter(Boolean))];
 if(codes.length!==1||!validEAN(codes[0]))throw Error("Não consegui confirmar um único código de barras válido. Tire uma foto nítida dos números abaixo das barras e tente novamente.");
 const clean=v=>typeof v==="string"?v.trim().replace(/\s+/g," "):"";
 const pick=field=>results.map(x=>clean(x[field])).filter(Boolean).sort((a,b)=>b.length-a.length)[0]||"";
 const name=pick("name");if(!name)throw Error("Não consegui ler o nome. Acrescente uma foto nítida da frente da embalagem.");
 const parts=[pick("brand"),name,pick("specifications"),pick("content")];
 const description=parts.filter((v,i)=>v&&!parts.slice(0,i).some(p=>p.toLowerCase().includes(v.toLowerCase()))).join(" · ").slice(0,300);
 const dates=[...new Set(results.map(x=>String(x.validity||"").trim()).filter(Boolean))];
 if(dates.length>1)throw Error("As fotos mostram validades diferentes. Fotografe somente uma unidade/lote por contagem.");
 const product={name:description,barcode:codes[0],validity:dates[0]||""},store=storeFor(context),ids=[];
 for(const img of images){const bytes=Buffer.from(img.data,"base64"),id=createHash("sha256").update(bytes).digest("hex");await store.set("images/"+id,bytes,{metadata:{contentType:img.mimeType},onlyIfNew:true});ids.push(id);}
 const analysis_id=randomUUID();
 await store.setJSON("analyses/"+analysis_id,{product,photos:ids,created_at:new Date().toISOString()});
 return json({analysis_id,product,warnings:product.validity?[]:["Validade não legível. Acrescente uma foto da validade se ela estiver na embalagem."]});
 }catch(e){console.error("analysis",e.message);return json({error:e.message?.includes("foto")||e.message?.includes("fotos")||e.message?.includes("código")||e.message?.includes("validades")?e.message:"Não foi possível analisar agora. As fotos continuam na tela; tente novamente."},422);}
};