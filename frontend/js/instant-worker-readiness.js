/* SevaHub one-click worker readiness for AI + GPS Instant Jobs. */
(function(){
  let injectTimer=null;
  let loading=false;
  let lastRenderAt=0;

  function currentRole(){try{return typeof state!=='undefined'?state?.role:null}catch(e){return null}}
  function loggedWorker(){try{return currentRole()==='WORKER'&&Boolean(state?.user)}catch(e){return false}}
  function safe(v=''){try{return typeof esc==='function'?esc(v):String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}catch(e){return String(v)}}
  function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms))}

  async function getReadiness(){
    const r=await api('/emergency/worker/availability');
    return r.data||{};
  }

  async function waitForFreshGps(timeoutMs=24000){
    const started=Date.now();
    let latest=null;
    while(Date.now()-started<timeoutMs){
      try{
        latest=await getReadiness();
        if(latest.gpsReady)return latest;
      }catch(e){}
      await sleep(900);
    }
    return latest;
  }

  async function becomeInstantReady(){
    if(!loggedWorker()||loading)return;
    loading=true;
    const buttons=[...document.querySelectorAll('[data-instant-ready-action]')];
    buttons.forEach(b=>{b.disabled=true;b.textContent='Getting precise GPS…'});
    try{
      let status=await getReadiness();
      if(!status.eligibleProfile)throw new Error('Your worker profile must be VERIFIED and unrestricted before Instant Jobs can be enabled.');

      if(!status.gpsReady){
        if(typeof window.startLocationSharing!=='function')throw new Error('Location sharing is unavailable on this screen.');
        window.startLocationSharing();
        status=await waitForFreshGps();
        if(!status?.gpsReady){
          throw new Error(status?.gpsMessage||'Precise GPS did not become ready. Turn on Precise Location and retry.');
        }
      }

      await api('/emergency/worker/availability',{method:'PUT',body:JSON.stringify({available:true})});
      if(typeof toast==='function')toast('⚡ You are READY for nearby Instant Jobs');
      try{window.closeLocationModal?.()}catch(e){}
      if(typeof window.openInstantJobs==='function')await window.openInstantJobs();
    }catch(err){
      if(typeof toast==='function')toast(err.message||'Could not enable Instant Jobs');
      try{if(typeof window.openInstantJobs==='function')await window.openInstantJobs()}catch(e){}
    }finally{
      loading=false;
      scheduleInject(true);
    }
  }
  window.becomeInstantReady=becomeInstantReady;

  async function pauseInstantReady(){
    if(!loggedWorker()||loading)return;
    loading=true;
    try{
      await api('/emergency/worker/availability',{method:'PUT',body:JSON.stringify({available:false})});
      if(typeof toast==='function')toast('Instant Jobs paused');
      scheduleInject(true);
    }catch(err){if(typeof toast==='function')toast(err.message)}finally{loading=false}
  }
  window.pauseInstantReady=pauseInstantReady;

  function isWorkerOverview(box){
    if(!box||box.querySelector('.instant-jobs-marker'))return false;
    const grid=box.querySelector(':scope > .grid.grid-3');
    if(!grid)return false;
    const text=(grid.textContent||'').toLowerCase();
    return text.includes('my service')&&text.includes('working area');
  }

  function renderCard(status){
    const box=document.getElementById('workerContent');
    if(!isWorkerOverview(box))return;
    let card=box.querySelector('.instant-readiness-home');
    if(!card){
      card=document.createElement('div');
      card.className='card panel instant-readiness-home';
      box.insertBefore(card,box.firstChild);
    }

    const eligible=Boolean(status.eligibleProfile);
    const gps=Boolean(status.gpsReady);
    const available=Boolean(status.instantAvailable);
    const ready=eligible&&gps&&available;

    let badge,detail,action='';
    if(ready){
      badge='✅ READY';
      detail=`Precise GPS is fresh${status.gpsAccuracy?` (~${Math.round(Number(status.gpsAccuracy))} m)`:''} and Instant Jobs are ON.`;
      action='<button class="btn secondary small" type="button" onclick="openInstantJobs()">View Instant Jobs</button><button class="btn danger small" type="button" onclick="pauseInstantReady()">Pause</button>';
    }else if(!eligible){
      badge='⚠ NOT ELIGIBLE';
      detail='Admin verification is required and the worker profile must not be restricted/deleted.';
      action='<button class="btn secondary small" type="button" onclick="workerProfile()">Open Profile</button>';
    }else if(!gps){
      badge='📍 GPS REQUIRED';
      detail=safe(status.gpsMessage||'Fresh precise GPS is required before urgent nearby requests can reach you.');
      action='<button class="btn small" type="button" data-instant-ready-action onclick="becomeInstantReady()">⚡ Become Ready</button>';
    }else{
      badge='⚡ INSTANT JOBS OFF';
      detail=`GPS is ready${status.gpsAccuracy?` (~${Math.round(Number(status.gpsAccuracy))} m)`:''}. Turn on Instant Jobs to receive nearby urgent requests.`;
      action='<button class="btn small" type="button" data-instant-ready-action onclick="becomeInstantReady()">⚡ Become Ready</button>';
    }

    card.innerHTML=`<div class="split"><div><div class="emergency-brand">AI + GPS WORKER READINESS</div><h2>⚡ Instant Job Readiness</h2><p class="muted">${detail}</p></div><span class="pill">${badge}</span></div><div class="tabs top-space">${action}</div>`;
  }

  async function inject(){
    if(!loggedWorker())return;
    const box=document.getElementById('workerContent');
    if(!isWorkerOverview(box)){box?.querySelector('.instant-readiness-home')?.remove();return}
    if(Date.now()-lastRenderAt<800)return;
    lastRenderAt=Date.now();
    try{renderCard(await getReadiness())}catch(e){}
  }

  function scheduleInject(force=false){
    clearTimeout(injectTimer);
    injectTimer=setTimeout(()=>{if(force)lastRenderAt=0;inject()},force?40:140);
  }

  const app=document.getElementById('app')||document.body;
  new MutationObserver(()=>scheduleInject(false)).observe(app,{childList:true,subtree:true});
  window.addEventListener('focus',()=>scheduleInject(true));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')scheduleInject(true)});
  setTimeout(()=>scheduleInject(true),250);
})();
