import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateAngle2D } from './video-pose.js';

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
