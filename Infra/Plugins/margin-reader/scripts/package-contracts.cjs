'use strict';
exports.register = ({command,str,num,opt}) => {
  const setId=str('Study UUID in the authorized workspace.',true);
  const path=str('Relative package path inside the authorized workspace.',true);
  const password=str('Optional local package passphrase; never stored in library settings.');
  command('study.package.export','Export a complete portable .mrpkg ZIP with original documents, images, audio, histories and related study sets. Optional passphrase uses local authenticated encryption.',true,{
    setId,path,password,expectedRevision:num('Optional latest study revision guard.',false,{integer:true,minimum:1}),
    includeDependencies:opt('boolean','Include linked/reference studies and dictionaries; default true.'),
    includeDocuments:opt('boolean','Include original files and self-contained reading views; default true.')
  });
  command('study.package.inspect','Validate a package and all content hashes, then list studies, documents and warnings without modifying library state.',false,{path,password});
  command('study.package.import','Import a verified package into a NEW folder with remapped identities. Preserve histories, media and internal links; never overwrite existing content.',true,{
    path,password,folder:str('New relative folder for restored original files. Must not exist.',true),
    title:str('Optional new title for the primary imported study.'),activate:opt('boolean','Open the imported study; default true.')
  });
};
