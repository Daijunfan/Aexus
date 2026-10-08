/** Synthetic one-page PDF fixture. No network, external fonts, or user documents. */
export function researchPdfFixture(line='Independent research findings are checked against the exact source text.'){
 const content=`BT /F1 12 Tf 54 738 Td (${String(line).replace(/[\\()]/g,'\\$&')}) Tj ET`
 const objects=[
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`
 ]
 let data='%PDF-1.4\n',offsets=[0]
 for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(data));data+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`}
 const start=Buffer.byteLength(data)
 data+=`xref\n0 ${offsets.length}\n0000000000 65535 f \n`
 for(const offset of offsets.slice(1))data+=String(offset).padStart(10,'0')+' 00000 n \n'
 data+=`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`
 return Buffer.from(data)
}
