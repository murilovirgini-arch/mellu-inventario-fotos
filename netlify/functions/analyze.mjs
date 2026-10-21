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
 const r=await ai.models.generateContent({model:"gemini-3.1-flash-lite",contents:[{role:"user",parts:[{text:'Leia esta foto de UMA embalagem. Extraia apenas texto visível, sem adivinhar. JSON: {"name":nome completo com marca e tamanho ou null,"barcode":código numérico EAN/UPC impresso ou null,"validity":validade como impressa ou null}. Não confunda lote/fabricação com validade. Não invente dígitos de código ilegível.'},{inlineData:img}]}],config:{responseMimeType:"application/json",temperature:0}});
 return JSON.parse(r.text);
 }));
 const codes=[...new Set(results.map(x=>String(x.barcode||"").replace(/\D/g,"")).filter(Boolean))];
 if(codes.length!==1||!validEAN(codes[0]))throw Error("Não consegui confirmar um único código de barras válido. Tire uma foto nítida dos números abaixo das barras e tente novamente.");
 const names=results.map(x=>String(x.name||"").trim()).filter(Boolean).sort((a,b)=>b.length-a.length);
 if(!names.length)throw Error("Não consegui ler o nome. Acrescente uma foto nítida da frente da embalagem.");
 const dates=[...new Set(results.map(x=>String(x.validity||"").trim()).filter(Boolean))];
 if(dates.length>1)throw Error("As fotos mostram validades diferentes. Fotografe somente uma unidade/lote por contagem.");
 const product={name:names[0].slice(0,300),barcode:codes[0],validity:dates[0]||""},store=storeFor(context),ids=[];
 for(const img of images){const bytes=Buffer.from(img.data,"base64"),id=createHash("sha256").update(bytes).digest("hex");await store.set("images/"+id,bytes,{metadata:{contentType:img.mimeType},onlyIfNew:true});ids.push(id);}
 const analysis_id=randomUUID();
 await store.setJSON("analyses/"+analysis_id,{product,photos:ids,created_at:new Date().toISOString()});
 return json({analysis_id,product,warnings:product.validity?[]:["Validade não legível. Acrescente uma foto da validade se ela estiver na embalagem."]});
 }catch(e){console.error("analysis",e.message);return json({error:e.message?.includes("foto")||e.message?.includes("fotos")||e.message?.includes("código")||e.message?.includes("validades")?e.message:"Não foi possível analisar agora. As fotos continuam na tela; tente novamente."},422);}
};