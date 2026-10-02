import type {officeConnectionPlan} from '../../../shared/office-connections'
type Plan=ReturnType<typeof officeConnectionPlan>
// View switches remount the canvas. Reuse only exact geometry/edge/anchor keys;
// current activity is applied by the caller. Bound memory across edited scenes.
const plans=new Map<string,Plan>()
export function cachedConnectionPlan(key:string,compute:()=>Plan):Plan{
  const existing=plans.get(key)
  if(existing){plans.delete(key);plans.set(key,existing);return existing}
  const plan=compute();plans.set(key,plan)
  if(plans.size>8)plans.delete(plans.keys().next().value!)
  return plan
}
