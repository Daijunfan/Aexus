const {test}=require('node:test'),assert=require('node:assert/strict');
const {detectVirtualization}=require('../src/host-info.cjs');
const {Parser,instruction}=require('../src/guac-protocol.cjs');
test('virtual machine detection distinguishes a physical Hyper-V host from a guest',()=>{
 const physical=detectVirtualization({manufacturer:'LENOVO',model:'90YS0006CP',hypervisorPresent:true});assert.equal(physical.isVirtual,false);
 const guest=detectVirtualization({manufacturer:'QEMU',model:'Standard PC (Q35 + ICH9, 2009)',hypervisorPresent:true});assert.equal(guest.isVirtual,true);assert.equal(guest.platform,'QEMU/KVM');
 assert.equal(detectVirtualization({hypervisor:'kvm'}).kind,'virtual');
 assert.equal(detectVirtualization({hypervisor:'none'}).kind,'physical');
 assert.equal(detectVirtualization({hypervisorPresent:true}).kind,'unknown');
});
test('Guacamole framing preserves fragmented Unicode, delimiters and multiple instructions',()=>{
 const records=[],parser=new Parser(fields=>records.push(fields)),text=instruction('clipboard','中文😀,.;')+instruction('size',1280,720);
 for(const char of text)parser.write(char);
 assert.deepEqual(records,[['clipboard','中文😀,.;'],['size','1280','720']]);
 assert.throws(()=>new Parser(()=>{}).write('-1.a;'),/Invalid/);
});
test('Guacamole parser preserves raw wire across every UTF-16 split and large frame fragments',()=>{
 const text=instruction('clipboard','😀中文,.;')+instruction('blob',2,'x'.repeat(256*1024))+instruction('sync',123);
 const result=[],parser=new Parser((fields,wire)=>result.push({fields,wire}));
 // Deliberately split a surrogate pair as well as the size prefix/delimiter.
 for(let i=0;i<32;i++)parser.write(text.slice(i,i+1));
 for(let i=32;i<text.length;i+=4096)parser.write(text.slice(i,i+4096));
 assert.equal(result.map(r=>r.wire).join(''),text);
 assert.deepEqual(result.map(r=>r.fields[0]),['clipboard','blob','sync']);assert.equal(result[1].fields[2].length,256*1024);
 for(const malformed of ['x.a;','1.a!','9007199254740992.'])assert.throws(()=>new Parser(()=>{}).write(malformed),/Invalid/);
});
