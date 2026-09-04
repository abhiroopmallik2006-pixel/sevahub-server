/* SevaHub desktop-safe Instant Booking location fallback.
   Keeps device GPS authoritative. If a desktop browser only provides coarse
   Wi-Fi/IP location, the user may explicitly provide an exact map coordinate. */
(function(){
  const originalAnalyse=window.analyseEmergency;
  const originalStart=window.startEmergencySearch;
  let lastDetails=null;
  let lastServiceId=null;
  let manualRequestId=null;
  let pollTimer=null;
  let patchTimer=null;

  function safe(v=''){
    try{return typeof esc==='function'?esc(v):String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}catch(e){return String(v)}
  }
  function clearPoll(){if(pollTimer){clearInterval(pollTimer);pollTimer=null}}
  function modal(){return document.getElementById('emergencyModal')}
  function card(){return modal()?.querySelector('.emergency-card')}

  if(typeof originalAnalyse==='function'){
    window.analyseEmergency=async function(e){
      try{
        lastDetails={
          problem:document.getElementById('emergencyProblem')?.value.trim()||'',
          address:document.getElementById('emergencyAddress')?.value.trim()||'',
          paymentMethod:document.getElementById('emergencyPayment')?.value||'Cash'
        };
      }catch(err){}
      return originalAnalyse.apply(this,arguments);
    };
  }

  if(typeof originalStart==='function'){
    window.startEmergencySearch=async function(){
      try{lastServiceId=Number(document.getElementById('emergencyServiceConfirm')?.value||0)||lastServiceId}catch(e){}
      return originalStart.apply(this,arguments);
    };
  }

  function parseCoordinates(raw){
    const text=String(raw||'').trim();
    if(!text)return null;
    let m=text.match(/@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/);
    if(!m)m=decodeURIComponent(text).match(/(?:q|query|destination)=(-?\d{1,2}(?:\.\d+)?)[,%20+ ]+(-?\d{1,3}(?:\.\d+)?)/i);
    if(!m)m=text.match(/(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)/);
    if(!m)return null;
    const latitude=Number(m[1]),longitude=Number(m[2]);
    if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||latitude<-90||latitude>90||longitude<-180||longitude>180)return null;
    return {latitude,longitude};
  }

  function openManualLocationFallback(){
    const root=modal();
    if(!root)return;
    root.innerHTML=`<section class="emergency-card" role="dialog" aria-modal="true" aria-label="Exact map location">
      <div class="emergency-head"><div><div class="emergency-brand">SEVAHUB AI + GEOLOCATION</div><h2>📌 Use exact map location</h2><p class="muted">Your desktop browser is only giving an approximate location. Do not use the 2 km estimate for nearest-worker matching.</p></div><button class="btn secondary small" type="button" onclick="closeEmergencyBooking()">✕</button></div>
      <div class="emergency-alert"><b>Accurate fallback:</b> open your location in Google Maps, copy a coordinate or Maps link, and paste it below. Example: <code>28.613939, 77.209021</code>.</div>
      <div class="field"><label>Exact coordinate or Google Maps link</label><input id="emergencyManualCoordinate" autocomplete="off" placeholder="28.613939, 77.209021 or Maps link"></div>
      <p class="muted">This manual pin is used only as the Instant Booking request point. Worker GPS still has to be fresh and accurate.</p>
      <div class="tabs"><button class="btn" type="button" onclick="useEmergencyManualCoordinate()">📌 Use this exact pin</button><button class="btn secondary" type="button" onclick="startEmergencySearch()">Retry device GPS</button></div>
    </section>`;
  }
  window.openEmergencyManualLocation=openManualLocationFallback;

  async function useManualCoordinate(){
    const parsed=parseCoordinates(document.getElementById('emergencyManualCoordinate')?.value);
    if(!parsed)return typeof toast==='function'&&toast('Valid latitude, longitude ya Google Maps link paste karo.');
    if(!lastDetails?.problem||!lastDetails?.address||!lastServiceId){
      if(typeof toast==='function')toast('Booking details missing. Edit details and analyse again.');
      return typeof window.openEmergencyBooking==='function'&&window.openEmergencyBooking();
    }
    const root=modal();
    if(root)root.innerHTML=`<section class="emergency-card"><div class="emergency-search"><div class="emergency-pulse">📌</div><h2>Using your exact map pin…</h2><p class="muted">Validating location and finding nearby eligible workers.</p></div></section>`;
    try{
      const now=new Date().toISOString();
      await api('/location/me',{method:'POST',body:JSON.stringify({
        latitude:parsed.latitude,
        longitude:parsed.longitude,
        accuracy:50,
        capturedAt:now
      })});
      const result=await api('/emergency/requests',{method:'POST',body:JSON.stringify({
        problem:lastDetails.problem,
        address:lastDetails.address,
        paymentMethod:lastDetails.paymentMethod,
        serviceId:Number(lastServiceId),
        classificationSource:'MANUAL_PIN'
      })});
      manualRequestId=Number(result.data.requestId);
      renderManualSearch(result.data);
      clearPoll();pollTimer=setInterval(refreshManualRequest,3000);
    }catch(err){
      if(root)root.innerHTML=`<section class="emergency-card"><div class="emergency-head"><div><div class="emergency-brand">SEVAHUB AI + GEOLOCATION</div><h2>⚡ Instant Search</h2></div><button class="btn secondary small" onclick="closeEmergencyBooking()">✕</button></div><div class="error">${safe(err.message)}</div><div class="tabs top-space"><button class="btn" onclick="openEmergencyManualLocation()">Try exact map pin again</button><button class="btn secondary" onclick="startEmergencySearch()">Retry device GPS</button></div></section>`;
    }
  }
  window.useEmergencyManualCoordinate=useManualCoordinate;

  function renderManualSearch(d){
    const root=modal();if(!root)return;
    const expires=d.expiresAt?new Date(d.expiresAt).getTime():Date.now()+90000;
    const left=Math.max(0,Math.ceil((expires-Date.now())/1000));
    root.innerHTML=`<section class="emergency-card"><div class="emergency-head"><div><div class="emergency-brand">SEVAHUB AI + MANUAL MAP PIN</div><h2>⚡ Finding a Worker</h2><p class="muted">Nearest-worker matching is using the exact pin you supplied, not the weak desktop estimate.</p></div><button class="btn secondary small" onclick="closeEmergencyBooking()">✕</button></div><div class="emergency-search"><div class="emergency-pulse">⚡</div><h2>Searching for ${safe(d.serviceName||'a professional')}</h2><div class="emergency-stats"><div class="emergency-stat"><b>${Number(d.reachedWorkers??d.notifiedNow??0)}</b><span>workers reached</span></div><div class="emergency-stat"><b>${Number(d.eligibleWorkers||0)}</b><span>eligible nearby</span></div><div class="emergency-stat"><b>${left}s</b><span>search window</span></div></div><div class="emergency-gps"><b>📌 Exact manual pin</b><span>Desktop GPS fallback</span></div><div class="tabs top-space"><button class="btn danger" onclick="cancelManualEmergency()">Cancel search</button></div></div></section>`;
  }

  async function refreshManualRequest(){
    if(!manualRequestId)return;
    try{
      const d=(await api(`/emergency/requests/${manualRequestId}`)).data;
      if(d.status==='SEARCHING')return renderManualSearch(d);
      clearPoll();
      if(d.status==='MATCHED'){
        const distance=d.matchedDistanceKm==null?'':` · 📍 ${Number(d.matchedDistanceKm)<1?`${Math.round(Number(d.matchedDistanceKm)*1000)} m`:`${Number(d.matchedDistanceKm).toFixed(1)} km`}`;
        const price=d.matchedPrice==null?'':` · ₹${Number(d.matchedPrice).toLocaleString('en-IN')}`;
        modal().innerHTML=`<section class="emergency-card"><div class="emergency-head"><div><div class="emergency-brand">AI + GEOLOCATION MATCH COMPLETE</div><h2>✅ Worker Found</h2></div><button class="btn secondary small" onclick="closeEmergencyBooking()">✕</button></div><div class="emergency-match"><h2>${safe(d.workerName||'Worker')} matched</h2><p><b>${safe(d.serviceName)}</b>${price}${distance}</p><p class="muted">Booking #${Number(d.matchedBookingId)} is confirmed. Continue with chat, live location, OTP and payment from My Bookings.</p><button class="btn" onclick="openManualMatchedBooking()">Open My Bookings</button></div></section>`;
      }else{
        modal().innerHTML=`<section class="emergency-card"><div class="emergency-search"><h2>No worker accepted in time</h2><p class="muted">Your exact map pin was used correctly, but no eligible nearby worker accepted this search.</p><button class="btn" onclick="openEmergencyManualLocation()">Try again</button></div></section>`;
      }
      manualRequestId=null;
    }catch(e){console.warn('Manual-pin Instant search refresh failed',e)}
  }

  async function cancelManualEmergency(){
    if(!manualRequestId)return;
    try{await api(`/emergency/requests/${manualRequestId}/cancel`,{method:'POST'});manualRequestId=null;clearPoll();if(typeof toast==='function')toast('Instant search cancelled');document.getElementById('emergencyModal')?.remove()}catch(e){if(typeof toast==='function')toast(e.message)}
  }
  window.cancelManualEmergency=cancelManualEmergency;
  window.openManualMatchedBooking=function(){manualRequestId=null;clearPoll();document.getElementById('emergencyModal')?.remove();try{if(typeof userBookings==='function')userBookings()}catch(e){}};

  function patchWeakGpsError(){
    const c=card();if(!c||c.querySelector('[data-manual-location-fallback]'))return;
    const text=(c.textContent||'').toLowerCase();
    if(!/gps fix is still weak|gps.*weak|not accurate enough/.test(text))return;
    const tabs=c.querySelector('.tabs')||c;
    const btn=document.createElement('button');
    btn.type='button';btn.className='btn secondary';btn.dataset.manualLocationFallback='1';
    btn.textContent='📌 Use exact map pin';btn.onclick=openManualLocationFallback;
    tabs.appendChild(btn);
    const note=document.createElement('p');note.className='muted';note.dataset.manualLocationFallback='1';
    note.textContent='Laptop location can be approximate because many laptops have no GPS chip. Exact map pin keeps nearest-worker matching accurate.';
    tabs.after(note);
  }

  const observer=new MutationObserver(()=>{clearTimeout(patchTimer);patchTimer=setTimeout(patchWeakGpsError,40)});
  observer.observe(document.body,{childList:true,subtree:true});
  setTimeout(patchWeakGpsError,100);
})();
