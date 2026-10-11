'use strict';
const {execFileSync}=require('node:child_process'),path=require('node:path'),AV=require('../lib/av-document.cjs');
exports.make=directory=>{
 execFileSync(AV.binary('ffmpeg'),['-v','error','-f','lavfi','-i','testsrc2=s=160x90:r=10','-t','4','-c:v','libvpx','-threads','1',path.join(directory,'lesson.webm')]);
 execFileSync(AV.binary('ffmpeg'),['-v','error','-f','lavfi','-i','sine=frequency=440:duration=4',path.join(directory,'lesson.wav')]);
};
