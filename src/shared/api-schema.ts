/** Shared schema shapes. Explicit field constraints stay at the command declaration. */
export const textSchema={type:'string'}
export const nonemptySchema={type:'string',minLength:1}
export const booleanSchema={type:'boolean'}
export function objectSchema<P extends Record<string,unknown>>(properties:P,required?:string[]){
  return {type:'object',additionalProperties:false,properties,...(required===undefined?{}:{required})}
}
