export const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export function originOK(req){const origin=req.headers.get('origin');return !origin||origin===new URL(req.url).origin;}
export function imageData(value){const m=typeof value==='string'&&value.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);return m?{mimeType:'image/'+m[1],data:m[2]}:null;}
const text=row=>row?Buffer.from(row.value).toString('utf8'):null;
export function storeFor(context){
 const db=context.env.DB;
 const getRow=key=>db.prepare('SELECT value, metadata FROM objects WHERE key = ?').bind(key).first();
 return {
  async get(key,{type='text'}={}){const row=await getRow(key);if(!row)return null;return type==='json'?JSON.parse(text(row)):type==='arrayBuffer'?new Uint8Array(row.value).buffer:text(row);},
  async getMany(keys){const out=new Map();for(let n=0;n<keys.length;n+=90){const group=keys.slice(n,n+90);const result=await db.prepare('SELECT key,value FROM objects WHERE key IN ('+group.map(()=>'?').join(',')+')').bind(...group).all();for(const row of result.results)out.set(row.key,JSON.parse(text(row)));}return keys.map(k=>out.get(k)||null);},
  async getWithMetadata(key){const row=await getRow(key);return row?{data:new Uint8Array(row.value).buffer,metadata:JSON.parse(row.metadata)}:null;},
  async set(key,value,options={}){
   const bytes=typeof value==='string'?new TextEncoder().encode(value):new Uint8Array(value);
   if(bytes.byteLength>1600000)throw Error('Arquivo maior que o permitido pelo banco gratuito.');
   const sql=options.onlyIfNew?'INSERT OR IGNORE INTO objects (key,value,metadata) VALUES (?,?,?)':'INSERT INTO objects (key,value,metadata) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,metadata=excluded.metadata';
   return db.prepare(sql).bind(key,bytes.buffer,JSON.stringify(options.metadata||{})).run();
  },
  async setJSON(key,value){return this.set(key,JSON.stringify(value));},
  async list({prefix=''}){const result=await db.prepare('SELECT key FROM objects WHERE key >= ? AND key < ? ORDER BY key').bind(prefix,prefix+'\uffff').all();return {blobs:result.results};}
 };
}
