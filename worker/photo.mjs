import {storeFor,json} from "../lib/common.mjs";
export default async(req,context)=>{
 const id=new URL(req.url).searchParams.get("id");
 if(req.method!=="GET"||!/^[a-f0-9]{64}$/.test(id||""))return json({error:"Imagem inválida."},400);
 const r=await storeFor(context).getWithMetadata("images/"+id,{type:"arrayBuffer"});
 if(!r)return json({error:"Foto não encontrada."},404);
 return new Response(r.data,{headers:{"Content-Type":r.metadata.contentType||"image/jpeg","Cache-Control":"public,max-age=86400","X-Content-Type-Options":"nosniff"}});
};