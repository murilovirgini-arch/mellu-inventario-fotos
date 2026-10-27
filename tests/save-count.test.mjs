import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
import {gzipSync,gunzipSync} from "node:zlib";
import {identifierForSave} from "../lib/recognition.mjs";
const analysisId="11111111-1111-4111-8111-111111111111";
const requestId="22222222-2222-4222-8222-222222222222";
async function setup(){
 const source=(await readFile(new URL("../netlify/functions/save-count.mjs",import.meta.url),"utf8"))
  .replace(/^import .*;\n/gm,"")
  .replace(/^import catalog from .*;\n/gm,"")
  .replace("export default async(req,context)=>","async function handler(req,context)")
  .replace("const stock=JSON.parse(gunzipSync(Buffer.from(catalog,\"base64\")).toString());",`const catalog=${JSON.stringify(gzipSync(Buffer.from("{}")).toString("base64"))};const stock=JSON.parse(gunzipSync(Buffer.from(catalog,"base64")).toString());`);
 const records=new Map([["analyses/"+analysisId,{product:{name:"Creme Esfoliante",barcode:"",validity:"05/2027"},photos:[],model:"gemini-3.5-flash-lite"}]]),posts=[];
 const context=vm.createContext({Response,Date,JSON,Number,String,Buffer,AbortSignal,process:{env:{}},console,
  gunzipSync,identifierForSave,json:(v,s=200)=>Response.json(v,{status:s}),originOK:()=>true,
  storeFor:()=>({get:async k=>records.get(k)||null,setJSON:async(k,v)=>records.set(k,v)}),
  fetch:async(url,options)=>{const d=JSON.parse(options.body);posts.push(d);return Response.json({ok:true,request_id:d.request_id,pagina1:true,historico:true});}});
 vm.runInContext(source+"\nthis.handler=handler;",context);
 return {records,posts,run:body=>context.handler({method:"POST",headers:new Headers(),json:async()=>body},{})};
}
test("saves internal-code inventory with an explicit pending marker and unchanged Sheets contract",async()=>{
 const s=await setup(),response=await s.run({request_id:requestId,analysis_id:analysisId,quantity:7,location:"Estoque 1 - C2",internal_code:"SKU-47",product_name:"Creme Esfoliante"});
 const result=await response.json();assert.equal(response.status,200);assert.equal(result.pagina1,true);assert.equal(result.historico,true);
 assert.equal(s.posts[0].codigo,"INTERNO: SKU-47");assert.equal(s.posts[0].estoque_real,7);assert.equal(s.posts[0].localizacao,"Estoque 1 - C2");
 const saved=[...s.records.entries()].find(([key])=>key.startsWith("products/"));assert.equal(saved[1].product.barcode_status,"pending");
});
test("saves valid UPC-A as a validated GTIN",async()=>{
 const s=await setup(),response=await s.run({request_id:requestId,analysis_id:analysisId,quantity:2,location:"Mostruário",barcode:"036 000-291452",internal_code:"SKU-47"});
 assert.equal(response.status,200);assert.equal(s.posts[0].codigo,"036000291452");assert.equal(s.posts[0].estoque_real,2);
});
test("blocks an invalid check digit unless an internal code is supplied",async()=>{
 const s=await setup(),response=await s.run({request_id:requestId,analysis_id:analysisId,quantity:1,location:"Estoque",barcode:"4006381333932"});
 assert.equal(response.status,503);assert.match((await response.json()).error,/inválido/);assert.equal(s.posts.length,0);
});
