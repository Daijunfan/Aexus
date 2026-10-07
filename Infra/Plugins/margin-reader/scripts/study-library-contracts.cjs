'use strict';
exports.register=({command,str,num,opt})=>{
 const revision=num('Current study-library revision from study.library.get; independent of card edits.',true,{integer:true,minimum:0});
 const folderId=str('Study-folder UUID; null means the study library root.',false,{nullable:true});
 command('study.library.get','Read all study-folder metadata and study summaries. Does not write defaults or read document bytes.',false);
 command('study.folder.create','Create a named study folder without moving or duplicating any original documents.',true,{expectedRevision:revision,title:str('Folder name, 1–100 characters.',true),parentId:folderId});
 command('study.folder.update','Rename or move a study folder; reject duplicate names, cycles and hierarchy depth above 64.',true,{expectedRevision:revision,folderId:str('Existing study-folder UUID.',true),title:str('New name.'),parentId:folderId});
 command('study.folder.remove','Move an empty study folder to recoverable folder trash. Move its studies and child folders first.',true,{expectedRevision:revision,folderId:str('Existing empty study-folder UUID.',true)});
 command('study.folder.restore','Restore a removed study folder, optionally choosing a new valid parent or name.',true,{expectedRevision:revision,folderId:str('Deleted study-folder UUID.',true),parentId:folderId,title:str('Optional new name if the original name is occupied.')});
 command('study.library.move','Move 1–500 study sets to a study folder or the root atomically; preserve set/card IDs, histories and original files.',true,{expectedRevision:revision,setIds:opt('array','Study set UUIDs.',true),folderId:{...folderId,required:true}});
};
