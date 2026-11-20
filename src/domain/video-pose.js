const TASKS_URL='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/vision_bundle.mjs';
const WASM_URL='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm';
const MODEL_URL='https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const CONNECTIONS=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[27,29],[27,31],[28,30],[28,32],[15,17],[15,19],[16,18],[16,20]];
const angle=(a,b,c)=>{if(!a||!b||!c)return null;const u=[a.x-b.x,a.y-b.y],v=[c.x-b.x,c.y-b.y],d=Math.hypot(...u)*Math.hypot(...v);if(!d)return null;return Math.round(Math.acos(Math.max(-1,Math.min(1,(u[0]*v[0]+u[1]*v[1])/d)))*180/Math.PI);};
const roundPoint=p=>({x:Number(p.x.toFixed(4)),y:Number(p.y.toFixed(4)),z:Number((p.z||0).toFixed(4)),visibility:Number((p.visibility??p.presence??0).toFixed(3))});
function drawOverlay(canvas,video,landmarks){
  const max=720,scale=Math.min(1,max/Math.max(video.videoWidth,video.videoHeight));
  canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);
  const ctx=canvas.getContext('2d');ctx.drawImage(video,0,0,canvas.width,canvas.height);
  ctx.lineWidth=Math.max(2,canvas.width/260);ctx.strokeStyle='#42e8bd';ctx.fillStyle='#ffcf58';
  for(const [a,b] of CONNECTIONS){const p=landmarks[a],q=landmarks[b];if(p.visibility>.35&&q.visibility>.35){ctx.beginPath();ctx.moveTo(p.x*canvas.width,p.y*canvas.height);ctx.lineTo(q.x*canvas.width,q.y*canvas.height);ctx.stroke();}}
  for(const p of landmarks){if(p.visibility>.35){ctx.beginPath();ctx.arc(p.x*canvas.width,p.y*canvas.height,Math.max(3,canvas.width/150),0,Math.PI*2);ctx.fill();}}
  ctx.fillStyle='rgba(4,15,28,.8)';ctx.fillRect(8,8,Math.min(canvas.width-16,250),28);
  ctx.fillStyle='#fff';ctx.font='bold 13px system-ui';ctx.fillText('Coach In · repères de pose',16,27);
  return canvas.toDataURL('image/jpeg',.68);
}
export async function analyzeVideoPose(file){
  let landmarker,video,objectUrl;
  try{
    const mp=await import(TASKS_URL);
    const vision=await mp.FilesetResolver.forVisionTasks(WASM_URL);
    landmarker=await mp.PoseLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:MODEL_URL,delegate:'GPU'},runningMode:'VIDEO',numPoses:1,minPoseDetectionConfidence:.45,minPosePresenceConfidence:.45,minTrackingConfidence:.45});
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
      const leftKnee=angle(landmarks[23],landmarks[25],landmarks[27]),rightKnee=angle(landmarks[24],landmarks[26],landmarks[28]);
      const leftElbow=angle(landmarks[11],landmarks[13],landmarks[15]),rightElbow=angle(landmarks[12],landmarks[14],landmarks[16]);
      const leftHip=angle(landmarks[11],landmarks[23],landmarks[25]),rightHip=angle(landmarks[12],landmarks[24],landmarks[26]);
      const footSpacing=Number(Math.abs(landmarks[27].x-landmarks[28].x).toFixed(3));
      frames.push({timestamp:Number(seconds.toFixed(2)),visibility:Number(visible.toFixed(2)),landmarks,joint_angles:{left_knee:leftKnee,right_knee:rightKnee,left_elbow:leftElbow,right_elbow:rightElbow,left_hip:leftHip,right_hip:rightHip},foot_spacing_image_ratio:footSpacing});
      if(visible>bestVisibility&&visible>.48){bestVisibility=visible;overlay=drawOverlay(canvas,video,landmarks);}
    }
    if(!frames.length)return {available:false,reason:'Aucune silhouette complète détectée de façon exploitable.'};
    return {available:true,model:'MediaPipe Pose Landmarker Lite',frames,overlay_data_url:overlay,summary:{frames_detected:frames.length,mean_visibility:Number((frames.reduce((s,f)=>s+f.visibility,0)/frames.length).toFixed(2)),best_frame_timestamp:frames.reduce((best,f)=>f.visibility>best.visibility?f:best,frames[0]).timestamp,measurements_note:'Angles estimés en 2D image ; écart des pieds exprimé en proportion de largeur d’image. Aucune distance métrique au sol sans calibration du court.'}};
  }catch(error){return {available:false,reason:error?.message||'Détection de pose indisponible.'};}
  finally{try{landmarker?.close();}catch{}if(objectUrl)URL.revokeObjectURL(objectUrl);if(video){video.removeAttribute('src');video.load();}}
}
