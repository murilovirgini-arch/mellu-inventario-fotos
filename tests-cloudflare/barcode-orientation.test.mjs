import test from 'node:test';
import assert from 'node:assert/strict';

import {readBarcodePixels} from '../lib/photo-barcode.mjs';
const code='7897169261549';
// Independent EAN-13 symbol fixture, including quiet zones.
const L=['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
const G=['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
const parity=['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];
function fixture(){
 let bits='000000000000101';
 for(let i=1;i<=6;i++)bits+=(parity[+code[0]][i-1]==='L'?L:G)[+code[i]];
 bits+='01010';for(let i=7;i<13;i++)bits+=L[+code[i]].replace(/[01]/g,b=>b==='0'?'1':'0');bits+='101000000000000';
 const width=bits.length*3,height=120,data=Buffer.alloc(width*height*4,255);
 for(let y=10;y<110;y++)for(let x=0;x<width;x++)if(bits[Math.floor(x/3)]==='1'){const p=(y*width+x)*4;data[p]=data[p+1]=data[p+2]=0;}
 return {width,height,data};
}
function rotate({width,height,data}){const out=Buffer.alloc(data.length);for(let y=0;y<height;y++)for(let x=0;x<width;x++)data.copy(out,(x*height+height-y-1)*4,(y*width+x)*4,(y*width+x+1)*4);return {width:height,height:width,data:out};}
test('reads the same EAN at all four phone-photo orientations',()=>{let image=fixture();for(let i=0;i<4;i++){assert.equal(readBarcodePixels(image),code,'rotation '+i*90);image=rotate(image);}});
