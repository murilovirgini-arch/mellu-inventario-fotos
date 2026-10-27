import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {mergeReadings,validEAN,barcodeDigits} from '../lib/recognition.mjs';
const source=(await readFile(new URL('../netlify/functions/analyze.mjs',import.meta.url),'utf8')).replace(/^import .*;$/gm,'').replace('export default async(req,context)=>','async function handler(req,context)');
function setup(results,answers){
 const batch='11111111-1111-4111-8111-111111111111',values=new Map([['batches/'+batch,{model:'gemini-3.5-flash-lite',results,photos:['test-photo']}]]),calls=[];
 const ctx=vm.createContext({Response,Date,Buffer,Set,JSON,Number,String,console:{info(){},error(){}},process:{env:{}},createHash,randomUUID,mergeReadings,validEAN,barcodeDigits,decodePhotoEAN:()=>null,json:(d,s=200)=>Response.json(d,{status:s}),originOK:()=>true,storeFor:()=>({get:async k=>values.get(k)||null,setJSON:async(k,v)=>values.set(k,v),getWithMetadata:async()=>({metadata:{contentType:'image/jpeg'},data:Uint8Array.from([1,2]).buffer})}),GoogleGenAI:class{models={generateContent:async options=>{calls.push(options);return {text:JSON.stringify({barcode:answers.shift()??null})};}};}});
 vm.runInContext(source,ctx);
 return {values,calls,run:async()=>{const response=await ctx.handler({method:'POST',json:async()=>({batch_ids:[batch]})},{});assert.equal(response.status,200);return response.json();}};
}
test('recovers EAN from retained old receipts without changing SKU or product data',async()=>{
 const s=setup([{name:'Pulverizador',internal_code:'6154',validity:'INDETERMINADA'}],['7897169261549']);
 const r=await s.run();assert.equal(r.product.barcode,'7897169261549');assert.equal(r.product.barcode_status,'validated');assert.equal(r.product.internal_code,'6154');assert.equal(r.product.validity,'INDETERMINADA');assert.equal(s.calls.length,1);
 await s.run();assert.equal(s.calls.length,1);assert.ok([...s.values.keys()].every(k=>!k.includes('counts/')&&!k.includes('events/')));
});
test('does not repeat AI when EAN is already validated',async()=>{const s=setup([{name:'Teste',barcode:'7897169261549'}],[]);assert.equal((await s.run()).product.barcode_status,'validated');assert.equal(s.calls.length,0);});
test('does not invent missing digits or cache a failed reading permanently',async()=>{const s=setup([{name:'Teste'}],['897169261549','7897169261549']);const first=await s.run();assert.equal(first.product.barcode,'897169261549');assert.equal(first.product.barcode_status,'pending');assert.equal((await s.run()).product.barcode_status,'validated');assert.equal(s.calls.length,2);});
test('preserves genuine disagreement between two valid EANs',async()=>{const s=setup([{name:'Teste',barcode:'4006381333931'},{barcode:'036000291452'}],['4006381333931']);assert.equal((await s.run()).product.barcode_status,'conflict');});
