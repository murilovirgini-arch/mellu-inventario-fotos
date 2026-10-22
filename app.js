import {postAnalysis,readPhotoBatches} from "./analysis-recovery.mjs";
import {createCameraSession} from "./camera-session.mjs";
const $=id=>document.getElementById(id);
const batchCache=new Map();
let photos=[],reading=null,processing=false,saving=false,syncPromise=null,retryTimer;
let entries=[],storageBroken=false,galleryRows=[],galleryOffset=0,galleryEAN="";
const storageKey="mellu_photos_events_v1";
try{entries=JSON.parse(localStorage.getItem(storageKey)||"[]");if(!Array.isArray(entries))throw Error();}catch{storageBroken=true;}
try{$("location").value=localStorage.getItem("mellu_photo_location")||"";}catch{storageBroken=true;}
function persist(){localStorage.setItem(storageKey,JSON.stringify(entries));}
function status(id,text,type=""){const el=$(id);el.textContent=text;el.className="status "+type;}
function updateControls(){$("analyze").disabled=!photos.length||processing;$("save").disabled=!reading||processing||saving||storageBroken;$("camera").disabled=processing;$("openCamera").disabled=processing;$("photos").disabled=processing;}
function invalidate(){reading=null;$("resultCard").hidden=true;updateControls();}
function compress(file){return new Promise((resolve,reject)=>{const image=new Image(),url=URL.createObjectURL(file);image.onload=()=>{try{let scale=Math.min(1,1600/Math.max(image.width,image.height)),canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));canvas.getContext("2d").drawImage(image,0,0,canvas.width,canvas.height);let quality=.82,data=canvas.toDataURL("image/jpeg",quality);while(data.length>200000&&quality>.45){quality-=.1;data=canvas.toDataURL("image/jpeg",quality);}while(data.length>200000&&canvas.width>640){const next=document.createElement("canvas");next.width=Math.round(canvas.width*.85);next.height=Math.round(canvas.height*.85);next.getContext("2d").drawImage(canvas,0,0,next.width,next.height);canvas=next;data=canvas.toDataURL("image/jpeg",.72);}if(data.length>200000)throw Error("Esta foto ficou muito grande. Fotografe apenas o detalhe da embalagem.");resolve(data);}catch(e){reject(e);}finally{URL.revokeObjectURL(url);}};image.onerror=()=>{URL.revokeObjectURL(url);reject(Error("Não foi possível abrir a imagem. Use JPEG, PNG ou uma foto da câmera."));};image.src=url;});}
async function addPhotos(event){const files=Array.from(event.target.files||[]);if(!files.length)return;processing=true;invalidate();status("analysisStatus","Preparando fotos…","busy");try{for(const file of files){if(!file.type.startsWith("image/"))throw Error("Selecione apenas imagens.");photos.push(await compress(file));}renderPhotos();status("analysisStatus",photos.length+" foto(s) prontas. Toque em Ler embalagem com IA.");}catch(e){status("analysisStatus",e.message,"error");renderPhotos();}finally{processing=false;event.target.value="";updateControls();}}
function renderPhotos(){$("previews").replaceChildren();photos.forEach((src,index)=>{const item=document.createElement("div");item.className="preview";const img=document.createElement("img");img.src=src;img.alt="Foto "+(index+1)+" da embalagem";const remove=document.createElement("button");remove.type="button";remove.textContent="×";remove.setAttribute("aria-label","Remover foto "+(index+1));remove.disabled=processing;remove.onclick=()=>{photos.splice(index,1);invalidate();renderPhotos();status("analysisStatus","Fotos alteradas. Leia novamente para atualizar os dados.");};item.append(img,remove);$("previews").append(item);});}
async function analyze(){if(processing||!photos.length)return;processing=true;invalidate();renderPhotos();status("analysisStatus","Lendo "+photos.length+" foto(s). Aguarde a identificação do produto…","busy");try{const send=payload=>postAnalysis(payload,{
 onRetry:({attempt,attempts})=>status("analysisStatus","A leitura está demorando. Retomando automaticamente ("+attempt+"/"+attempts+")…","busy"),
 validate:result=>payload.stage==="extract"?typeof result.batch_id==="string":typeof result.analysis_id==="string"&&!!result.product
});
 const batch_ids=await readPhotoBatches(photos,{send,cache:batchCache,
 onProgress:({completed,total})=>status("analysisStatus","Fotos lidas: "+completed+" de "+total+"…","busy")});
 status("analysisStatus","Reunindo os dados de "+photos.length+" fotos…","busy");
 const result=await send({batch_ids});
 reading=result;$("productName").textContent=result.product.name;$("productEAN").textContent=result.product.barcode;$("productValidity").textContent=result.product.validity?result.product.validity.split("-").reverse().join("/"):"Não identificada nas fotos";$("readWarning").textContent=(result.warnings||[]).join(" ");$("resultCard").hidden=false;status("analysisStatus","Leitura concluída. As fotos estão guardadas e vinculadas ao EAN.","success");}catch(e){status("analysisStatus",e.name==="TimeoutError"?"A leitura demorou demais. As fotos continuam aqui; tente novamente.":e.message,"error");}finally{processing=false;renderPhotos();updateControls();}}
async function saveCount(){if(!reading||saving)return;const raw=$("quantity").value,quantity=Number(raw),location=$("location").value.trim();if(!raw.trim()||!Number.isInteger(quantity)||quantity<0){status("saveStatus","Informe uma quantidade inteira, igual ou maior que zero.","error");$("quantity").focus();return;}if(!location){status("saveStatus","Informe onde o produto está, por exemplo: Estoque 1 - C2.","error");$("location").focus();return;}saving=true;updateControls();try{const entry={request_id:crypto.randomUUID(),analysis_id:reading.analysis_id,quantity,location,product:reading.product,created_at:new Date().toISOString(),status:"pending"};entries.push(entry);try{persist();}catch(e){entries.pop();throw Error("Não foi possível guardar o envio neste aparelho. Libere espaço antes de salvar.");}try{localStorage.setItem("mellu_photo_location",location);}catch{}photos=[];batchCache.clear();reading=null;$("quantity").value="";$("resultCard").hidden=true;renderPhotos();status("analysisStatus","Contagem guardada. Adicione fotos do próximo produto.");status("saveStatus","Envio pendente. Aguarde a confirmação nas duas abas.","busy");renderEvents();sync();}catch(e){status("saveStatus",e.message,"error");}finally{saving=false;updateControls();}}
function renderEvents(){const pending=entries.filter(e=>e.status!=="confirmed");$("queueStatus").textContent=storageBroken?"Não foi possível ler os dados locais. Preserve os dados deste navegador.":pending.length?pending.length+" contagem(ns) aguardando confirmação.":"Nenhuma contagem pendente.";$("retry").disabled=!!syncPromise||!pending.length;$("events").replaceChildren();entries.slice(-20).reverse().forEach(e=>{const row=document.createElement("div");row.className="event";const title=document.createElement("strong");title.textContent=e.product.name;const text=document.createElement("small");text.textContent=e.quantity+" un. · "+e.location+" · "+e.product.barcode;const state=document.createElement("small");state.className=e.status==="confirmed"?"":"pending";state.textContent=e.status==="confirmed"?"Confirmado na Página1 e no histórico":e.error||"Pendente de envio";row.append(title,text,state);$("events").append(row);});}
function sync(){if(syncPromise)return syncPromise;if(navigator.onLine===false)return Promise.resolve();clearTimeout(retryTimer);syncPromise=(async()=>{for(const entry of entries.filter(e=>e.status!=="confirmed")){try{entry.error="Enviando e verificando as duas abas…";renderEvents();const response=await fetch("/.netlify/functions/save-count",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({request_id:entry.request_id,analysis_id:entry.analysis_id,quantity:entry.quantity,location:entry.location}),signal:AbortSignal.timeout(56000)});const result=await response.json().catch(()=>({}));if(!response.ok||result.request_id!==entry.request_id||!result.pagina1||!result.historico)throw Error(result.error||"A planilha ainda não confirmou este envio.");entry.status="confirmed";entry.rows=result;entry.error="";persist();status("saveStatus","Confirmado nas duas abas: "+entry.product.name+" · "+entry.quantity+" un. · "+entry.location,"success");}catch(e){entry.error=e.name==="TimeoutError"?"O Google demorou para confirmar. O envio será repetido sem duplicar esta contagem.":e.message;try{persist();}catch{}status("saveStatus",entry.error,"error");retryTimer=setTimeout(sync,20000);break;}finally{renderEvents();}}})().finally(()=>{syncPromise=null;renderEvents();});renderEvents();return syncPromise;}
function showView(gallery){$("countView").hidden=gallery;$("galleryView").hidden=!gallery;$("tabCount").classList.toggle("active",!gallery);$("tabGallery").classList.toggle("active",gallery);if(gallery)loadGallery(true);window.scrollTo({top:0,behavior:"smooth"});}
function viewPhoto(id,product){$("largePhoto").src="/.netlify/functions/photo?id="+encodeURIComponent(id);$("photoCaption").textContent=product.name+" · EAN "+product.barcode;$("photoDialog").showModal();}
async function loadGallery(reset){if(reset){galleryRows=[];galleryOffset=0;$("gallery").replaceChildren();}status("galleryStatus","Carregando fotos salvas…","busy");$("moreGallery").hidden=true;try{const query=new URLSearchParams({offset:String(galleryOffset)});if(galleryEAN)query.set("ean",galleryEAN);const response=await fetch("/.netlify/functions/catalog?"+query);const result=await response.json();if(!response.ok)throw Error(result.error||"Não foi possível carregar a galeria.");galleryRows.push(...result.records);galleryOffset=result.next_offset;renderGallery();$("moreGallery").hidden=result.next_offset===null;status("galleryStatus",galleryRows.length?"Fotos e contagens encontradas.":"Nenhum produto salvo para esta busca.");}catch(e){status("galleryStatus",e.message,"error");}}
function renderGallery(){const groups=new Map();for(const row of galleryRows){if(!groups.has(row.product.barcode))groups.set(row.product.barcode,{product:row.product,photos:new Set(),locations:new Set(),pending:0});const group=groups.get(row.product.barcode);row.photos.forEach(id=>group.photos.add(id));group.locations.add(row.location);if(row.status!=="confirmed")group.pending++;}$("gallery").replaceChildren();for(const group of groups.values()){const card=document.createElement("article");card.className="product";const ids=Array.from(group.photos);const cover=document.createElement("button"),img=document.createElement("img");img.src="/.netlify/functions/photo?id="+encodeURIComponent(ids[0]);img.alt=group.product.name;img.loading="lazy";cover.append(img);cover.onclick=()=>viewPhoto(ids[0],group.product);const meta=document.createElement("div");meta.className="meta";const title=document.createElement("h2");title.textContent=group.product.name;const code=document.createElement("p");code.textContent="EAN "+group.product.barcode;const loc=document.createElement("p");loc.textContent=Array.from(group.locations).join(" · ");const minis=document.createElement("div");minis.className="miniPhotos";for(const id of ids){const btn=document.createElement("button"),photo=document.createElement("img");photo.src="/.netlify/functions/photo?id="+encodeURIComponent(id);photo.alt="Outro ângulo da embalagem";photo.loading="lazy";btn.append(photo);btn.onclick=()=>viewPhoto(id,group.product);minis.append(btn);}meta.append(title,code,loc,minis);if(group.pending){const p=document.createElement("p");p.textContent=group.pending+" envio(s) ainda pendente(s)";meta.append(p);}card.append(cover,meta);$("gallery").append(card);}}
$("camera").addEventListener("change",addPhotos);$("photos").addEventListener("change",addPhotos);$("analyze").onclick=analyze;$("save").onclick=saveCount;$("retry").onclick=sync;$("tabCount").onclick=()=>showView(false);$("tabGallery").onclick=()=>showView(true);$("gallerySearch").onsubmit=e=>{e.preventDefault();galleryEAN=$("searchEAN").value.replace(/\D/g,"");loadGallery(true);};$("allPhotos").onclick=()=>{galleryEAN="";$("searchEAN").value="";loadGallery(true);};$("moreGallery").onclick=()=>loadGallery(false);$("closePhoto").onclick=()=>$("photoDialog").close();window.addEventListener("online",sync);renderEvents();updateControls();sync();

const cameraSession=createCameraSession({video:$("captureVideo")});
let cameraDraft=[],takingPhoto=false;
function cameraMessage(text){$("captureStatus").textContent=text;}
function renderCameraDraft(){
 $("captureReview").replaceChildren();
 cameraDraft.forEach((src,index)=>{
  const item=document.createElement("div");item.className="captureThumb";
  const img=document.createElement("img");img.src=src;img.alt="Foto capturada "+(index+1);
  const remove=document.createElement("button");remove.type="button";remove.textContent="×";remove.setAttribute("aria-label","Excluir foto capturada "+(index+1));remove.disabled=takingPhoto;
  remove.onclick=()=>{cameraDraft.splice(index,1);renderCameraDraft();};
  item.append(img,remove);$("captureReview").append(item);
 });
 $("captureUse").textContent="Usar fotos ("+cameraDraft.length+")";
 $("captureUse").disabled=takingPhoto||!cameraDraft.length;
 $("captureShot").disabled=takingPhoto||!$("captureVideo").srcObject;
}
async function openCamera(){
 if(processing)return;
 $("captureDialog").showModal();renderCameraDraft();cameraMessage("Abrindo câmera…");
 try{const active=await cameraSession.start();if(!active||!$("captureDialog").open)return;renderCameraDraft();cameraMessage("Fotografe os ângulos do mesmo produto. Quando terminar, toque em Usar fotos.");}
 catch{if(!$("captureDialog").open)return;cameraMessage("Não foi possível abrir a câmera aqui. Confira a permissão do navegador ou use a câmera do aparelho abaixo.");renderCameraDraft();}
}
async function capturePhoto(){
 const video=$("captureVideo");
 if(takingPhoto||!video.srcObject)return;
 if(video.readyState<2||!video.videoWidth){cameraMessage("Aguarde a imagem da câmera aparecer.");return;}
 takingPhoto=true;renderCameraDraft();
 try{
  const canvas=document.createElement("canvas");canvas.width=video.videoWidth;canvas.height=video.videoHeight;
  canvas.getContext("2d").drawImage(video,0,0);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.9));
  if(!blob)throw Error("Não foi possível capturar esta foto.");
  cameraDraft.push(await compress(blob));cameraMessage("Foto "+cameraDraft.length+" capturada. Você já pode tirar a próxima.");
 }catch(e){cameraMessage(e.message||"Não foi possível capturar esta foto. Tente novamente.");}
 finally{takingPhoto=false;renderCameraDraft();$("captureReview").scrollLeft=$("captureReview").scrollWidth;}
}
$("openCamera").onclick=openCamera;
$("captureShot").onclick=capturePhoto;
$("captureUse").onclick=()=>{
 if(takingPhoto||!cameraDraft.length)return;
 photos.push(...cameraDraft);cameraDraft=[];invalidate();renderPhotos();$("captureDialog").close();
 status("analysisStatus",photos.length+" foto(s) prontas. Toque em Ler embalagem com IA.");
};
$("captureClose").onclick=()=>$("captureDialog").close();
$("captureDialog").addEventListener("close",()=>{cameraSession.stop();renderCameraDraft();});
$("captureFallback").onclick=()=>{$("captureDialog").close();$("camera").click();};
document.addEventListener("visibilitychange",()=>{
 if(document.hidden&&$("captureDialog").open){$("captureDialog").close();cameraSession.stop();}
});
window.addEventListener("pagehide",()=>cameraSession.stop());
