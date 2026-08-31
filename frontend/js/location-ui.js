/* SevaHub GPS: opt-in current-location sharing, nearby worker distance, and private booking tracking. */
(function(){
  let watchId=null;
  let sharing=false;
  let lastPosition=null;
  let lastSentAt=0;
  let trackingTimer=null;
  let trackingBookingId=null;
  let locationSocket=null;

  const MIN_SEND_MS=7000;

  function loggedIn(){
    try{return Boolean(state?.user&&state?.role)}catch(e){return false}
  }

  function escapeHtml(v=''){
    try{return typeof esc==='function'?esc(v):String(v)}catch(e){return String(v)}
  }

  function ageText(value){
    if(!value)return '';
    const seconds=Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/1000));
    if(seconds<15)return 'just now';
    if(seconds<60)return `${seconds}s ago`;
    const minutes=Math.floor(seconds/60);
    return `${minutes} min ago`;
  }

  function secureEnough(){
    return location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1';
  }

  function getGeoError(err){
    if(!secureEnough())return 'GPS needs HTTPS. Open SevaHub through your HTTPS ngrok URL.';
    if(err?.code===1)return 'Location permission was denied. Allow Location for SevaHub in browser/app settings.';
    if(err?.code===2)return 'Current location is unavailable. Turn on phone GPS and try again.';
    if(err?.code===3)return 'Location request timed out. Try again with GPS turned on.';
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
    btn.id='locationNavButton';
    btn.type='button';
    btn.className='theme location-nav-btn';
    btn.onclick=()=>openLocationSettings();
    actions.insertBefore(btn,actions.firstChild);
    setLocationButton();
  }

  function ensureModal(){
    let root=document.getElementById('locationModal');
    if(root)return root;
    root=document.createElement('div');
    root.id='locationModal';
    root.className='location-modal hidden';
    root.innerHTML=`<div class="location-dialog" role="dialog" aria-modal="true" aria-labelledby="locationTitle">
      <div class="split location-dialog-head">
        <div><h2 id="locationTitle">📍 Location</h2><p class="muted" id="locationSubtitle"></p></div>
        <button class="btn secondary small" type="button" id="locationClose">✕</button>
      </div>
      <div id="locationModalBody"></div>
    </div>`;
    document.body.appendChild(root);
    root.addEventListener('click',e=>{if(e.target===root)closeLocationModal()});
    root.querySelector('#locationClose').addEventListener('click',closeLocationModal);
    return root;
  }

  function showModal(title,subtitle,html){
    const modal=ensureModal();
    modal.querySelector('#locationTitle').textContent=title;
    modal.querySelector('#locationSubtitle').textContent=subtitle||'';
    modal.querySelector('#locationModalBody').innerHTML=html;
    modal.classList.remove('hidden');
  }

  function closeLocationModal(){
    const modal=document.getElementById('locationModal');
    if(modal)modal.classList.add('hidden');
    if(trackingTimer){clearInterval(trackingTimer);trackingTimer=null}
    trackingBookingId=null;
  }
  window.closeLocationModal=closeLocationModal;

  async function sendPosition(position,force=false){
    if(!sharing||!loggedIn()||isDemo)return;
    const now=Date.now();
    if(!force&&now-lastSentAt<MIN_SEND_MS)return;
    lastSentAt=now;
    lastPosition=position;
    await api('/location/me',{
      method:'POST',
      body:JSON.stringify({
        latitude:position.coords.latitude,
        longitude:position.coords.longitude,
        accuracy:position.coords.accuracy||0
      })
    });
    setLocationButton();
  }

  function startWatch(){
    if(watchId!==null||!sharing||isDemo)return;
    if(!navigator.geolocation){sharing=false;setLocationButton();return toast('GPS is not supported on this device')}
    watchId=navigator.geolocation.watchPosition(
      p=>sendPosition(p).catch(()=>{}),
      err=>{console.warn('Location watch error',err)},
      {enableHighAccuracy:true,maximumAge:3000,timeout:15000}
    );
  }

  async function startLocationSharing(){
    if(isDemo)return toast('Live GPS needs Server mode');
    if(!navigator.geolocation)return toast('GPS is not supported on this device');
    if(!secureEnough())return toast('GPS needs HTTPS. Use your ngrok HTTPS URL.');

    const button=document.getElementById('startLocationButton');
    if(button){button.disabled=true;button.textContent='Getting GPS…'}

    navigator.geolocation.getCurrentPosition(async position=>{
      try{
        sharing=true;
        lastPosition=position;
        await sendPosition(position,true);
        startWatch();
        toast('📍 Live location sharing is on');
        openLocationSettings();
      }catch(err){
        sharing=false;
        toast(err.message||'Could not enable location sharing');
        openLocationSettings();
      }
    },err=>{
      sharing=false;
      setLocationButton();
      toast(getGeoError(err));
      openLocationSettings();
    },{enableHighAccuracy:true,maximumAge:0,timeout:15000});
  }
  window.startLocationSharing=startLocationSharing;

  async function stopLocationSharing(){
    if(watchId!==null){navigator.geolocation.clearWatch(watchId);watchId=null}
    sharing=false;
    lastPosition=null;
    setLocationButton();
    if(!isDemo&&loggedIn()){
      try{await api('/location/me',{method:'DELETE'})}catch(e){}
    }
    toast('Location sharing stopped');
    openLocationSettings();
  }
  window.stopLocationSharing=stopLocationSharing;

  async function openLocationSettings(){
    if(!loggedIn())return;
    let status={sharingEnabled:sharing};
    if(!isDemo){
      try{status=(await api('/location/me')).data||status}catch(e){}
    }
    sharing=Boolean(status.sharingEnabled);
    if(sharing)startWatch();
    setLocationButton();

    const roleText=state.role==='WORKER'
      ? 'When enabled, nearby users can see your distance, not your exact GPS. Exact live location is shared only with your assigned customer during an active booking.'
      : 'When enabled, SevaHub can calculate nearby worker distance. Exact live location is shared only with your assigned worker during an active booking.';

    showModal('📍 Location sharing',roleText,`
      <div class="location-status ${sharing?'on':'off'}">
        <b>${sharing?'● Live location is ON':'○ Location sharing is OFF'}</b>
        <span>${sharing&&status.updatedAt?`Last update ${ageText(status.updatedAt)}`:'You control when GPS is shared.'}</span>
      </div>
      <div class="location-privacy-note">
        <b>Privacy:</b> SevaHub stores only your latest location, not a route/history. Nearby discovery exposes distance only. Precise GPS is limited to both sides of an accepted/in-progress booking.
      </div>
      <div class="tabs">
        ${sharing
          ?'<button class="btn danger" type="button" onclick="stopLocationSharing()">Stop sharing</button>'
          :'<button id="startLocationButton" class="btn" type="button" onclick="startLocationSharing()">📍 Use my live location</button>'}
      </div>`);
  }
  window.openLocationSettings=openLocationSettings;

  async function decorateNearbyWorkers(serviceId){
    if(isDemo||state.role!=='USER')return;
    const panel=document.querySelector('#userContent > .panel');
    const grid=panel?.querySelector('.grid');
    if(!panel||!grid)return;

    if(!sharing||!lastPosition){
      if(!panel.querySelector('.nearby-location-callout')){
        const callout=document.createElement('div');
        callout.className='nearby-location-callout';
        callout.innerHTML=`<span>📍 Turn on Location to see which professionals are closest to you.</span><button class="btn small" type="button" onclick="openLocationSettings()">Enable location</button>`;
        grid.before(callout);
      }
      return;
    }

    try{
      const p=lastPosition.coords;
      const result=await api(`/location/nearby-workers?serviceId=${Number(serviceId)}&lat=${encodeURIComponent(p.latitude)}&lng=${encodeURIComponent(p.longitude)}&radiusKm=50`);
      const map=new Map((result.data||[]).map(x=>[Number(x.workerId),x]));
      const cards=[...grid.querySelectorAll('.worker-card[data-worker-id]')];
      cards.forEach(card=>{
        card.querySelector('.worker-distance')?.remove();
        const id=Number(card.dataset.workerId);
        const loc=map.get(id);
        if(loc){
          const badge=document.createElement('div');
          badge.className='worker-distance';
          badge.innerHTML=`📍 <b>${loc.distanceKm<1?`${Math.round(loc.distanceKm*1000)} m`:`${loc.distanceKm.toFixed(1)} km`}</b> away <span>· updated ${ageText(loc.updatedAt)}</span>`;
          const heading=card.querySelector('.split');
          if(heading)heading.after(badge);else card.prepend(badge);
          card.dataset.distance=String(loc.distanceKm);
        }else card.dataset.distance='999999';
      });
      cards.sort((a,b)=>Number(a.dataset.distance)-Number(b.dataset.distance)).forEach(c=>grid.appendChild(c));
    }catch(e){console.warn('Nearby worker distance unavailable',e)}
  }

  function addWorkerDataAttribute(){
    try{
      if(typeof workerHTML!=='function'||workerHTML.__locationWrapped)return;
      const original=workerHTML;
      workerHTML=function(w,sid){
        const html=original(w,sid);
        const id=Number(w.worker_id??w.id??0);
        return html.replace('<div class="card worker-card"',`<div class="card worker-card" data-worker-id="${id}"`);
      };
      workerHTML.__locationWrapped=true;
    }catch(e){}
  }

  function wrapShowWorkers(){
    try{
      if(typeof showWorkers!=='function'||showWorkers.__locationWrapped)return;
      const original=showWorkers;
      showWorkers=async function(serviceId){
        const result=await original.apply(this,arguments);
        await decorateNearbyWorkers(Number(serviceId));
        return result;
      };
      showWorkers.__locationWrapped=true;
    }catch(e){}
  }

  function bookingCard(container,bookingId,worker=false){
    const cards=[...container.querySelectorAll(worker?'.offer':'.card.panel')];
    return cards.find(card=>{
      const text=card.textContent||'';
      return worker?new RegExp(`(^|\\s)#?${bookingId}(\\s|·|$)`).test(text):text.includes(`Booking #${bookingId}`);
    });
  }

  async function addTrackingButtons(role){
    if(isDemo||!loggedIn())return;
    const container=document.getElementById(role==='WORKER'?'workerContent':'userContent');
    if(!container)return;
    try{
      const rows=(await api('/bookings')).data||[];
      rows.filter(b=>['ACCEPTED','IN_PROGRESS'].includes(b.status)).forEach(b=>{
        const card=bookingCard(container,b.id,role==='WORKER');
        if(!card||card.querySelector('.live-location-btn'))return;
        const actions=card.querySelector('.tabs.top-space')||card.querySelector('.tabs')||card;
        const btn=document.createElement('button');
        btn.type='button';
        btn.className='btn secondary small live-location-btn';
        btn.textContent='📍 Live location';
        btn.onclick=()=>openBookingLocation(Number(b.id));
        actions.appendChild(btn);
      });
    }catch(e){}
  }

  function wrapBookingViews(){
    try{
      if(typeof userBookings==='function'&&!userBookings.__locationWrapped){
        const original=userBookings;
        userBookings=async function(){
          const r=await original.apply(this,arguments);
          await addTrackingButtons('USER');
          return r;
        };
        userBookings.__locationWrapped=true;
      }
    }catch(e){}
    try{
      if(typeof loadWorkerBookingsLive==='function'&&!loadWorkerBookingsLive.__locationWrapped){
        const original=loadWorkerBookingsLive;
        loadWorkerBookingsLive=async function(){
          const r=await original.apply(this,arguments);
          await addTrackingButtons('WORKER');
          return r;
        };
        loadWorkerBookingsLive.__locationWrapped=true;
      }
    }catch(e){}
  }

  function locationPersonCard(icon,label,p){
    if(!p?.sharing){
      return `<div class="location-person"><div class="location-person-icon">${icon}</div><div><b>${escapeHtml(p?.name||label)}</b><p class="muted">Location sharing is off.</p></div></div>`;
    }
    const mapUrl=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.latitude+','+p.longitude)}`;
    return `<div class="location-person">
      <div class="location-person-icon">${icon}</div>
      <div class="location-person-main"><b>${escapeHtml(p.name||label)}</b>
        <p class="${p.isLive?'location-live':'muted'}">${p.isLive?'● Live':'Last location'} · ${ageText(p.updatedAt)} · accuracy ~${Math.round(Number(p.accuracy||0))} m</p>
        <a class="btn secondary small location-map-link" href="${mapUrl}" target="_blank" rel="noopener">Open in Maps ↗</a>
      </div>
    </div>`;
  }

  async function refreshBookingLocation(){
    if(!trackingBookingId)return;
    try{
      const data=(await api(`/location/booking/${trackingBookingId}`)).data;
      const body=document.getElementById('locationModalBody');
      if(!body)return;
      const distance=data.distanceKm==null?'Waiting for both sides to share GPS':data.distanceKm<1?`${Math.round(data.distanceKm*1000)} m apart`:`${data.distanceKm.toFixed(2)} km apart`;
      body.innerHTML=`
        <div class="tracking-distance"><span>Current straight-line distance</span><b>${distance}</b><small>Updates automatically while this screen is open.</small></div>
        <div class="location-people">
          ${locationPersonCard('🏠','Customer',data.customer)}
          ${locationPersonCard('🧰','Worker',data.worker)}
        </div>
        ${!sharing?'<div class="nearby-location-callout"><span>Your own GPS sharing is off.</span><button class="btn small" type="button" onclick="startLocationSharing()">Share my location</button></div>':''}
        <p class="location-disclaimer">For privacy, exact tracking is available only to the assigned customer and worker while the booking is accepted or in progress.</p>`;
    }catch(e){
      const body=document.getElementById('locationModalBody');
      if(body)body.innerHTML=`<div class="empty">${escapeHtml(e.message)}</div>`;
    }
  }

  async function openBookingLocation(bookingId){
    trackingBookingId=Number(bookingId);
    showModal('📍 Live booking location',`Booking #${trackingBookingId}`,'<div class="empty">Getting live GPS…</div>');
    await refreshBookingLocation();
    if(trackingTimer)clearInterval(trackingTimer);
    trackingTimer=setInterval(refreshBookingLocation,5000);
  }
  window.openBookingLocation=openBookingLocation;

  function bindLocationSocket(){
    if(isDemo||!loggedIn()||!window.io||locationSocket)return;
    try{
      locationSocket=window.io({transports:['websocket','polling']});
      locationSocket.on('connect',()=>locationSocket.emit('join-user-room',state.user.id));
      locationSocket.on('location-updated',payload=>{
        if(Number(payload?.bookingId)===Number(trackingBookingId))refreshBookingLocation();
      });
      locationSocket.on('location-sharing-stopped',payload=>{
        if(Number(payload?.bookingId)===Number(trackingBookingId))refreshBookingLocation();
      });
    }catch(e){}
  }

  async function restoreLocationState(){
    if(!loggedIn()||isDemo)return;
    try{
      const data=(await api('/location/me')).data||{};
      sharing=Boolean(data.sharingEnabled);
      if(sharing){
        startWatch();
        navigator.geolocation?.getCurrentPosition(p=>{lastPosition=p;sendPosition(p,true).catch(()=>{})},()=>{}, {enableHighAccuracy:true,maximumAge:5000,timeout:8000});
      }
      setLocationButton();
    }catch(e){}
  }

  addWorkerDataAttribute();
  wrapShowWorkers();
  wrapBookingViews();

  const observer=new MutationObserver(()=>{
    injectNavButton();
    if(loggedIn())bindLocationSocket();
  });
  observer.observe(document.getElementById('app')||document.body,{childList:true,subtree:true});

  setTimeout(()=>{
    injectNavButton();
    restoreLocationState();
    bindLocationSocket();
  },0);

  try{
    if(typeof logout==='function'){
      const originalLogout=logout;
      logout=function(){
        if(watchId!==null){navigator.geolocation?.clearWatch(watchId);watchId=null}
        sharing=false;
        if(locationSocket){try{locationSocket.disconnect()}catch(e){}locationSocket=null}
        if(!isDemo&&loggedIn())api('/location/me',{method:'DELETE'}).catch(()=>{});
        return originalLogout.apply(this,arguments);
      };
    }
  }catch(e){}
})();
