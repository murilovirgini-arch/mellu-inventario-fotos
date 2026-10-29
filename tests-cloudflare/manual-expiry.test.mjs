import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {identifierForSave} from '../lib/recognition.mjs';
const serverSource=(await readFile(new URL('../worker/save-count.mjs',import.meta.url),'utf8')).replace(/^import .*;$/gm,'').replace(/^const stock=.*;$/m,'const stock={};').replace('export default async(req,context)=>','async function handler(req,context)');
const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
function setup(original='05/2029'){
 const analysis_id=randomUUID(),request_id=randomUUID(),values=new Map([['analyses/'+analysis_id,{product:{name:'Teste',barcode:'7908832601576',validity:original},photos:['photo']}]]),sent=[];
 const ctx=vm.createContext({Response,Date,JSON,Object,Number,String,Buffer,AbortSignal,process:{env:{}},identifierForSave,originOK:()=>true,json:(d,s=200)=>Response.json(d,{status:s}),storeFor:()=>({get:async k=>values.get(k)||null,setJSON:async(k,v)=>values.set(k,structuredClone(v))}),fetch:async(url,init)=>{const body=JSON.parse(init.body);sent.push(body);return Response.json({ok:true,request_id:body.request_id,pagina1:true,historico:true});}});
 vm.runInContext(serverSource,ctx);
 const payload={analysis_id,request_id,barcode:'7908832601576',product_name:'Teste',quantity:0,location:'TESTE'};
 return {payload,sent,values,run:async extra=>{const r=await ctx.handler({method:'POST',json:async()=>({...payload,...extra})},{env:{}});return {status:r.status,...await r.json()};}};
}
for(const [label,original,extra,expected] of [
 ['manual when OCR is empty','',{validity:'12/2028'},'12/2028'],
 ['manual override of OCR','05/2029',{validity:'31/12/2028'},'31/12/2028'],
 ['automatic unchanged','05/2029',{validity:'05/2029'},'05/2029'],
 ['explicitly cleared','05/2029',{validity:''},''],
 ['older client missing property','05/2029',{},'05/2029']
])test(label+' reaches Sheets validade payload and saved photo record',async()=>{
 const s=setup(original);assert.equal((await s.run(extra)).status,200);assert.equal(s.sent[0].validade,expected);
 const record=[...s.values.entries()].find(([k])=>k.startsWith('products/'))[1];assert.equal(record.product.validity,expected);
 await s.run(extra);assert.equal(s.sent.length,1,'confirmed retry must not duplicate count');
});
test('pending record uses explicit manual expiry on retry',async()=>{
 const s=setup();s.values.set('products/7908832601576/'+s.payload.request_id,{...s.values.get('analyses/'+s.payload.analysis_id),...s.payload,product:{name:'Teste',barcode:'7908832601576',validity:'05/2029'},status:'pending'});
 assert.equal((await s.run({validity:'12/2030'})).status,200);assert.equal(s.sent[0].validade,'12/2030');
});
test('rejects non-string validity before any Sheets request',async()=>{const s=setup();assert.notEqual((await s.run({validity:{date:'12/2028'}})).status,200);assert.equal(s.sent.length,0);});
test('editing the form then saving preserves date through local queue, sync and Sheets request',async()=>{
 const s=setup('');
 const fields=Object.fromEntries(Object.entries({quantity:'2',location:'Estoque 1 - C2',productEAN:'7908832601576',internalCode:'',productName:'Teste',productValidity:'31/12/2028'}).map(([k,value])=>[k,{value,focus(){}}]));
 const client=vm.createContext({JSON,Number,String,Object,Date,crypto:{randomUUID:()=>s.payload.request_id},AbortSignal,navigator:{onLine:true},localStorage:{setItem(){}},setTimeout:()=>0,clearTimeout(){},identifierForSave,$:id=>fields[id]||(fields[id]={value:''}),status(){},updateControls(){},persist(){},renderPhotos(){},renderEvents(){},fetch:async(path,init)=>{const body=JSON.parse(init.body);assert.equal(body.validity,'31/12/2028');return Response.json(await s.run(body));}});
 vm.runInContext('var reading='+JSON.stringify({analysis_id:s.payload.analysis_id,product:{name:'Teste',barcode:'7908832601576',validity:''}})+';var saving=false,photos=[],batchCache=new Map(),entries=[],syncPromise=null,retryTimer;',client);
 vm.runInContext(app.slice(app.indexOf('async function saveCount()'),app.indexOf('function renderEvents()'))+'\n'+app.slice(app.indexOf('function sync()'),app.indexOf('function showView(')),client);
 await client.saveCount();await client.sync();assert.equal(s.sent[0].validade,'31/12/2028');assert.equal(client.entries[0].status,'confirmed');assert.equal(client.entries[0].product.validity,'31/12/2028');
});
