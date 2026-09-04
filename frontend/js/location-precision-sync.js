/* SevaHub precision GPS synchronization.
   Keeps the existing privacy/UI flow, but adds fresher high-accuracy device samples and faster server sync. */
(function(){
  let watchId=null;
  let lastSample=null;
  let lastSentSample=null;
  let lastSentAt=0;
  let sendInFlight=false;
  let queuedSample=null;
  let heartbeatTimer=null;
  let bootTimer=null;
  let lastAccountKey='';

  const MIN_SEND_MS=1500;
  const HEARTBEAT_MS=9000;
  const MAX_SAMPLE_AGE_MS=15000;
  const MAX_CLIENT_ACCURACY_M=1000;
  const GOOD_ACCURACY_M=60;

  function loggedIn(){
    try{return Boolean(window.state?.user&&window.state?.role)}catch(e){return false}
  }
  function accountKey(){
    try{return loggedIn()?`${window.state.role}:${Number(window.state.user.id)||0}`:''}catch(e){return ''}
  }
  function demoMode(){
    try{return Boolean(window.isDemo)}catch(e){return false}
  }
  function secureEnough(){
    return location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1';
  }
  function coordsOk(p){
    const lat=Number(p?.coords?.latitude),lng=Number(p?.coords?.longitude),acc=Number(p?.coords?.accuracy);
    return Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=-90&&lat<=90&&lng>=-180&&lng<=180&&Number.isFinite(acc)&&acc>=0&&acc<=MAX_CLIENT_ACCURACY_M;
  }
  function sampleTime(p){
    const value=Number(p?.timestamp);
    return Number.isFinite(value)&&value>0?value:Date.now();
  }
  function sampleAge(p){return Math.max(0,Date.now()-sampleTime(p))}
  function accuracy(p){return Math.max(1,Number(p?.coords?.accuracy||9999))}
  function distanceM(a,b){
    if(!a||!b)return Infinity;
    const lat1=Number(a.coords.latitude),lng1=Number(a.coords.longitude),lat2=Number(b.coords.latitude),lng2=Number(b.coords.longitude);
    const rad=n=>n*Math.PI/180,R=6371000;
    const dLat=rad(lat2-lat1),dLng=rad(lng2-lng1);
    const h=Math.sin(dLat/2)**2+Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(dLng/2)**2;
    return R*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
  }
  function usefulSample(p){return coordsOk(p)&&sampleAge(p)<=MAX_SAMPLE_AGE_MS}

  function preferSample(next,current){
    if(!usefulSample(next))return current;
    if(!current||!usefulSample(current))return next;
    const nextAcc=accuracy(next),currentAcc=accuracy(current);
    if(nextAcc<=currentAcc*.82)return next;
    const moved=distanceM(next,current);
    if(moved>Math.max(5,Math.min(40,(nextAcc+currentAcc)*.35)))return next;
    if(sampleTime(next)-sampleTime(current)>7000&&nextAcc<=currentAcc*1.35)return next;
    return current;
  }

  function shouldSend(p,force=false){
    if(force||!lastSentSample)return true;
    const now=Date.now(),nextAcc=accuracy(p),lastAcc=accuracy(lastSentSample);
    if(nextAcc<=Math.min(GOOD_ACCURACY_M,lastAcc*.8))return true;
    if(now-lastSentAt>=HEARTBEAT_MS)return true;
    if(now-lastSentAt<MIN_SEND_MS)return false;
    const moved=distanceM(p,lastSentSample);
    return moved>Math.max(3,Math.min(25,(nextAcc+lastAcc)*.22));
  }

  async function postSample(position,force=false){
    if(!loggedIn()||demoMode()||!usefulSample(position))return false;
    lastSample=preferSample(position,lastSample);
    const chosen=lastSample;
    if(!chosen||!shouldSend(chosen,force))return false;
    if(sendInFlight){queuedSample=preferSample(chosen,queuedSample);return false}

    sendInFlight=true;
    try{
      const capturedAt=new Date(sampleTime(chosen)).toISOString();
      const result=await api('/location/me',{
        method:'POST',
        body:JSON.stringify({
          latitude:Number(chosen.coords.latitude),
          longitude:Number(chosen.coords.longitude),
          accuracy:Number(chosen.coords.accuracy||0),
          capturedAt
        })
      });
      if(!result?.data?.ignored){
        lastSentSample=chosen;
        lastSentAt=Date.now();
      }
      return true;
    }catch(err){
      if(!/accuracy is too low|stale gps/i.test(String(err?.message||'')))console.warn('Precision GPS sync failed',err);
      return false;
    }finally{
      sendInFlight=false;
      if(queuedSample){
        const queued=queuedSample;queuedSample=null;
        setTimeout(()=>postSample(queued,false),0);
      }
    }
  }

  function geoErrorMessage(err){
    if(err?.code===1)return 'Location permission was denied. Allow precise location for SevaHub.';
    if(err?.code===2)return 'GPS signal is unavailable. Turn on device Location and try again.';
    if(err?.code===3)return 'Precise GPS timed out. Move near a window or outdoors and retry.';
    return err?.message||'Could not get precise GPS.';
  }

  function getFreshPosition(timeout=18000){
    return new Promise((resolve,reject)=>{
      if(!navigator.geolocation)return reject(new Error('GPS is not supported on this device'));
      navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,maximumAge:0,timeout});
    });
  }

  async function forceFreshSync(showError=false){
    if(!loggedIn()||demoMode()||!secureEnough())return false;
    try{
      const p=await getFreshPosition(15000);
      if(!coordsOk(p))throw new Error(`GPS signal is weak (about ${Math.round(Number(p?.coords?.accuracy||0))} m accuracy).`);
      lastSample=preferSample(p,lastSample);
      return await postSample(p,true);
    }catch(err){
      if(showError&&typeof toast==='function')toast(geoErrorMessage(err));
      return false;
    }
  }

  function startWatch(){
    if(watchId!==null||!loggedIn()||demoMode()||!secureEnough()||!navigator.geolocation)return;
    watchId=navigator.geolocation.watchPosition(
      p=>postSample(p,false),
      err=>{if(err?.code!==3)console.warn('Precision location watch error',err)},
      {enableHighAccuracy:true,maximumAge:0,timeout:12000}
    );
    if(!heartbeatTimer){
      heartbeatTimer=setInterval(()=>{
        if(!loggedIn())return stopWatch();
        if(Date.now()-lastSentAt>=HEARTBEAT_MS-500)forceFreshSync(false);
      },4000);
    }
  }

  function stopWatch(){
    if(watchId!==null){try{navigator.geolocation?.clearWatch(watchId)}catch(e){}watchId=null}
    if(heartbeatTimer){clearInterval(heartbeatTimer);heartbeatTimer=null}
    lastSample=null;lastSentSample=null;lastSentAt=0;queuedSample=null;
  }

  async function sharingEnabledOnServer(){
    if(!loggedIn()||demoMode()||typeof api!=='function')return false;
    try{return Boolean((await api('/location/me'))?.data?.sharingEnabled)}catch(e){return false}
  }

  async function boot(){
    clearTimeout(bootTimer);
    bootTimer=null;
    if(!loggedIn()||demoMode())return stopWatch();
    if(await sharingEnabledOnServer()){
      startWatch();
      forceFreshSync(false);
    }else stopWatch();
  }

  function scheduleAccountBoot(){
    const key=accountKey();
    if(key===lastAccountKey)return;
    lastAccountKey=key;
    clearTimeout(bootTimer);
    bootTimer=setTimeout(boot,150);
  }

  window.startLocationSharing=async function(){
    if(demoMode())return typeof toast==='function'&&toast('Live GPS needs Server mode');
    if(!navigator.geolocation)return typeof toast==='function'&&toast('GPS is not supported on this device');
    if(!secureEnough())return typeof toast==='function'&&toast('GPS needs HTTPS. Use the secure SevaHub URL.');
    const button=document.getElementById('startLocationButton');
    if(button){button.disabled=true;button.textContent='Locking precise GPS…'}
    try{
      const p=await getFreshPosition(20000);
      const acc=accuracy(p);
      if(!coordsOk(p))throw new Error(`GPS signal is too weak (~${Math.round(acc)} m). Move near a window or outdoors and try again.`);
      lastSample=p;
      const ok=await postSample(p,true);
      if(!ok)throw new Error('Could not synchronize your fresh GPS location.');
      startWatch();
      if(typeof toast==='function')toast(acc<=GOOD_ACCURACY_M?`📍 Precise live location on (~${Math.round(acc)} m)`:`📍 Live location on (~${Math.round(acc)} m accuracy)`);
      if(typeof window.openLocationSettings==='function')await window.openLocationSettings();
    }catch(err){
      stopWatch();
      if(typeof toast==='function')toast(geoErrorMessage(err));
      if(button){button.disabled=false;button.textContent='📍 Use my live location'}
    }
  };

  const originalStop=window.stopLocationSharing;
  window.stopLocationSharing=async function(){
    stopWatch();
    if(typeof originalStop==='function')return originalStop.apply(this,arguments);
    try{if(loggedIn()&&!demoMode())await api('/location/me',{method:'DELETE'})}catch(e){}
  };

  window.sevahubForcePreciseLocationSync=()=>forceFreshSync(true);

  window.addEventListener('focus',()=>{
    if(watchId!==null)forceFreshSync(false);
    else scheduleAccountBoot();
  });
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible'){
      if(watchId!==null)forceFreshSync(false);else scheduleAccountBoot();
    }
  });
  window.addEventListener('sevahub:native-location-permission',e=>{
    if(e?.detail?.granted)setTimeout(()=>forceFreshSync(false),350);
  });

  const app=document.getElementById('app')||document.body;
  const observer=new MutationObserver(scheduleAccountBoot);
  observer.observe(app,{childList:true,subtree:true});

  setTimeout(()=>{
    lastAccountKey=accountKey();
    boot();
  },300);
})();
