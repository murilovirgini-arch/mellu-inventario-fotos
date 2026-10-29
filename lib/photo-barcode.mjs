import {MultiFormatOneDReader,RGBLuminanceSource,BinaryBitmap,HybridBinarizer,BarcodeFormat,DecodeHintType} from '@zxing/library';
import {validEAN} from './recognition.mjs';
export function readBarcodePixels({data,width,height}){
 let pixels=new Uint8ClampedArray(width*height),w=width,h=height;
 for(let p=0,i=0;p<pixels.length;p++,i+=4)pixels[p]=(data[i]+2*data[i+1]+data[i+2])>>2;
 const hints=new Map([[DecodeHintType.POSSIBLE_FORMATS,[BarcodeFormat.EAN_13,BarcodeFormat.EAN_8,BarcodeFormat.UPC_A]],[DecodeHintType.TRY_HARDER,true]]);
 for(let turn=0;turn<4;turn++){
  try{const code=new MultiFormatOneDReader(hints).decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels,w,h))),hints).getText();if(validEAN(code))return code;}catch{}
  const out=new Uint8ClampedArray(pixels.length);for(let y=0;y<h;y++)for(let x=0;x<w;x++)out[x*h+h-y-1]=pixels[y*w+x];pixels=out;[w,h]=[h,w];
 }
 return null;
}
export async function readPhotoBarcode(src){
 try{
  const image=new Image();image.src=src;await image.decode();
  const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
  return readBarcodePixels(ctx.getImageData(0,0,canvas.width,canvas.height));
 }catch{return null;}
}
