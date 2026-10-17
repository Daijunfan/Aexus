import type {Point} from '../../../shared/canvas'

// WKWebView's getScreenCTM omits the canvas ancestor's CSS transform.
// These SVG viewports only translate/scale. WebKit also reports DOM bounds
// before root CSS zoom, unlike clientX/Y; normalize that page scale first.
export function svgCoordinates(svg:SVGSVGElement,clientX:number,clientY:number):Point{
 const rect=svg.getBoundingClientRect(),box=svg.viewBox.baseVal
 const pageScale=window.innerWidth/document.documentElement.getBoundingClientRect().width
 return {x:box.x+(clientX/pageScale-rect.left)*(box.width||svg.width.baseVal.value)/rect.width,
   y:box.y+(clientY/pageScale-rect.top)*(box.height||svg.height.baseVal.value)/rect.height}
}
