export function createCameraSession({video,mediaDevices=navigator.mediaDevices}){
 let generation=0,stream=null;
 function stop(){generation++;if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}video.srcObject=null;}
 async function start(){
  stop();const current=generation;
  if(!mediaDevices?.getUserMedia)throw Error("A câmera integrada não está disponível neste navegador.");
  const next=await mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:"environment"},width:{ideal:1920},height:{ideal:1080}}});
  if(current!==generation){next.getTracks().forEach(t=>t.stop());return false;}
  stream=next;video.srcObject=stream;
  try{await video.play();}catch(error){if(current===generation)stop();throw error;}
  return current===generation;
 }
 return {start,stop};
}
