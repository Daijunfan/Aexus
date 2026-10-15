export async function readyEmployee(cli,id){
 const deadline=Date.now()+20000
 while(Date.now()<deadline){
  const [state]=await cli('session','status','--employee',id)
  if(state.initialization?.status==='failed')throw Error(state.initialization.error)
  if(state.initialization?.status==='ready')return state
  await new Promise(resolve=>setTimeout(resolve,40))
 }
 throw Error('Employee did not finish real initialization: '+id)
}
