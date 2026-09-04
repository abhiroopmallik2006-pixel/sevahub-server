/* SevaHub GPS: single high-accuracy watcher, nearby distance, and private booking tracking. */
(function(){
  let watchId=null;
  let heartbeatTimer=null;
  let sharing=false;
  let lastPosition=null;
  let lastSentPosition=null;
  let lastSentAt=0;
  let sendInFlight=false;
  let queuedPosition=null;
  let trackingTimer=null;
  let trackingBookingId=null;
  let locationSocket=null;
  let socketUserId=null;

  const MIN_SEND_MS=1800;
  const HEARTBEAT_MS=9000;
  const MAX_SAMPLE_AGE_MS=15000;
  const MAX_SEND_ACCURACY_M=1500;

  function loggedIn(){try{return Boolean(state?.user&&state?.role)}catch(e){return false}}
  function escapeHtml(v=''){try{return typeof esc==='function'?esc(v):String(v)}catch(e){return String(v)}}
  function secureEnough(){return location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1'}
  function sampleTime(p){const n=Number(p?.timestamp);return Number.isFinite(n)&&n>0?n:Date.now()}
  function sampleAge(p){return Math.max(0,Date.now()-sampleTime(p))}
  function accuracy(p){return Math.max(1,Number(p?.coords?.accuracy||9999))}
  function validPosition(p){
    const lat=Number(p?.coords?.latitude),lng=Number(p?.coords?.longitude),acc=accuracy(p);
    return Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=-90&&lat<=90&&lng>=-180&&lng<=180&&acc<=MAX_SEND_ACCURACY_M&&sampleAge(p)<=MAX_SAMPLE_AGE_MS;
  }
  function distanceM(a,b){
    if(!a||!b)return Infinity;
    const rad=n=>n*Math.PI/180,R=6371000;
    const lat1=Number(a.coords.latitude),lng1=Number(a.coords.longitude),lat2=Number(b.coords.latitude),lng2=Number(b.coords.longitude);
    const dLat=rad(lat2-lat1),dLng=rad(lng2-lng1);
    const h=Math.sin(dLat/2)**2+Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(dLng/2)**2;
    return R*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
  }
  function preferPosition(next,current){
    if(!validPosition(next))return current;
    if(!current||!validPosition(current))return next;
    const na=accuracy(next),ca=accuracy(current),moved=distanceM(next,current);
    if(na<=ca*.82)return next;
    if(moved>Math.max(5,Math.min(40,(na+ca)*.35)))return next;
    if(sampleTime(next)-sampleTime(current)>7000&&na<=ca*1.35)return next;
    return current;
  }
  function shouldSend(p,force=false){
    if(force||!lastSentPosition)return true;
    const now=Date.now(),na=accuracy(p),la=accuracy(lastSentPosition);
    if(na<=Math.min(60,la*.8))return true;
    if(now-lastSentAt>=HEARTBEAT_MS)return true;
    if(now-lastSentAt<MIN_SEND_MS)return false;
    const moved=distanceM(p,lastSentPosition);
    return moved>Math.max(3,Math.min(25,(na+la)*.22));
  }

  function ageText(value){
    if(!value)return '';
    const seconds=Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/1000));
    if(seconds<15)return 'just now';
    if(seconds<60)return `${seconds}s ago`;
    return `${Math.floor(seconds/60)} min ago`;
  }
  function getGeoError(err){
    if(!secureEnough())return 'GPS needs HTTPS. Open SevaHub through your HTTPS URL.';
    if(err?.code===1)return 'Location permission was denied. Allow precise Location for SevaHub in browser/app settings.';
    if(err?.code===2)return 'Current location is unavailable. Turn on phone GPS and try again.';
    if(err?.code===3)return 'Precise location timed out. Move near a window/open area and retry.';
    return err?.message||'Could not get your location.';
  }

  function setLocationButton(){
    const btn=document.getElementById('locationNavButton');
    if(!btn)return;
    btn.classList.toggle('location-on',sharing);
    btn.innerHTML=sharing?'📍 <span>Location On</span>':'📍 <span>Location</span>';
    btn.title=sharing?'Live location sharing is on':'Manage location sharing';
  }
  function injectNavButton(){
    if(!loggedIn())return;
    const actions=document.querySelector('.nav .nav-actions');
    if(!actions||document.getElementById('locationNavButton'))return;
    const btn=document.createElement('button');
    btn.id='locationNavButton';btn.type='button';btn.className='theme location-nav-btn';btn.onclick=()=>openLocationSettings();
    actions.insertBefore(btn,actions.firstChild);setLocationButton();
  }

  function ensureModal(){
    let root=document.getElementById('locationModal');
    if(root)return root;
    root=document.createElement('div');root.id='locationModal';root.className='location-modal hidden';
    root.innerHTML=`<div class="location-dialog" role="dialog" aria-modal="true" aria-labelledby="locationTitle"><div class="split location-dialog-head"><div><h2 id="locationTitle">📍 Location</h2><p class="muted" id="locationSubtitle"></p></div><button class="btn secondary small" type="button" id="locationClose">✕</button></div><div id="locationModalBody"></div></div>`;
    document.body.appendChild(root);
    root.addEventListener('click',e=>{if(e.target===root)closeLocationModal()});
    root.querySelector('#locationClose').addEventListener('click',closeLocationModal);
    return root;
  }
  function showModal(title,subtitle,html){
    const modal=ensureModal();modal.querySelector('#locationTitle').textContent=title;modal.querySelector('#locationSubtitle').textContent=subtitle||'';modal.querySelector('#locationModalBody').innerHTML=html;modal.classList.remove('hidden');
  }
  function closeLocationModal(){
    document.getElementById('locationModal')?.classList.add('hidden');
    if(trackingTimer){clearInterval(trackingTimer);trackingTimer=null}
    trackingBookingId=null;
  }
  window.closeLocationModal=closeLocationModal;

  async function sendPosition(position,force=false){
    if(!sharing||!loggedIn()||isDemo||!validPosition(position))return false;
    lastPosition=preferPosition(position,lastPosition);
    const chosen=lastPosition;
    if(!chosen||!shouldSend(chosen,force))return false;
    if(sendInFlight){queuedPosition=preferPosition(chosen,queuedPosition);return false}
    sendInFlight=true;
    try{
      const result=await api('/location/me',{method:'POST',body:JSON.stringify({latitude:Number(chosen.coords.latitude),longitude:Number(chosen.coords.longitude),accuracy:Number(chosen.coords.accuracy||0),capturedAt:new Date(sampleTime(chosen)).toISOString()})});
      if(!result?.data?.ignored){lastSentPosition=chosen;lastSentAt=Date.now()}
      setLocationButton();return true;
    }finally{
      sendInFlight=false;
      if(queuedPosition){const q=queuedPosition;queuedPosition=null;setTimeout(()=>sendPosition(q,false).catch(()=>{}),0)}
    }
  }

  function requestFreshPosition(force=false,showError=false){
    return new Promise(resolve=>{
      if(!navigator.geolocation){if(showError)toast('GPS is not supported on this device');return resolve(false)}
      navigator.geolocation.getCurrentPosition(p=>sendPosition(p,force).then(()=>resolve(true)).catch(()=>resolve(false)),err=>{if(showError)toast(getGeoError(err));resolve(false)},{enableHighAccuracy:true,maximumAge:0,timeout:15000});
    });
  }
  window.sevahubForcePreciseLocationSync=()=>requestFreshPosition(true,true);

  function stopWatch(){
    if(watchId!==null){try{navigator.geolocation?.clearWatch(watchId)}catch(e){}watchId=null}
    if(heartbeatTimer){clearInterval(heartbeatTimer);heartbeatTimer=null}
    queuedPosition=null;sendInFlight=false;
  }
  function startWatch(){
    if(watchId!==null||!sharing||isDemo)return;
    if(!navigator.geolocation){sharing=false;setLocationButton();return toast('GPS is not supported on this device')}
    watchId=navigator.geolocation.watchPosition(p=>sendPosition(p,false).catch(()=>{}),err=>{if(err?.code!==3)console.warn('Location watch error',err)},{enableHighAccuracy:true,maximumAge:0,timeout:12000});
    if(!heartbeatTimer)heartbeatTimer=setInterval(()=>{if(!sharing||!loggedIn())return stopWatch();if(Date.now()-lastSentAt>=HEARTBEAT_MS-500)requestFreshPosition(true,false)},4000);
  }

  async function startLocationSharing(){
    if(isDemo)return toast('Live GPS needs Server mode');
    if(!navigator.geolocation)return toast('GPS is not supported on this device');
    if(!secureEnough())return toast('GPS needs HTTPS. Use your secure SevaHub URL.');
    const button=document.getElementById('startLocationButton');if(button){button.disabled=true;button.textContent='Locking precise GPS…'}
    navigator.geolocation.getCurrentPosition(async p=>{
      try{
        if(!validPosition(p))throw new Error(`GPS signal is too weak (~${Math.round(accuracy(p))} m). Move near a window/open area and try again.`);
        sharing=true;lastPosition=p;await sendPosition(p,true);startWatch();toast(`📍 Live location on (~${Math.round(accuracy(p))} m accuracy)`);openLocationSettings();
      }catch(err){sharing=false;stopWatch();setLocationButton();toast(err.message||'Could not enable location sharing');openLocationSettings()}
    },err=>{sharing=false;stopWatch();setLocationButton();toast(getGeoError(err));openLocationSettings()},{enableHighAccuracy:true,maximumAge:0,timeout:20000});
  }
  window.startLocationSharing=startLocationSharing;

  async function stopLocationSharing(){
    stopWatch();sharing=false;lastPosition=null;lastSentPosition=null;lastSentAt=0;setLocationButton();
    if(!isDemo&&loggedIn()){try{await api('/location/me',{method:'DELETE'})}catch(e){}}
    toast('Location sharing stopped');openLocationSettings();
  }
  window.stopLocationSharing=stopLocationSharing;

  async function openLocationSettings(){
    if(!loggedIn())return;
    let status={sharingEnabled:sharing};
    if(!isDemo){try{status=(await api('/location/me')).data||status}catch(e){}}
    sharing=Boolean(status.sharingEnabled);if(sharing)startWatch();setLocationButton();
    const roleText=state.role==='WORKER'?'When enabled, nearby users can see your distance, not your exact GPS. Exact live location is shared only with your assigned customer during an active booking.':'When enabled, SevaHub can calculate nearby worker distance. Exact live location is shared only with your assigned worker during an active booking.';
    const accuracyText=sharing&&status.accuracy?` · accuracy ~${Math.round(Number(status.accuracy))} m`:'';
    showModal('📍 Location sharing',roleText,`<div class="location-status ${sharing?'on':'off'}"><b>${sharing?'● Live location is ON':'○ Location sharing is OFF'}</b><span>${sharing&&status.updatedAt?`Last update ${ageText(status.capturedAt||status.updatedAt)}${accuracyText}`:'You control when GPS is shared.'}</span></div><div class="location-privacy-note"><b>Privacy:</b> SevaHub stores only your latest location, not a route/history. Nearby discovery exposes distance only. Precise GPS is limited to both sides of an accepted/in-progress booking.</div><div class="tabs">${sharing?'<button class="btn danger" type="button" onclick="stopLocationSharing()">Stop sharing</button>':'<button id="startLocationButton" class="btn" type="button" onclick="startLocationSharing()">📍 Use my live location</button>'}</div>`);
  }
  window.openLocationSettings=openLocationSettings;

  async function decorateNearbyWorkers(serviceId){
    if(isDemo||state.role!=='USER')return;
    const panel=document.querySelector('#userContent > .panel'),grid=panel?.querySelector('.grid');if(!panel||!grid)return;
    if(!sharing||!lastPosition){
      if(!panel.querySelector('.nearby-location-callout')){const callout=document.createElement('div');callout.className='nearby-location-callout';callout.innerHTML='<span>📍 Turn on Location to see which professionals are closest to you.</span><button class="btn small" type="button" onclick="openLocationSettings()">Enable location</button>';grid.before(callout)}
      return;
    }
    try{
      const p=lastPosition.coords,capturedAt=new Date(sampleTime(lastPosition)).toISOString();
      const result=await api(`/location/nearby-workers?serviceId=${Number(serviceId)}&lat=${encodeURIComponent(p.latitude)}&lng=${encodeURIComponent(p.longitude)}&accuracy=${encodeURIComponent(p.accuracy||0)}&capturedAt=${encodeURIComponent(capturedAt)}&radiusKm=50`);
      const map=new Map((result.data||[]).map(x=>[Number(x.workerId),x])),cards=[...grid.querySelectorAll('.worker-card[data-worker-id]')];
      cards.forEach(card=>{card.querySelector('.worker-distance')?.remove();const id=Number(card.dataset.workerId),loc=map.get(id);if(loc){const badge=document.createElement('div');badge.className='worker-distance';badge.innerHTML=`📍 <b>${loc.distanceKm<1?`${Math.round(loc.distanceKm*1000)} m`:`${loc.distanceKm.toFixed(1)} km`}</b> away <span>· GPS ±${Math.round(Number(loc.uncertaintyM||loc.accuracy||0))} m</span>`;const heading=card.querySelector('.split');if(heading)heading.after(badge);else card.prepend(badge);card.dataset.distance=String(loc.distanceKm)}else card.dataset.distance='999999'});
      cards.sort((a,b)=>Number(a.dataset.distance)-Number(b.dataset.distance)).forEach(c=>grid.appendChild(c));
    }catch(e){console.warn('Nearby worker distance unavailable',e)}
  }

  function addWorkerDataAttribute(){
    try{if(typeof workerHTML!=='function'||workerHTML.__locationWrapped)return;const original=workerHTML;workerHTML=function(w,sid){const html=original(w,sid),id=Number(w.worker_id??w.id??0);return html.replace('<div class="card worker-card"',`<div class="card worker-card" data-worker-id="${id}"`)};workerHTML.__locationWrapped=true}catch(e){}
  }
  function wrapShowWorkers(){
    try{if(typeof showWorkers!=='function'||showWorkers.__locationWrapped)return;const original=showWorkers;showWorkers=async function(serviceId){const result=await original.apply(this,arguments);await decorateNearbyWorkers(Number(serviceId));return result};showWorkers.__locationWrapped=true}catch(e){}
  }
  function bookingCard(container,bookingId,worker=false){
    const cards=[...container.querySelectorAll(worker?'.offer':'.card.panel')];return cards.find(card=>{const text=card.textContent||'';return worker?new RegExp(`(^|\\s)#?${bookingId}(\\s|·|$)`).test(text):text.includes(`Booking #${bookingId}`)})
  }
  async function addTrackingButtons(targetRole){
    if(isDemo||!loggedIn())return;const container=document.getElementById(targetRole==='WORKER'?'workerContent':'userContent');if(!container)return;
    try{const rows=(await api('/bookings')).data||[];rows.filter(b=>['ACCEPTED','IN_PROGRESS'].includes(b.status)).forEach(b=>{const card=bookingCard(container,b.id,targetRole==='WORKER');if(!card||card.querySelector('.live-location-btn'))return;const actions=card.querySelector('.tabs.top-space')||card.querySelector('.tabs')||card;const btn=document.createElement('button');btn.type='button';btn.className='btn secondary small live-location-btn';btn.textContent='📍 Live location';btn.onclick=()=>openBookingLocation(Number(b.id));actions.appendChild(btn)})}catch(e){}
  }
  function wrapBookingViews(){
    try{if(typeof userBookings==='function'&&!userBookings.__locationWrapped){const original=userBookings;userBookings=async function(){const r=await original.apply(this,arguments);await addTrackingButtons('USER');return r};userBookings.__locationWrapped=true}}catch(e){}
    try{if(typeof loadWorkerBookingsLive==='function'&&!loadWorkerBookingsLive.__locationWrapped){const original=loadWorkerBookingsLive;loadWorkerBookingsLive=async function(){const r=await original.apply(this,arguments);await addTrackingButtons('WORKER');return r};loadWorkerBookingsLive.__locationWrapped=true}}catch(e){}
  }

  function locationPersonCard(icon,label,p){
    if(!p?.sharing)return `<div class="location-person"><div class="location-person-icon">${icon}</div><div><b>${escapeHtml(p?.name||label)}</b><p class="muted">Location sharing is off.</p></div></div>`;
    const mapUrl=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.latitude+','+p.longitude)}`,when=p.capturedAt||p.updatedAt;
    return `<div class="location-person"><div class="location-person-icon">${icon}</div><div class="location-person-main"><b>${escapeHtml(p.name||label)}</b><p class="${p.isLive?'location-live':'muted'}">${p.isLive?'● Live':'Last location'} · ${ageText(when)} · accuracy ~${Math.round(Number(p.accuracy||0))} m</p><a class="btn secondary small location-map-link" href="${mapUrl}" target="_blank" rel="noopener">Open in Maps ↗</a></div></div>`;
  }
  async function refreshBookingLocation(){
    if(!trackingBookingId)return;
    try{const data=(await api(`/location/booking/${trackingBookingId}`)).data,body=document.getElementById('locationModalBody');if(!body)return;const distance=data.distanceKm==null?'Waiting for fresh GPS from both sides':data.distanceKm<1?`${Math.round(data.distanceKm*1000)} m apart`:`${data.distanceKm.toFixed(2)} km apart`;const uncertainty=data.uncertaintyM?` · combined GPS uncertainty ~${Math.round(Number(data.uncertaintyM))} m`:'';body.innerHTML=`<div class="tracking-distance"><span>Current straight-line distance</span><b>${distance}</b><small>Updates from Socket.IO when fresh GPS is saved${uncertainty}.</small></div><div class="location-people">${locationPersonCard('🏠','Customer',data.customer)}${locationPersonCard('🧰','Worker',data.worker)}</div>${!sharing?'<div class="nearby-location-callout"><span>Your own GPS sharing is off.</span><button class="btn small" type="button" onclick="startLocationSharing()">Share my location</button></div>':''}<p class="location-disclaimer">For privacy, exact tracking is available only to the assigned customer and worker while the booking is accepted or in progress.</p>`}catch(e){const body=document.getElementById('locationModalBody');if(body)body.innerHTML=`<div class="empty">${escapeHtml(e.message)}</div>`}
  }
  async function openBookingLocation(bookingId){trackingBookingId=Number(bookingId);showModal('📍 Live booking location',`Booking #${trackingBookingId}`,'<div class="empty">Getting live GPS…</div>');if(sharing)requestFreshPosition(true,false);await refreshBookingLocation();if(trackingTimer)clearInterval(trackingTimer);trackingTimer=setInterval(refreshBookingLocation,3000)}
  window.openBookingLocation=openBookingLocation;

  function bindLocationSocket(){
    if(isDemo||!loggedIn()||!window.io)return;const uid=Number(state.user.id);if(locationSocket&&socketUserId===uid)return;if(locationSocket){try{locationSocket.disconnect()}catch(e){}locationSocket=null}
    try{socketUserId=uid;locationSocket=window.io({transports:['websocket','polling']});locationSocket.on('connect',()=>locationSocket.emit('join-user-room',uid));locationSocket.on('location-updated',p=>{if(Number(p?.bookingId)===Number(trackingBookingId))refreshBookingLocation()});locationSocket.on('location-sharing-stopped',p=>{if(Number(p?.bookingId)===Number(trackingBookingId))refreshBookingLocation()})}catch(e){}
  }

  async function restoreLocationState(){
    if(!loggedIn()||isDemo)return;
    try{const data=(await api('/location/me')).data||{};sharing=Boolean(data.sharingEnabled);if(sharing){startWatch();requestFreshPosition(true,false)}setLocationButton()}catch(e){}
  }

  addWorkerDataAttribute();wrapShowWorkers();wrapBookingViews();
  const observer=new MutationObserver(()=>{injectNavButton();if(loggedIn())bindLocationSocket()});observer.observe(document.getElementById('app')||document.body,{childList:true,subtree:true});
  window.addEventListener('focus',()=>{if(sharing&&loggedIn())requestFreshPosition(true,false)});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&sharing&&loggedIn())requestFreshPosition(true,false)});
  setTimeout(()=>{injectNavButton();restoreLocationState();bindLocationSocket()},0);

  try{if(typeof logout==='function'){const originalLogout=logout;logout=function(){stopWatch();sharing=false;lastPosition=null;lastSentPosition=null;if(locationSocket){try{locationSocket.disconnect()}catch(e){}locationSocket=null;socketUserId=null}if(!isDemo&&loggedIn())api('/location/me',{method:'DELETE'}).catch(()=>{});return originalLogout.apply(this,arguments)}}}catch(e){}
})();
