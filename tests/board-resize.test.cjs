const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')

const resize=import('data:text/javascript;base64,'+fs.readFileSync(require.resolve('../ui/board-resize.js')).toString('base64'))

test('vertical board drag snaps to 10px and keeps a constant starting height',async()=>{
  const {dragRowHeight}=await resize
  assert.equal(dragRowHeight(350,0),350)
  assert.equal(dragRowHeight(350,104),450)
  assert.equal(dragRowHeight(350,-47),300)
  assert.equal(dragRowHeight(350,7),360)
  assert.equal(dragRowHeight(350,-3),350)
})

test('board height respects 240–1000 px boundaries',async()=>{
  const {dragRowHeight,MIN_ROW_HEIGHT,MAX_ROW_HEIGHT}=await resize
  assert.equal(dragRowHeight(300,-900),MIN_ROW_HEIGHT)
  assert.equal(dragRowHeight(950,900),MAX_ROW_HEIGHT)
  assert.equal(dragRowHeight(240,-10),240)
  assert.equal(dragRowHeight(1000,10),1000)
})

test('keyboard resizing works in either direction without changing width',async()=>{
  const {keyRowHeight}=await resize
  assert.equal(keyRowHeight(350,'ArrowUp'),340)
  assert.equal(keyRowHeight(350,'ArrowDown'),360)
  assert.equal(keyRowHeight(350,'ArrowUp',50),300)
  assert.equal(keyRowHeight(350,'ArrowDown',50),400)
  assert.equal(keyRowHeight(350,'Home'),240)
  assert.equal(keyRowHeight(350,'End'),1000)
  assert.equal(keyRowHeight(350,'ArrowLeft'),null)
  assert.equal(keyRowHeight(350,'ArrowRight'),null)
})
