import {getStore} from "@netlify/blobs";
export const json=(data,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
export function storeFor(context){return getStore({name:context?.deploy?.context==="production"?"mellu-photos-prod":"mellu-photos-preview",consistency:"strong"});}
export function originOK(req){const origin=req.headers.get("origin");return !origin||origin===new URL(req.url).origin;}
export function validEAN(s){if(!/^(?:[0-9]{8}|[0-9]{12,14})$/.test(s))return false;let sum=0;for(let i=s.length-2,j=0;i>=0;i--,j++)sum+=Number(s[i])*(j%2===0?3:1);return (10-sum%10)%10===Number(s.at(-1));}
export function imageData(value){const m=typeof value==="string"&&value.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);return m?{mimeType:"image/"+m[1],data:m[2]}:null;}
