const fs = require('node:fs'), path = require('node:path');

// xterm 6.0.0: #5887 (input before keydown 229), #5374 (held modifiers).
// Patch the pinned dependency at build time; keep one native onData path.
module.exports = {
  name: 'xterm-ime',
  setup(build) {
    build.onLoad({filter: /node_modules\/\@xterm\/xterm\/lib\/xterm\.mjs$/}, args => {
      let contents = fs.readFileSync(args.path, 'utf8');
      const edits = [
        // WebKit may deliver insertText without keypress. Only suppress text
        // when keydown/keypress actually submitted it, not merely saw a key.
        ['this._onKey.fire({key:r.key,domEvent:e}),this._showCursor(),this.coreService.triggerDataEvent(r.key,!0)', 'this._keyDownHandled=!0,this._onKey.fire({key:r.key,domEvent:e}),this._showCursor(),this.coreService.triggerDataEvent(r.key,!0)'],
        ['(!e.composed||!this._keyDownSeen)', '(!this._keyDownSeen||!this._keyDownHandled)'],
        ['this._keyDownHandled=!1,this._keyDownSeen=!0,', 'this._keyDownHandled=!1,this._keyPressHandled=!1,this._keyDownSeen=e.keyCode!==229&&![16,17,18,20,91,92,93].includes(e.keyCode),'],
        ['this._dataAlreadySent=""}get isComposing()', 'this._dataAlreadySent="",this._textInputVersion=0}get isComposing()'],
        ['_handleAnyTextareaChanges(){let t=this._textarea.value;setTimeout(()=>{if(!this._isComposing)', '_handleAnyTextareaChanges(){let t=this._textarea.value,handledInputVersion=this._textInputVersion;setTimeout(()=>{if(!this._isComposing&&handledInputVersion===this._textInputVersion)'],
        ['_inputEvent(e){if(e.data&&e.inputType==="insertText"', '_inputEvent(e){if(!e.isComposing&&!this._compositionHelper.isComposing&&!this._compositionHelper._isSendingComposition&&e.data&&e.inputType==="insertText"'],
        ['let i=e.data;return this.coreService.triggerDataEvent(i,!0)', 'let i=e.data;return this._compositionHelper._textInputVersion++,this.coreService.triggerDataEvent(i,!0)']
      ];
      for (const [before, after] of edits) {
        if (contents.split(before).length !== 2) throw Error('xterm 6.0.0 IME patch no longer matches: '+before);
        contents = contents.replace(before, after);
      }
      return {contents, loader:'js', resolveDir:path.dirname(args.path)};
    });
  }
};
