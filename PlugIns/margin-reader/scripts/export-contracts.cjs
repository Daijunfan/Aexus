'use strict';
exports.register=({command,str,num,opt,obj})=>{
  command('study.export.file','Export a study, selected cards or branch to offline HTML, Markdown, OPML, Word, Anki deck or printable mind-map PDF. Media remain local; destinations are never overwritten.',true,{
    setId:str('Study UUID.',true),path:str('New relative export filename matching format.',true),
    format:str('Interoperable output format.',true,{enum:['html','md','opml','docx','apkg','pdf']}),
    expectedRevision:num('Optional latest study revision guard.',false,{integer:true,minimum:1}),
    rootId:str('Optional subtree root card.'),cardIds:opt('array','Optional selection, at most 2000 IDs.'),filter:obj('Optional study.board.query filter.'),
    includeImages:opt('boolean','Include source images and media; default true.'),reviewOnly:opt('boolean','Export only enabled review cards.'),
    expanded:opt('boolean','Expand collapsed branches in the exported map.'),poster:opt('boolean','One large map page; default is tiled landscape A3 sheets.'),deckName:str('Optional Anki deck name.')
  });
  command('document.pdf.export','Create a new PDF with visible excerpt marks and handwriting flattened onto the original pages, preserving original selectable text. Extended notes are appended as readable note pages.',true,{
    id:str('Document UUID.',true),expectedSourceVersion:str('Current sourceVersion.',true),path:str('New relative .pdf filename.',true),
    setIds:opt('array','Annotation study UUIDs, at most 64; default all member studies in this workspace.'),pages:opt('array','Optional ordered page numbers, at most 2000.'),
    omitFolded:opt('boolean','Exclude completely folded pages.'),includeNotes:opt('boolean','Append anchored note text; default true.'),password:str('Optional PDF password, never persisted.')
  });
};
