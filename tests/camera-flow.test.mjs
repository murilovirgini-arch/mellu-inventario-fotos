import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";
test("three consecutive captures are added together by one Use photos action",async()=>{
 const elements=new Map();let sequence=0,stops=0;
 function element(){return {children:[],listeners:{},textContent:"",disabled:false,open:false,append(...items){this.children.push(...items);},replaceChildren(){this.children=[];},setAttribute(){},addEventListener(name,fn){this.listeners[name]=fn;},showModal(){this.open=true;},close(){this.open=false;this.listeners.close?.();},click(){this.onclick?.();}};}
 const $=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
 Object.assign($("captureVideo"),{readyState:2,videoWidth:1920,videoHeight:1080,srcObject:{}});
 const document={hidden:false,addEventListener(){},createElement(tag){if(tag==="canvas")return {getContext:()=>({drawImage(){}}),toBlob:cb=>cb(new Blob(["frame"],{type:"image/jpeg"}))};return element();}};
 const context=vm.createContext({$,document,Blob,window:{addEventListener(){}},createCameraSession:()=>({start:async()=>true,stop:()=>stops++}),compress:async()=>"photo-"+(++sequence),invalidate(){},renderPhotos(){},status(){}});
 const source=await readFile(new URL("../app.js",import.meta.url),"utf8");
 vm.runInContext('let photos=[],processing=false;'+source.slice(source.indexOf('const cameraSession=')),context);
 await vm.runInContext("openCamera()",context);
 await vm.runInContext("capturePhoto()",context);await vm.runInContext("capturePhoto()",context);await vm.runInContext("capturePhoto()",context);
 assert.equal(vm.runInContext("photos.length",context),0);
 assert.equal($("captureUse").textContent,"Usar fotos (3)");
 $("captureUse").onclick();
 assert.equal(vm.runInContext("photos.length",context),3);
 assert.equal($("captureDialog").open,false);
 assert.equal(stops,1);
});
