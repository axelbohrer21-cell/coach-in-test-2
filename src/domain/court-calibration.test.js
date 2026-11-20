import test from 'node:test';
import assert from 'node:assert/strict';
import { solveCourtHomography, projectCourtPoint } from './court-calibration.js';

test('calibrates a rectangular court from its four corners',()=>{
  const points=[{x:.1,y:.1},{x:.9,y:.1},{x:.9,y:.9},{x:.1,y:.9}];
  const matrix=solveCourtHomography(points);
  const expected=[[0,0],[10.97,0],[10.97,23.77],[0,23.77]];
  points.forEach((point,index)=>{
    const mapped=projectCourtPoint(matrix,point);
    assert.ok(Math.abs(mapped.x-expected[index][0])<1e-6);
    assert.ok(Math.abs(mapped.y-expected[index][1])<1e-6);
  });
});
test('rejects degenerate court calibration points',()=>{
  assert.throws(()=>solveCourtHomography([{x:0,y:0},{x:.5,y:0},{x:1,y:0},{x:1.5,y:0}]),/alignés/);
});
