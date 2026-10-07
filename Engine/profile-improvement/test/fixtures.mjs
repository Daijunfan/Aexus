import {zipSync,strToU8} from 'fflate'
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main',R='http://schemas.openxmlformats.org/officeDocument/2006/relationships'
export const ORIGINAL_BULLET='Participated in REST API development and wrote Python test scripts.'
export const OPTIMIZED_BULLET='Contributed REST API features and wrote Python test scripts.'
export const TEST_BULLET='Wrote Python test scripts and contributed to REST APIs.'
const p=(text,properties='')=>`<w:p>${properties}<w:r><w:t>${text}</w:t></w:r></w:p>`
export function fixture({table=true,tracked=false,extra='',text=ORIGINAL_BULLET}={}){
 const body=[p('Alex Morgan','<w:pPr><w:pStyle w:val="Title"/></w:pPr>'),p('alex@example.com | +1 555 010 2000'),p('Backend developer focused on reliable software and clear documentation.'),p('EXPERIENCE','<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>'),p('Software Intern · Example Studio · 2024-06 to 2025-06'),p(text),'<w:p><w:r><w:t xml:space="preserve">Worked with </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>Python</w:t></w:r><w:r><w:t xml:space="preserve"> to maintain test coverage and document API changes.</w:t></w:r></w:p>',p('Maintained 12 test cases for API request validation.'),p('EDUCATION','<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>'),p('Bachelor of Computer Science · Example University'),table?'<w:tbl><w:tblPr><w:tblW w:w="9360" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="2800"/><w:gridCol w:w="6560"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="2800" w:type="dxa"/></w:tcPr>'+p('TECHNICAL SKILLS')+'</w:tc><w:tc><w:tcPr><w:tcW w:w="6560" w:type="dxa"/></w:tcPr>'+p('Python, SQL, REST APIs, Git and automated testing.')+'</w:tc></w:tr></w:tbl>':'',tracked?'<w:p><w:ins w:id="1"><w:r><w:t>Unaccepted change</w:t></w:r></w:ins></w:p>':'',extra,'<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1440" w:bottom="1080" w:left="1440" w:header="360" w:footer="360"/></w:sectPr>'].join('')
 const files={
 '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>',
 '_rels/.rels':`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`,
 'word/document.xml':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${body}</w:body></w:document>`,
 'word/styles.xml':`<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="21"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="110" w:line="250" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="38"/><w:color w:val="203D4C"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:spacing w:before="170" w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="22"/><w:color w:val="203D4C"/></w:rPr></w:style></w:styles>`,
 'word/header1.xml':`<w:hdr xmlns:w="${W}">${p('RESUME · ORIGINAL TEMPLATE')}</w:hdr>`,
 'word/_rels/document.xml.rels':`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="${R}/styles" Target="styles.xml"/><Relationship Id="rIdHeader" Type="${R}/header" Target="header1.xml"/></Relationships>`
 }
 return zipSync(Object.fromEntries(Object.entries(files).map(([k,v])=>[k,strToU8(v)])),{level:6})
}
export function scriptedResult({taskId,kind,payload}){
 const units=payload.document.units,unit=units.find(u=>u.text===ORIGINAL_BULLET)
 if(kind==='facts')return {taskId,facts:[{unitId:unit.id,quote:'REST API development',category:'experience'}],protectedIds:[],notes:[]}
 if(kind==='match')return {taskId,roles:payload.targets.map(target=>({target,requirements:['API implementation and testing'],strengths:[{text:'REST API and Python testing experience',evidenceIds:[unit.id]}],gaps:[]}))}
 if(kind==='write')return {taskId,patches:[{id:unit.id,before:unit.text,after:/test|测试/i.test(payload.target)?TEST_BULLET:OPTIMIZED_BULLET,reason:'Direct description of the same work without new qualifications.',evidenceIds:[unit.id]}],notes:[]}
 if(kind==='review')return {taskId,verdict:'pass',issues:[],summary:'Existing project evidence is retained; no additional facts or metrics.'}
 throw Error('Unexpected fixture task')
}
