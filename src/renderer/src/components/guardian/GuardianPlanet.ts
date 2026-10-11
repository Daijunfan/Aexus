import land from '../../assets/guardian/land.json'

// A self-contained, offline WebGL surface. Natural Earth is geographic context,
// while lighting and the graticule are illustrative, never live satellite data.
const vertex = [
  '#version 300 es',
  'in vec2 position;',
  'void main() { gl_Position = vec4(position, 0.0, 1.0); }'
].join('\n')
const fragment = [
  '#version 300 es',
  'precision highp float;',
  'uniform vec2 center;',
  'uniform float radius;',
  'uniform vec2 camera;',
  'uniform sampler2D geography;',
  'out vec4 pixel;',
  'const float PI = 3.141592653589793;',
  'void main() {',
  '  vec2 screen = (gl_FragCoord.xy - center) / radius;',
  '  float distanceFromCenter = length(screen);',
  '  if (distanceFromCenter > 1.16) discard;',
  '  if (distanceFromCenter > 1.0) {',
  '    float haze = exp(-pow((distanceFromCenter - 1.0) * 16.0, 2.0));',
  '    pixel = vec4(0.12, 0.53, 0.68, haze * 0.25);',
  '    return;',
  '  }',
  '  vec3 normal = vec3(screen, sqrt(max(0.0, 1.0 - dot(screen, screen))));',
  '  float cosine = cos(camera.x), sine = sin(camera.x);',
  '  float cosPitch = cos(camera.y), sinPitch = sin(camera.y);',
  '  float vertical = normal.y * cosPitch + normal.z * sinPitch;',
  '  float depth = -normal.y * sinPitch + normal.z * cosPitch;',
  '  float east = normal.x * cosine - depth * sine;',
  '  float north = normal.x * sine + depth * cosine;',
  '  float longitude = atan(east, north);',
  '  float latitude = asin(clamp(vertical, -1.0, 1.0));',
  '  vec2 uv = vec2(longitude / (2.0 * PI) + 0.5, latitude / PI + 0.5);',
  '  float landMask = texture(geography, uv).r;',
  '  vec3 light = normalize(vec3(-0.55, 0.78, 0.95));',
  '  float illumination = smoothstep(-0.45, 0.85, dot(normal, light));',
  '  vec3 ocean = mix(vec3(0.035, 0.12, 0.22), vec3(0.16, 0.46, 0.57), illumination);',
  '  vec3 ground = mix(vec3(0.07, 0.28, 0.34), vec3(0.42, 0.75, 0.62), illumination);',
  '  vec3 color = mix(ocean, ground, landMask);',
  '  float longitudeLine = abs(sin(longitude * 6.0));',
  '  float latitudeLine = abs(sin(latitude * 6.0));',
  '  float grid = max(1.0 - smoothstep(0.0, fwidth(longitudeLine) * 1.5, longitudeLine),',
  '                   1.0 - smoothstep(0.0, fwidth(latitudeLine) * 1.5, latitudeLine));',
  '  color += vec3(0.22, 0.66, 0.70) * grid * (1.0 - landMask) * 0.15;',
  '  float coast = max(abs(landMask - texture(geography, uv + vec2(0.0006, 0.0)).r),',
  '                    abs(landMask - texture(geography, uv + vec2(0.0, 0.0012)).r));',
  '  color += vec3(0.28, 0.68, 0.54) * coast * 0.28;',
  '  float reflected = pow(max(dot(reflect(-light, normal), vec3(0.0, 0.0, 1.0)), 0.0), 29.0);',
  '  color += vec3(0.24, 0.52, 0.61) * reflected * (1.0 - landMask) * 0.48;',
  '  float rim = pow(1.0 - normal.z, 3.2);',
  '  color += vec3(0.20, 0.65, 0.77) * rim * 0.50;',
  '  pixel = vec4(color, 1.0);',
  '}'
].join('\n')

function geographyTexture() {
  const texture = document.createElement('canvas')
  texture.width = 2048
  texture.height = 1024
  const context = texture.getContext('2d')!
  context.fillStyle = '#000'
  context.fillRect(0, 0, texture.width, texture.height)
  context.fillStyle = '#fff'
  for (const feature of land.features) {
    for (const ring of feature.geometry.coordinates) {
      let previous = ring[0][0]
      const positions = ring.map(([longitude, latitude]) => {
        while (longitude - previous > 180) longitude -= 360
        while (longitude - previous < -180) longitude += 360
        previous = longitude
        return [(longitude + 180) / 360 * texture.width, (90 - latitude) / 180 * texture.height]
      })
      for (const shift of [-texture.width, 0, texture.width]) {
        context.beginPath()
        positions.forEach(([x, y], index) => index
          ? context.lineTo(x + shift, y)
          : context.moveTo(x + shift, y))
        context.closePath()
        context.fill()
      }
    }
  }
  return texture
}

export function createPlanetRenderer(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl2', {alpha: true, antialias: true, preserveDrawingBuffer: true})
  if (!gl) return null
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)
    if (!shader) return null
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader)
      return null
    }
    return shader
  }
  const vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment)
  if (!vs || !fs) return null
  const program = gl.createProgram()
  if (!program) return null
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program)
    return null
  }
  const buffer = gl.createBuffer(), surface = gl.createTexture()
  if (!buffer || !surface) return null
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  gl.useProgram(program)
  const attribute = gl.getAttribLocation(program, 'position')
  gl.enableVertexAttribArray(attribute)
  gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, surface)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, geographyTexture())
  gl.uniform1i(gl.getUniformLocation(program, 'geography'), 0)
  const center=gl.getUniformLocation(program,'center'),sphereRadius=gl.getUniformLocation(program,'radius'),camera=gl.getUniformLocation(program,'camera')
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

  return {
    draw(width: number, height: number, pixelRatio: number, cx: number, cy: number, radius: number, longitude: number, latitude: number) {
      if (gl.isContextLost()) return false
      if (canvas.width !== Math.round(width * pixelRatio) || canvas.height !== Math.round(height * pixelRatio)) {
        canvas.width = Math.round(width * pixelRatio)
        canvas.height = Math.round(height * pixelRatio)
      }
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.uniform2f(center, cx * pixelRatio, (height - cy) * pixelRatio)
      gl.uniform1f(sphereRadius, radius * pixelRatio)
      gl.uniform2f(camera, -longitude * Math.PI / 180, latitude * Math.PI / 180)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      return true
    },
    destroy() {
      gl.deleteTexture(surface)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
    }
  }
}
