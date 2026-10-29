import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import worker from '../worker/index.mjs';
import save from '../worker/save-count.mjs';
import {storeFor} from '../lib/common.mjs';
const schema=await readFile(new URL('../migrations/0001_objects.sql',import.meta.url),'utf8');
function database(){
 const db=new DatabaseSync(':memory:');db.exec(schema);
 return {prepare(sql){return {bind(...args){const params=args.map(x=>x instanceof ArrayBuffer?Buffer.from(x):x);return {async first(){return db.prepare(sql).get(...params)||null;},async all(){return {results:db.prepare(sql).all(...params)};},async run(){return db.prepare(sql).run(...params);}};}};}};
}
test('binary images, JSON, metadata and deduplication round-trip through free SQL storage',async()=>{
 const store=storeFor({env:{DB:database()}}),bytes=Uint8Array.from([255,216,0,73]);
 await store.set('images/test',bytes,{metadata:{contentType:'image/jpeg'},onlyIfNew:true});
 await store.set('images/test',Uint8Array.from([0]),{onlyIfNew:true});
 const photo=await store.getWithMetadata('images/test');assert.deepEqual([...new Uint8Array(photo.data)],[255,216,0,73]);assert.equal(photo.metadata.contentType,'image/jpeg');
 await store.setJSON('products/001/id',{validity:'31/12/2028'});assert.equal((await store.get('products/001/id',{type:'json'})).validity,'31/12/2028');
 assert.equal((await store.list({prefix:'products/'})).blobs.length,1);
 await store.setJSON('batches/1',{name:'one'});await store.setJSON('batches/2',{name:'two'});
 assert.deepEqual(await store.getMany(['batches/2','batches/1']),[{name:'two'},{name:'one'}]);
});
test('no key or unconfirmed free project stops before any network call',async()=>{
 const original=globalThis.fetch;globalThis.fetch=()=>{throw Error('Unexpected network call');};
 try{for(const extra of [{},{GEMINI_API_KEY:'test-only'}]){const r=await worker.fetch(new Request('https://example.test/api/analyze',{method:'POST',body:'{}'}),{DB:database(),...extra});assert.equal(r.status,422);assert.match((await r.json()).error,/não usa IA paga/);}}finally{globalThis.fetch=original;}
});
test('static requests use asset binding and create no API calls',async()=>{const r=await worker.fetch(new Request('https://example.test/'),{ASSETS:{fetch:async()=>new Response('static')}});assert.equal(await r.text(),'static');});
test('same writer accepts two distinct counts after existing rows, even with same EAN',async()=>{
 const original=globalThis.fetch,posted=[],rows=Array.from({length:8},(_,i)=>({existing:i}));
 globalThis.fetch=async(url,init)=>{
  assert.equal(url,'https://script.google.com/macros/s/AKfycbz6104ODjZ88oS9FD0Sb_9CIh2qtzz3vLCbDqCTPvQM3-ZTMHrimfM1XnRDAEUqUjSK/exec');
  const body=JSON.parse(init.body);posted.push(body);if(!rows.some(x=>x.request_id===body.request_id))rows.push(body);
  return Response.json({ok:true,request_id:body.request_id,pagina1:true,historico:true});
 };
 try{
  const contexts=[{env:{DB:database()}},{env:{DB:database()}}],payloads=[];
  for(let i=0;i<2;i++){
   const analysis_id=randomUUID();await storeFor(contexts[i]).setJSON('analyses/'+analysis_id,{product:{name:'Produto',barcode:'7908832601576',validity:''},photos:['photo']});
   payloads.push({analysis_id,request_id:randomUUID(),barcode:'7908832601576',product_name:'Produto',validity:'12/2028',quantity:i?10:50,location:i?'Loja - A1':'Estoque 1 - C2'});
  }
  const responses=await Promise.all(payloads.map((p,i)=>save(new Request('https://example.test/api/save-count',{method:'POST',body:JSON.stringify(p)}),contexts[i])));
  for(const r of responses)assert.equal(r.status,200);
  assert.equal(rows.length,10);assert.deepEqual(rows.slice(8).map(x=>x.estoque_real).sort((a,b)=>a-b),[10,50]);assert.ok(posted.every(x=>x.validade==='12/2028'));
  await save(new Request('https://example.test/api/save-count',{method:'POST',body:JSON.stringify(payloads[0])}),contexts[0]);assert.equal(rows.length,10,'retry must not duplicate a count');
 }finally{globalThis.fetch=original;}
});
