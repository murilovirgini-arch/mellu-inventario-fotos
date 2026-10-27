import {json,storeFor} from "../../lib/common.mjs";
export default async(req,context)=>{
 if(req.method!=="GET")return json({error:"Método inválido."},405);
 const u=new URL(req.url),ean=(u.searchParams.get("ean")||"").trim(),offset=Math.max(0,Number(u.searchParams.get("offset"))||0);
 if(ean&&!/^(?:[0-9]{8}|[0-9]{12,14}|INTERNO: [A-Za-z0-9._ /-]{1,80})$/.test(ean))return json({error:"Informe um EAN/UPC ou um código interno válido."},400);
 const store=storeFor(context),{blobs}=await store.list({prefix:"products/"+(ean?encodeURIComponent(ean)+"/":"")});
 const keys=blobs.map(x=>x.key).sort().reverse(),records=(await Promise.all(keys.slice(offset,offset+30).map(k=>store.get(k,{type:"json"})))).filter(Boolean);
 return json({records,next_offset:offset+30<keys.length?offset+30:null});
};
