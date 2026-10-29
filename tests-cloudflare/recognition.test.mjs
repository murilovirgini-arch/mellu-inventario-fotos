import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeReadings,validEAN,barcodeDigits,identifierForSave} from '../lib/recognition.mjs';
const front={brand:'Natucera',name:'Creme Esfoliante Essencial',specifications:'Damasco e jojoba'};
const back={barcode:'7898936910530',content:'500 g',validity:'05/2024'};
test('joins front and back fields into description and separate columns',()=>{const p=mergeReadings([front,back]);assert.equal(p.name,'Natucera · Creme Esfoliante Essencial · Damasco e jojoba · 500 g');assert.equal(p.barcode,back.barcode);assert.equal(p.barcode_status,'validated');assert.equal(p.validity,back.validity);});
test('merges ten partial readings without requiring a code in every batch',()=>{const reads=Array.from({length:10},(_,i)=>i===9?back:front);assert.equal(mergeReadings(reads).barcode,back.barcode);});
test('surfaces incompatible codes instead of choosing one',()=>{const p=mergeReadings([front,back,{barcode:'3337875397797'}]);assert.equal(p.barcode,'');assert.equal(p.barcode_status,'conflict');assert.equal(p.barcode_candidates.length,2);});
test('marks missing or invalid check digits for review without discarding product data',()=>{assert.equal(validEAN('7898936910531'),false);const p=mergeReadings([front,{barcode:'7898936910531'}]);assert.equal(p.barcode,'7898936910531');assert.equal(p.barcode_status,'pending');assert.equal(mergeReadings([front]).barcode_status,'missing');});
test('does not silently choose between conflicting expiry dates',()=>{assert.throws(()=>mergeReadings([front,back,{validity:'06/2025'}]),/validades diferentes/);});
test('validates EAN-8, UPC-A, EAN-13 and GTIN-14 check digits',()=>{
 for(const code of ['96385074','036000291452','4006381333931','10012345000017'])assert.equal(validEAN(code),true,code);
 for(const code of ['96385075','036000291453','4006381333932','10012345000018','123456789','1234567890123'])assert.equal(validEAN(code),false,code);
});
test('normalizes OCR punctuation without inventing digits',()=>{
 assert.equal(barcodeDigits('  400 638-133.3931  '),'4006381333931');
 assert.equal(barcodeDigits('400638133393'),'400638133393');
});
test('keeps recognized product data when the barcode is missing or invalid',()=>{
 const missing=mergeReadings([front,{content:'500 g'}]);
 assert.equal(missing.name,'Natucera · Creme Esfoliante Essencial · Damasco e jojoba · 500 g');
 assert.equal(missing.barcode,'');assert.equal(missing.barcode_status,'missing');
 const invalid=mergeReadings([front,{barcode:'4006381333932',internal_code:'SKU-47'}]);
 assert.equal(invalid.barcode,'4006381333932');assert.equal(invalid.barcode_status,'pending');
 assert.equal(invalid.internal_code,'SKU-47');
});
test('combines multi-photo readings and surfaces code divergence for correction',()=>{
 const product=mergeReadings([front,{barcode:'4006381333931'},{content:'500 g',internal_code:'SKU-47'},{barcode:'036000291452'}]);
 assert.equal(product.name,'Natucera · Creme Esfoliante Essencial · Damasco e jojoba · 500 g');
 assert.equal(product.barcode_status,'conflict');assert.equal(product.barcode,'');
 assert.deepEqual(product.barcode_candidates,['4006381333931','036000291452']);
 assert.equal(product.internal_code,'SKU-47');
});
test('allows explicitly marked internal identifiers without calling them GTINs',()=>{
 assert.deepEqual(identifierForSave({barcode:'4006381333932',internal_code:'SKU-47'}),{identifier:'INTERNO: SKU-47',barcode:'',internal_code:'SKU-47',barcode_status:'pending'});
 assert.deepEqual(identifierForSave({barcode:'036000291452'}),{identifier:'036000291452',barcode:'036000291452',internal_code:'',barcode_status:'validated'});
 assert.equal(identifierForSave({barcode:'4006381333932'}).identifier,'');
});
