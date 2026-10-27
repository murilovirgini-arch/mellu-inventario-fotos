import test from "node:test";import assert from "node:assert/strict";
import {decodePhotoEAN} from "../lib/barcode.mjs";
import {mergeReadings} from "../lib/recognition.mjs";
test("rejects invalid or unsupported images without blocking OCR",()=>{assert.equal(decodePhotoEAN(Buffer.from("invalid")),null);assert.equal(decodePhotoEAN(Buffer.from("invalid"),"image/png"),null);});
test("complete brand wins over a longer cropped logo guess",()=>{const p=mergeReadings([{brand:"WrongNameFromCurvedLabel",brand_complete:false,name:"Creme"},{brand:"Natucera",brand_complete:true},{barcode:"7898936910530",content:"500 g"}]);assert.equal(p.name,"Natucera · Creme · 500 g");});
test("conflicting bars and printed digits must be checked",()=>{assert.equal(mergeReadings([{name:"Teste",barcode:"7898936910530",barcode_conflict:true}]).barcode_status,"conflict");});
test("older receipts without brand flags remain compatible",()=>{assert.equal(mergeReadings([{brand:"Marca",name:"Produto",barcode:"7898936910530"}]).name,"Marca · Produto");});

