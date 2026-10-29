import analyze from './analyze.mjs';
import save from './save-count.mjs';
import catalog from './catalog.mjs';
import photo from './photo.mjs';
import {json,originOK} from '../lib/common.mjs';
const routes={'/api/analyze':analyze,'/api/save-count':save,'/api/catalog':catalog,'/api/photo':photo};
export default {
 async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(path==='/api/health')return json({platform:'cloudflare',ai:'google-direct',model:'gemini-3.5-flash-lite',storage:!!env.DB,ai_ready:!!env.GEMINI_API_KEY&&env.GEMINI_FREE_TIER_CONFIRMED==='true',sheet_writer:'existing-shared-writer'});
  const handler=routes[path];
  if(!handler)return path.startsWith('/api/')?json({error:'Rota não encontrada.'},404):env.ASSETS.fetch(request);
  if(!originOK(request))return json({error:'Origem inválida.'},403);
  if(!env.DB)return json({error:'O banco gratuito desta versão ainda não foi configurado.'},503);
  if(path==='/api/analyze'&&(!env.GEMINI_API_KEY||env.GEMINI_FREE_TIER_CONFIRMED!=='true'))return json({error:'Configure a chave de um projeto Gemini no Free Tier. Esta versão não usa IA paga nem a Netlify automaticamente.',retryable:false},422);
  try{return await handler(request,{env});}
  catch{return json({error:'O serviço gratuito está indisponível ou atingiu sua cota. Os dados continuam no aparelho.'},503);}
 }
};
