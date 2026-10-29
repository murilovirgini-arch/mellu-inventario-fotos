const transient=new Set([408,425,429,500,502,503,504]);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function postAnalysis(payload,{fetchImpl=fetch,wait=sleep,onRetry=()=>{},attempts=3,timeoutMs=35000,validate=()=>true}={}){
 for(let attempt=1;attempt<=attempts;attempt++){
  try{
   const response=await fetchImpl("/api/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),signal:AbortSignal.timeout(timeoutMs)});
   let result;try{result=await response.json();}catch{result=null;}
   if(!response.ok){
    const error=new Error(result?.error||(transient.has(response.status)?"O serviço demorou para responder. Suas fotos foram preservadas.":"Não foi possível concluir esta leitura."));
    error.retryable=transient.has(response.status)||result?.retryable===true;
    const after=Number(response.headers?.get("Retry-After"));error.delay=Number.isFinite(after)&&after>0?Math.min(after*1000,10000):null;
    throw error;
   }
   if(!result||!validate(result)){const error=new Error("O serviço retornou uma resposta incompleta. Suas fotos foram preservadas.");error.retryable=true;throw error;}
   return result;
  }catch(error){
   const retryable=error.retryable===true||error instanceof TypeError||["TimeoutError","AbortError"].includes(error.name);
   if(!retryable||attempt===attempts)throw error;
   onRetry({attempt:attempt+1,attempts});
   await wait(error.delay??attempt*1000);
  }
 }
}
export async function readPhotoBatches(photos,{send,cache=new Map(),onProgress=()=>{},keyOf=async photo=>{
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(photo));
 return "photo:"+Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,"0")).join("");
},concurrency=3}){
 const ids=new Array(photos.length),inflight=new Map(),errors=[];
 let next=0,completed=0;
 async function worker(){
  while(next<photos.length){
   const index=next++;
   try{
    const key=await keyOf(photos[index]);
    if(cache.has(key)){ids[index]=cache.get(key);}
    else{
     if(!inflight.has(key)){
      const pending=send({stage:"extract",images:[photos[index]]}).then(batch=>{if(typeof batch.batch_id!=="string")throw Error("Leitura incompleta da foto.");cache.set(key,batch.batch_id);return batch.batch_id;});
      inflight.set(key,pending);
     }
     ids[index]=await inflight.get(key);
    }
    completed++;onProgress({completed,total:photos.length});
   }catch(error){errors.push(error);}
  }
 }
 await Promise.all(Array.from({length:Math.min(concurrency,photos.length)},worker));
 if(errors.length)throw errors[0];
 return ids;
}
