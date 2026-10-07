import type {ContractClient} from '../../Contract/protocol'
import type {Deck} from './types'
export function prepareRevision(client:ContractClient,id:string,options?:{brief?:string;deck?:Deck}):Promise<Record<string,unknown>>
