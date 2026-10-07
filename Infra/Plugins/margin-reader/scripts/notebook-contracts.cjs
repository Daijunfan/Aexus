"use strict";
exports.register=({command,str,num,opt,obj})=>{
 const setId=str('Study UUID.',true),documentId=str('Member document UUID.',true),expectedRevision=num('Current study revision.',true,{integer:true,minimum:1}),notebookId=str('Notebook UUID or default.',true);
 command('study.notebook.list','List independent annotation notebooks for one document, separately from handwriting layers.',false,{setId,documentId,includeDeleted:opt('boolean','Include recoverable archived notebooks.')});
 command('study.notebook.create','Create a document annotation notebook; optionally copy notes and ink without copying the original document.',true,{setId,documentId,expectedRevision,title:str('Notebook title.',true),copyFrom:str('Existing notebook UUID or default to duplicate.')});
 command('study.notebook.update','Rename, show/hide, lock/unlock or recoverably archive/restore a document notebook.',true,{setId,documentId,expectedRevision,notebookId,title:str('New title.'),visible:opt('boolean','Overlay this notebook in the document.'),locked:opt('boolean','Prevent note, annotation and document-ink edits.'),deleted:opt('boolean','Recoverable archive or restore.')});
 command('study.notebook.select','Choose the notebook that receives new excerpts, placed notes and document strokes; optionally show/hide other notebooks.',true,{setId,documentId,expectedRevision,notebookId,showOthers:opt('boolean','Whether other active notebooks remain visible.')});
 command('study.notebook.assign','Move selected document notes into another notebook without changing card IDs or source geometry.',true,{setId,documentId,expectedRevision,notebookId,cardIds:opt('array','1–10000 card IDs referring to this document.',true),descendants:opt('boolean','Include note subtrees.')});
};
