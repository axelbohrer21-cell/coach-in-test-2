export function solveCourtHomography(points,width=10.97,length=23.77){
  if(!Array.isArray(points)||points.length!==4)throw new Error('Sélectionne les quatre coins du court.');
  const target=[[0,0],[width,0],[width,length],[0,length]],rows=[];
  points.forEach((p,i)=>{const x=p.x,y=p.y,u=target[i][0],v=target[i][1];rows.push([x,y,1,0,0,0,-u*x,-u*y,u]);rows.push([0,0,0,x,y,1,-v*x,-v*y,v]);});
  for(let col=0;col<8;col++){
    let pivot=col;for(let row=col+1;row<8;row++)if(Math.abs(rows[row][col])>Math.abs(rows[pivot][col]))pivot=row;
    if(Math.abs(rows[pivot][col])<1e-10)throw new Error('Les quatre points sont trop alignés pour calibrer le court.');
    [rows[col],rows[pivot]]=[rows[pivot],rows[col]];
    const divisor=rows[col][col];for(let j=col;j<=8;j++)rows[col][j]/=divisor;
    for(let row=0;row<8;row++){if(row===col)continue;const factor=rows[row][col];for(let j=col;j<=8;j++)rows[row][j]-=factor*rows[col][j];}
  }
  return rows.map(row=>row[8]);
}
export function projectCourtPoint(matrix,point){
  const [a,b,c,d,e,f,g,h]=matrix,x=point.x,y=point.y,den=g*x+h*y+1;
  if(Math.abs(den)<1e-8)return null;
  const X=(a*x+b*y+c)/den,Y=(d*x+e*y+f)/den;
  return Number.isFinite(X)&&Number.isFinite(Y)?{x:X,y:Y}:null;
}
export function calibratedFootDistances(frames,matrix){
  return frames.map(frame=>{
    const left=frame.landmarks?.[31],right=frame.landmarks?.[32];
    if(!left||!right||left.visibility<.4||right.visibility<.4)return {timestamp:frame.timestamp,distance_m:null,reason:'Pieds masqués ou insuffisamment visibles'};
    const a=projectCourtPoint(matrix,left),b=projectCourtPoint(matrix,right);
    return {timestamp:frame.timestamp,distance_m:a&&b?Number(Math.hypot(a.x-b.x,a.y-b.y).toFixed(2)):null,left:a,right:b};
  });
}
