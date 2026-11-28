import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateAngle2D, scaledVideoDimensions } from './video-pose.js';

test('calculateAngle2D returns a right angle for perpendicular segments',()=>{
  const point=(x,y)=>({x,y,visibility:1});
  assert.equal(calculateAngle2D(point(0,0),point(1,0),point(1,1)),90);
});
test('calculateAngle2D returns null when a required landmark is not visible',()=>{
  const point=(x,y,visibility=1)=>({x,y,visibility});
  assert.equal(calculateAngle2D(point(0,0),point(1,0,.1),point(1,1)),null);
});
test('calculateAngle2D returns null for a zero-length segment',()=>{
  const point=(x,y)=>({x,y,visibility:1});
  assert.equal(calculateAngle2D(point(1,1),point(1,1),point(2,2)),null);
});

test('scaledVideoDimensions preserves aspect ratio and caps landscape width',()=>{
  assert.deepEqual(scaledVideoDimensions(1920,1080),{width:720,height:405});
});
test('scaledVideoDimensions caps portrait height without changing orientation',()=>{
  assert.deepEqual(scaledVideoDimensions(1080,1920),{width:405,height:720});
});
test('scaledVideoDimensions never enlarges small video',()=>{
  assert.deepEqual(scaledVideoDimensions(640,360),{width:640,height:360});
});
test('scaledVideoDimensions rejects invalid dimensions',()=>{
  assert.deepEqual(scaledVideoDimensions(0,1080),{width:0,height:0});
});
