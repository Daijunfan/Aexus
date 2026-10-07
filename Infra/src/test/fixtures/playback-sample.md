# Original media fixture

`playback-sample.webm` is a silent, 8-second, 640×360 VP9 clip generated from original
colored rectangles and a slow zoom. It contains no user media, microphone/camera input,
vendor artwork or executable code. Tests copy this versioned fixture so FFmpeg is not
a runtime or test-machine dependency. Silent PCM WAV data is generated directly in Node.

Generation command (FFmpeg CLI):

```sh
ffmpeg -f lavfi -i 'color=c=0xdde9e3:s=640x360:r=12' -vf 'drawbox=x=55:y=42:w=530:h=276:color=0xffffff@0.65:t=fill,drawbox=x=95:y=90:w=120:h=170:color=0x789d89:t=fill,drawbox=x=238:y=90:w=120:h=170:color=0xadbca3:t=fill,drawbox=x=381:y=90:w=120:h=170:color=0xc9b9a2:t=fill,zoompan=z=1+0.0015*on:x=iw/2-iw/zoom/2:y=ih/2-ih/zoom/2:d=1:s=640x360:fps=12' -t 8 -c:v libvpx-vp9 -b:v 180k -an playback-sample.webm
```

Additional original compatibility fixtures use the same geometry encoded as H264/MP4,
and generated silence encoded as MP3 and AAC/M4A. They are 8-second decoder fixtures,
not recordings of a person or device. No FFmpeg runtime is bundled with the app.
