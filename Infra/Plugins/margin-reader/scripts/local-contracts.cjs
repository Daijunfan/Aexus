"use strict";
exports.register = ({ command, str, num, opt, obj }) => {
  const setId = str('Study-set UUID in this workspace.', true);
  const cardId = str('Active card UUID in the study set.', true);
  const expectedRevision = num('Latest study revision; stale edits fail with CONFLICT.', true, { integer: true, minimum: 1 });
  command('study.card.activate', 'Select a card and follow the configured document/mind-map linkage, with exact source positioning.', true, {
    setId, cardId, origin: str('Interaction origin; default map.', false, { enum: ['map', 'document'] }),
    force: opt('boolean', 'Explicit source action ignores the automatic linkage preference.')
  });
  command('study.navigation.set', 'Configure one-way, two-way or disabled automatic card/document linkage.', true, {
    setId, expectedRevision, mode: str('Automatic linkage; default both.', true, { enum: ['both', 'map-to-document', 'document-to-map', 'off'] })
  });
  command('study.annotation.update', 'Hide/restore an excerpt highlight without deleting the card, or change its annotation style. Undoable.', true, {
    setId, expectedRevision, cardId, visible: opt('boolean', 'False cancels only the document annotation; true restores it.'),
    style: str('Document annotation appearance.', false, { enum: ['highlight', 'underline', 'strike', 'box'] })
  });
  command('study.document.ensure', 'Get/create the document-only note collection idempotently; a user need not manually create a study set.', true, {
    id: str('Registered document UUID.', true), activate: opt('boolean', 'Activate the document notes; default true.')
  });

  const cardIds=opt('array','1–10000 stable card IDs; bounded by study capacity.',true);
  const styles=['tree0','tree1','tree2','tree3','tree4','line0','line1','line2','both','frame'];
  command('study.cards.batch','Atomically edit selected cards and optional descendants; preserve originals and images.',true,{setId,expectedRevision,cardIds,descendants:opt('boolean','Apply to complete subtrees.'),patch:obj('color,tags,addTags,removeTags,favorite,collapsed,inMap,annotationVisible,editedText (one card),style.',true)});
  command('study.cards.copy','Copy cards/subtrees with independent IDs and durable images within authorized study sets.',true,{setId,expectedRevision,cardIds,descendants:opt('boolean','Include descendants; default true.'),targetSetId:str('Destination set UUID; default this set.'),targetRevision:num('Required for another destination set.',false,{integer:true,minimum:1}),parentId:str('Destination parent UUID.'),keepSchedule:opt('boolean','Copy FSRS schedule/logs; default false.')});
  command('study.cards.organize','Build/reuse document or original-outline branches; file selected excerpts by source chapter.',true,{setId,expectedRevision,cardIds,by:str('Grouping mode.',true,{enum:['document','toc']})});
  command('study.card.position','Save free world position of a root card or direct submap child.',true,{setId,expectedRevision,cardId,x:num('World x.',true,{minimum:-1000000000,maximum:1000000000}),y:num('World y.',true,{minimum:-1000000000,maximum:1000000000}),reset:opt('boolean','Return to automatic layout.')});
  command('study.cards.sort','Reorder siblings by metadata without changing parent relationships.',true,{setId,expectedRevision,parentId:str('Parent UUID; omitted means roots.'),by:str('Sort criterion.',true,{enum:['title','created','updated','color','source']}),direction:str('Default asc.',false,{enum:['asc','desc']})});
  command('study.submap.configure','Create/dissolve a submap boundary, rename or enter it; preserve card IDs and sources.',true,{setId,expectedRevision,cardId,enabled:opt('boolean','True creates a submap; false restores the branch.'),title:str('New title.'),open:opt('boolean','Enter the submap.')});
  command('study.submap.open','Switch current submap; null returns to main map.',true,{setId,expectedRevision,cardId:str('Submap root UUID or null.',true,{nullable:true})});
  command('study.summary.create','Create a cross-branch summary linked to selected cards without reparenting them.',true,{setId,expectedRevision,cardIds,title:str('Summary title.',true),text:str('Summary body, up to 20000 characters.')});
  command('study.card.split','Split text into child notes at UTF-16 offsets; preserve original excerpt/image.',true,{setId,expectedRevision,cardId,offsets:opt('array','1–100 text offsets within the card body.',true)});
  command('study.board.query','Query cards with compound filters, two-level grouping, sorting and pagination.',false,{setId,boardId:str('Saved board UUID.'),filter:obj('query,titleKeyword (exact semicolon alias; case-insensitive),tags/tagMode,colors,documentIds,kind,inMap,favorite,reviewEnabled,hasImage,createdAfter/Before; compound all/any/not.'),groupBy:opt('array','Up to two: color,tag,keyword,document,chapter,created,updated,kind,inMap.'),sort:str('outline,title,created,updated,color,source.'),direction:str('Default asc.',false,{enum:['asc','desc']}),limit:num('Page size, default 200.',false,{integer:true,minimum:1,maximum:500}),offset:num('Zero-based offset.',false,{integer:true,minimum:0})});
  command('study.board.save','Create/update a named durable smart card board.',true,{setId,expectedRevision,boardId:str('Existing board UUID; omit to create.'),title:str('Board title.',true),filter:obj('Same filter as study.board.query.'),groupBy:opt('array','Up to two grouping fields.'),sort:str('Sort criterion.')});
  command('study.board.remove','Remove a board definition without removing cards; undoable.',true,{setId,expectedRevision,boardId:str('Board UUID.',true)});
  command('study.board.materialize','Create a grouped map from current board results using linked reference cards.',true,{setId,expectedRevision,boardId:str('Board UUID.',true),title:str('Branch title.')});
  command('study.capture.settings','Configure excerpt automation: map assignment, tags/color, destination, style and review enrollment.',true,{setId,expectedRevision,tags:opt('array','Default tags.'),color:str('Palette name or #RRGGBB.'),inMap:opt('boolean','Add excerpts to the map.'),parentId:str('Default parent UUID or null.',false,{nullable:true}),organize:str('Automatic grouping.',false,{enum:['none','document','toc']}),review:opt('boolean','Enroll new excerpts in review.'),deckId:str('Deck UUID or null.',false,{nullable:true}),annotationStyle:str('Annotation style.',false,{enum:['highlight','underline','strike','box']})});
  command('study.appearance.set','Configure study map/card appearance without altering content.',true,{setId,expectedRevision,branchStyle:str('Branch arrangement.',false,{enum:styles}),cardStyle:obj('fontFamily(system/serif/mono or an installed local font family),fontSize(10–36),bold,background(#RRGGBB),width(160–800),height(100–1000),fontScale(.5–2),titleOnly,uppercase,showLinks,compact.'),inkBehind:opt('boolean','Place canvas handwriting behind cards.'),background:str('Map background #RRGGBB.'),paper:str('Map paper pattern.',false,{enum:['dots','grid','plain','lined']})});
};
