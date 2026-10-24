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
  const code=new MultiFormatOneDReader(hints).decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(gray,width,height))),hints).getText();
  return validEAN(code)?code:null;
 }catch{return null;}
}
