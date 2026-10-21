import {json,storeFor} from "../../lib/common.mjs";
export default async(req,context)=>{
 if(req.method!=="GET")return json({error:"Método inválido."},405);
 const u=new URL(req.url),ean=u.searchParams.get("ean")||"",offset=Math.max(0,Number(u.searchParams.get("offset"))||0);
 if(ean&&!/^\d{8,14}$/.test(ean))return json({error:"Digite somente os números do EAN."},400);
 const store=storeFor(context),{blobs}=await store.list({prefix:"products/"+(ean?ean+"/":"")});
 const keys=blobs.map(x=>x.key).sort().reverse(),records=(await Promise.all(keys.slice(offset,offset+30).map(k=>store.get(k,{type:"json"})))).filter(Boolean);
 return json({records,next_offset:offset+30<keys.length?offset+30:null});
};