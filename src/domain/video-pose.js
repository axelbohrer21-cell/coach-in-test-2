const TASKS_URL='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/vision_bundle.mjs';
const WASM_URL='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm';
const MODEL_URL='https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const CONNECTIONS=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[27,29],[27,31],[28,30],[28,32],[15,17],[15,19],[16,18],[16,20]];
export const calculateAngle2D=(a,b,c)=>{if(!a||!b||!c||[a,b,c].some(p=>(p.visibility??1)<.35))return null;const u=[a.x-b.x,a.y-b.y],v=[c.x-b.x,c.y-b.y],d=Math.hypot(...u)*Math.hypot(...v);if(!d)return null;return Math.round(Math.acos(Math.max(-1,Math.min(1,(u[0]*v[0]+u[1]*v[1])/d)))*180/Math.PI);};
const roundPoint=p=>({x:Number(p.x.toFixed(4)),y:Number(p.y.toFixed(4)),z:Number((p.z||0).toFixed(4)),visibility:Number((p.visibility??p.presence??0).toFixed(3))});
function drawArrow(ctx,x1,y1,x2,y2,color,width=4){
  const dx=x2-x1,dy=y2-y1,length=Math.hypot(dx,dy);if(length<4)return;
  const head=Math.max(8,width*2.4),angle=Math.atan2(dy,dx);
  ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=width;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
  ctx.beginPath();ctx.moveTo(x2,y2);ctx.lineTo(x2-head*Math.cos(angle-Math.PI/6),y2-head*Math.sin(angle-Math.PI/6));ctx.lineTo(x2-head*Math.cos(angle+Math.PI/6),y2-head*Math.sin(angle+Math.PI/6));ctx.closePath();ctx.fill();
}
function drawOverlay(canvas,video,landmarks,previous=null,timestamp=0,angles={}){
  const max=480,scale=Math.min(1,max/Math.max(video.videoWidth,video.videoHeight));
  canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);
  const ctx=canvas.getContext('2d');ctx.drawImage(video,0,0,canvas.width,canvas.height);
  const px=p=>({x:p.x*canvas.width,y:p.y*canvas.height});
  ctx.lineWidth=Math.max(2,canvas.width/260);ctx.strokeStyle='#42e8bd';ctx.fillStyle='#ffcf58';
  for(const [a,b] of CONNECTIONS){const p=landmarks[a],q=landmarks[b];if(p.visibility>.35&&q.visibility>.35){ctx.beginPath();ctx.moveTo(p.x*canvas.width,p.y*canvas.height);ctx.lineTo(q.x*canvas.width,q.y*canvas.height);ctx.stroke();}}
  for(const p of landmarks){if(p.visibility>.35){ctx.beginPath();ctx.arc(p.x*canvas.width,p.y*canvas.height,Math.max(4,canvas.width/145),0,Math.PI*2);ctx.fill();ctx.strokeStyle='#071326';ctx.lineWidth=1.5;ctx.stroke();ctx.strokeStyle='#42e8bd';ctx.lineWidth=Math.max(2,canvas.width/260);}}
  // Flèches cyan : orientation/placement de chaque pied (cheville vers pointe du pied).
  [[27,31],[28,32]].forEach(([ankle,toe])=>{if(landmarks[ankle].visibility>.35&&landmarks[toe].visibility>.35){const a=px(landmarks[ankle]),b=px(landmarks[toe]);drawArrow(ctx,a.x,a.y,b.x,b.y,'#39c9ff',Math.max(2,canvas.width/300));}});
  // Flèches orange : déplacement observé des chevilles entre deux images échantillonnées.
  if(previous){[[27,27],[28,28]].forEach(([oldIndex,newIndex])=>{const a=previous[oldIndex],b=landmarks[newIndex];if(a.visibility>.45&&b.visibility>.45){const start=px(a),end=px(b);if(Math.hypot(end.x-start.x,end.y-start.y)>canvas.width*.012)drawArrow(ctx,start.x,start.y,end.x,end.y,'#ff9b42',Math.max(3,canvas.width/240));}});}
  const labels=[['bras-tronc G',angles.left_arm_torso],['bras-tronc D',angles.right_arm_torso],['coude G',angles.left_elbow],['coude D',angles.right_elbow],['écartement jambes',angles.leg_spread]];
  ctx.fillStyle='rgba(4,15,28,.86)';ctx.fillRect(8,8,Math.min(canvas.width-16,Math.max(230,canvas.width*.43)),Math.min(canvas.height-16,26+labels.length*17));
  ctx.fillStyle='#fff';ctx.font='bold 12px system-ui';ctx.fillText('Coach In · '+timestamp.toFixed(2)+' s',16,25);
  ctx.font='11px system-ui';labels.forEach((item,index)=>{ctx.fillStyle=index<2?'#a9f1ff':'#fff';ctx.fillText(item[0]+ ' : '+(item[1]===null||item[1]===undefined?'—':item[1]+'°'),16,43+index*15);});
  return canvas.toDataURL('image/jpeg',.42);
}
export async function analyzeVideoPose(file){
  let landmarker,video,objectUrl;
  try{
    const mp=await import(TASKS_URL);
    const vision=await mp.FilesetResolver.forVisionTasks(WASM_URL);
    const options={runningMode:'VIDEO',numPoses:1,minPoseDetectionConfidence:.45,minPosePresenceConfidence:.45,minTrackingConfidence:.45};
    try{landmarker=await mp.PoseLandmarker.createFromOptions(vision,{...options,baseOptions:{modelAssetPath:MODEL_URL,delegate:'GPU'}});}
    catch(_){landmarker=await mp.PoseLandmarker.createFromOptions(vision,{...options,baseOptions:{modelAssetPath:MODEL_URL,delegate:'CPU'}});}
    video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='auto';objectUrl=URL.createObjectURL(file);
    await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=()=>reject(new Error('Vidéo illisible pour la détection de pose.'));video.src=objectUrl;});
    const duration=Math.min(Number(video.duration)||0,600);if(!duration)throw new Error('Durée vidéo indisponible.');
    const frames=[],canvas=document.createElement('canvas');let overlay=null,bestVisibility=0,lastTimestamp=0;
    for(let i=0;i<8;i++){
      const seconds=duration*(i+.5)/8;
      await new Promise((resolve,reject)=>{video.onseeked=resolve;video.onerror=()=>reject(new Error('Impossible de parcourir la vidéo pour la détection de pose.'));video.currentTime=seconds;});
      const result=landmarker.detectForVideo(video,Math.max(lastTimestamp+1,Math.round(seconds*1000)));lastTimestamp=Math.max(lastTimestamp+1,Math.round(seconds*1000));
      const points=result.landmarks?.[0];if(!points)continue;
      const landmarks=points.map(roundPoint),visible=landmarks.filter(p=>p.visibility>.5).length/landmarks.length;
      const leftKnee=calculateAngle2D(landmarks[23],landmarks[25],landmarks[27]),rightKnee=calculateAngle2D(landmarks[24],landmarks[26],landmarks[28]);
      const leftElbow=calculateAngle2D(landmarks[11],landmarks[13],landmarks[15]),rightElbow=calculateAngle2D(landmarks[12],landmarks[14],landmarks[16]);
      const leftHip=calculateAngle2D(landmarks[11],landmarks[23],landmarks[25]),rightHip=calculateAngle2D(landmarks[12],landmarks[24],landmarks[26]);
      // Angle bras-tronc au niveau de l'épaule et ouverture des jambes depuis le bassin.
      const leftArmTorso=calculateAngle2D(landmarks[23],landmarks[11],landmarks[13]),rightArmTorso=calculateAngle2D(landmarks[24],landmarks[12],landmarks[14]);
      const hipCenter={x:(landmarks[23].x+landmarks[24].x)/2,y:(landmarks[23].y+landmarks[24].y)/2};
      const legSpread=calculateAngle2D(landmarks[27],{...hipCenter,visibility:Math.min(landmarks[23].visibility,landmarks[24].visibility)},landmarks[28]);
      const footSpacing=Number(Math.abs(landmarks[27].x-landmarks[28].x).toFixed(3));
      const jointAngles={left_knee:leftKnee,right_knee:rightKnee,left_elbow:leftElbow,right_elbow:rightElbow,left_hip:leftHip,right_hip:rightHip,left_arm_torso:leftArmTorso,right_arm_torso:rightArmTorso,leg_spread:legSpread};
      const previous=frames.length?frames[frames.length-1].landmarks:null;
      const frameOverlay=visible>.35?drawOverlay(canvas,video,landmarks,previous,seconds,jointAngles):null;
      frames.push({timestamp:Number(seconds.toFixed(2)),visibility:Number(visible.toFixed(2)),landmarks,joint_angles:jointAngles,foot_spacing_image_ratio:footSpacing,overlay_data_url:frameOverlay});
      if(visible>bestVisibility&&visible>.48){bestVisibility=visible;overlay=frameOverlay;}
    }
    if(!frames.length)return {available:false,reason:'Aucune silhouette complète détectée de façon exploitable.'};
    return {available:true,model:'MediaPipe Pose Landmarker Lite',frames,overlay_data_url:overlay,summary:{frames_detected:frames.length,mean_visibility:Number((frames.reduce((s,f)=>s+f.visibility,0)/frames.length).toFixed(2)),best_frame_timestamp:frames.reduce((best,f)=>f.visibility>best.visibility?f:best,frames[0]).timestamp,measurements_note:'Angles bras-tronc, coude et ouverture des jambes estimés en 2D image. Flèches cyan : orientation des pieds ; flèches orange : déplacement apparent des chevilles entre images, indicateur de mouvement et non mesure de force.'}};
  }catch(error){return {available:false,reason:error?.message||'Détection de pose indisponible.'};}
  finally{try{landmarker?.close();}catch{}if(objectUrl)URL.revokeObjectURL(objectUrl);if(video){video.removeAttribute('src');video.load();}}
}
