import jpeg from "jpeg-js";
import {MultiFormatOneDReader,RGBLuminanceSource,BinaryBitmap,HybridBinarizer,BarcodeFormat,DecodeHintType} from "@zxing/library";
import {validEAN} from "./recognition.mjs";
export function decodePhotoEAN(bytes,mimeType="image/jpeg"){
 if(mimeType!=="image/jpeg")return null;
 try{
  const {width,height,data}=jpeg.decode(bytes,{useTArray:true,maxResolutionInMP:6,maxMemoryUsageInMB:128});
  const gray=new Uint8ClampedArray(width*height);
  for(let p=0,i=0;p<gray.length;p++,i+=4)gray[p]=(data[i]+2*data[i+1]+data[i+2])>>2;
  const hints=new Map([[DecodeHintType.POSSIBLE_FORMATS,[BarcodeFormat.EAN_13,BarcodeFormat.EAN_8,BarcodeFormat.UPC_A]],[DecodeHintType.TRY_HARDER,true]]);
  // One-dimensional readers scan rows. Phone photos can put the bars sideways.
  let pixels=gray,w=width,h=height;
  for(let turn=0;turn<4;turn++){
   try{
    const code=new MultiFormatOneDReader(hints).decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels,w,h))),hints).getText();
    if(validEAN(code))return code;
   }catch{}
   const rotated=new Uint8ClampedArray(pixels.length);
   for(let y=0;y<h;y++)for(let x=0;x<w;x++)rotated[x*h+h-1-y]=pixels[y*w+x];
   pixels=rotated;[w,h]=[h,w];
  }
  return null;
 }catch{return null;}
}

export function prepareLabelImages(images){
 if(images.reduce((n,img)=>n+img.data.length,0)<=200000)return images;
 const maxSize=Math.floor(200000/images.length);
 return images.map(img=>{
  if(img.data.length<=maxSize||img.mimeType!=="image/jpeg")return img;
  const image=jpeg.decode(Buffer.from(img.data,"base64"),{useTArray:true,maxResolutionInMP:6,maxMemoryUsageInMB:128});
  let data=img.data;
  for(const quality of [65,45,30,20,10]){
   data=jpeg.encode(image,quality).data.toString("base64");
   if(data.length<=maxSize)break;
  }
  return {...img,data};
 });
}

