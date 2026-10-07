import type {HTMLAttributes} from 'react'
import {useSurfaceMotion} from './surfaceMotion'

export function MotionStrip(props:HTMLAttributes<HTMLDivElement>){
  const root=useSurfaceMotion<HTMLDivElement>('strip')
  return <div {...props} ref={root}/>
}
