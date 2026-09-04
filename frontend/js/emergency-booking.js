/* SevaHub AI + GPS Instant Booking UI. */
(function(){
  let draft=null;
  let activeRequestId=null;
  let pollTimer=null;
  let socket=null;
  let workerView=false;
  let injectTimer=null;

  function role(){try{return typeof state!=='undefined'?state?.role:null}catch(e){return null}}
  function user(){try{return typeof state!=='undefined'?state?.user:null}catch(e){return null}}
  function liveMode(){try{return typeof isDemo==='undefined'||!isDemo}catch(e){return true}}
  function safe(v=''){try{return typeof esc==='function'?esc(v):String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}catch(e){return String(v)}}
  function rupee(v){try{return typeof money==='function'?money(v):`₹${Number(v||0).toLocaleString('en-IN')}`}catch(e){return `₹${Number(v||0)}`}}

  function clearPoll(){if(pollTimer){clearInterval(pollTimer);pollTimer=null}}
  function removeModal(){clearPoll();document.getElementById('emergencyModal')?.remove()}
  window.closeEmergencyBooking=removeModal;

  function modalRoot(){
    let root=document.getElementById('emergencyModal');
    if(root)return root;
    root=document.createElement('div');
    root.id='emergencyModal';
    root.className='emergency-modal';
    root.addEventListener('click',e=>{if(e.target===root)removeModal()});
    document.body.appendChild(root);
    return root;
  }

  function cardShell(body,title='AI Instant Booking'){
    const root=modalRoot();
    root.innerHTML=`<section class="emergency-card" role="dialog" aria-modal="true" aria-label="${safe(title)}">
      <div class="emergency-head"><div><div class="emergency-brand">SEVAHUB AI + GPS</div><h2>⚡ ${safe(title)}</h2><p class="muted">Urgent household and community services, matched using fresh GPS.</p></div><button class="btn secondary small" type="button" onclick="closeEmergencyBooking()">✕</button></div>
      ${body}
    </section>`;
    return root.querySelector('.emergency-card');
  }

  function serviceOptions(selected){
    try{return services.map(s=>`<option value="${Number(s.id)}" ${Number(s.id)===Number(selected)?'selected':''}>${safe(s.icon||'🛠️')} ${safe(s.name)} · ${rupee(s.base_price)}</option>`).join('')}catch(e){return ''}
  }

  function openEmergencyBooking(){
    if(role()!=='USER')return typeof toast==='function'&&toast('Instant Booking is for customer accounts.');
    if(!liveMode())return typeof toast==='function'&&toast('AI Instant Booking needs Server mode.');
    activeRequestId=null;clearPoll();
    const old=draft||{};
    cardShell(`<div class="emergency-alert"><b>Not for medical, police or fire emergencies.</b> Use this for urgent SevaHub household services such as plumbing, electrical, AC, appliance, cleaning or repair work.</div>
      <form class="emergency-form" onsubmit="analyseEmergency(event)">
        <div class="field"><label>What happened?</label><textarea id="emergencyProblem" maxlength="1200" required placeholder="Example: Kitchen sink pipe is leaking badly and I need a plumber now.">${safe(old.problem||'')}</textarea></div>
        <div class="field"><label>Address / landmark for the worker</label><input id="emergencyAddress" maxlength="1000" required placeholder="House / block / landmark" value="${safe(old.address||'')}"></div>
        <div class="field"><label>Payment method</label><select id="emergencyPayment"><option>Cash</option><option>UPI</option><option>Card</option></select></div>
        <button class="btn" type="submit">🤖 Analyse problem with AI</button>
      </form>`);
  }
  window.openEmergencyBooking=openEmergencyBooking;

  async function analyseEmergency(e){
    e.preventDefault();
    const problem=document.getElementById('emergencyProblem')?.value.trim()||'';
    const address=document.getElementById('emergencyAddress')?.value.trim()||'';
    const paymentMethod=document.getElementById('emergencyPayment')?.value||'Cash';
    if(problem.length<5)return toast('Problem thoda detail me batao.');
    if(address.length<3)return toast('Worker ke liye address ya landmark add karo.');
    const btn=e.target.querySelector('button[type=submit]');
    try{
      btn.disabled=true;btn.textContent='🤖 AI is analysing…';
      const result=await api('/emergency/analyse',{method:'POST',body:JSON.stringify({problem})});
      const a=result.data;
      draft={problem,address,paymentMethod,analysis:a};
      cardShell(`<div class="emergency-ai-result"><div class="emergency-brand">AI SERVICE DETECTION</div><div class="big">🤖 ${safe(a.serviceName)}</div><p>${safe(a.note||'AI selected the most suitable SevaHub service.')}</p><small class="muted">Detection source: ${safe(a.classificationSource)}</small></div>
        <div class="field"><label>Confirm service</label><select id="emergencyServiceConfirm">${serviceOptions(a.serviceId)}</select></div>
        <div class="emergency-alert">Next, SevaHub gets a <b>fresh high-accuracy GPS fix</b>, filters only verified/available workers with fresh GPS, then contacts the nearest eligible workers in waves. The first valid worker to accept gets the booking.</div>
        <div class="tabs"><button class="btn" type="button" onclick="startEmergencySearch()">📍 Confirm & find nearest workers</button><button class="btn secondary" type="button" onclick="openEmergencyBooking()">Edit details</button></div>`,'Confirm AI Match');
    }catch(err){toast(err.message)}finally{if(btn){btn.disabled=false;btn.textContent='🤖 Analyse problem with AI'}}
  }
  window.analyseEmergency=analyseEmergency;

  function freshGps(){
    return new Promise((resolve,reject)=>{
      if(!navigator.geolocation)return reject(new Error('GPS is not supported on this device.'));
      navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,maximumAge:0,timeout:20000});
    });
  }

  async function syncFreshGps(){
    const p=await freshGps();
    const acc=Number(p?.coords?.accuracy||9999);
    if(!Number.isFinite(acc)||acc>500)throw new Error(`GPS fix is still weak (~${Math.round(acc)} m). Turn on Precise Location and move near a window/open area, then retry.`);
    await api('/location/me',{method:'POST',body:JSON.stringify({latitude:Number(p.coords.latitude),longitude:Number(p.coords.longitude),accuracy:acc,capturedAt:new Date(Number(p.timestamp)||Date.now()).toISOString()})});
    return {accuracy:acc,latitude:Number(p.coords.latitude),longitude:Number(p.coords.longitude)};
  }

  async function startEmergencySearch(){
    if(!draft?.analysis)return openEmergencyBooking();
    const selected=Number(document.getElementById('emergencyServiceConfirm')?.value||draft.analysis.serviceId);
    const card=cardShell(`<div class="emergency-search"><div class="emergency-pulse">📍</div><h2>Locking precise GPS…</h2><p class="muted">Fresh device location is required before AI can search nearby workers.</p></div>`,'Starting Instant Search');
    try{
      const gps=await syncFreshGps();
      card.innerHTML=`<div class="emergency-head"><div><div class="emergency-brand">SEVAHUB AI + GPS</div><h2>⚡ Starting Instant Search</h2></div><button class="btn secondary small" type="button" onclick="closeEmergencyBooking()">✕</button></div><div class="emergency-gps"><b>✓ Fresh GPS locked</b><span>accuracy ~${Math.round(gps.accuracy)} m</span></div><div class="emergency-search"><div class="emergency-pulse">🤖</div><h2>AI is finding nearby eligible workers…</h2></div>`;
      const result=await api('/emergency/requests',{method:'POST',body:JSON.stringify({problem:draft.problem,address:draft.address,paymentMethod:draft.paymentMethod,serviceId:selected,classificationSource:draft.analysis.classificationSource})});
      activeRequestId=Number(result.data.requestId);
      renderSearchState(result.data);
      clearPoll();pollTimer=setInterval(refreshEmergencyStatus,3000);
    }catch(err){
      cardShell(`<div class="error">${safe(err.message)}</div><div class="tabs top-space"><button class="btn" type="button" onclick="startEmergencySearch()">Retry GPS / Search</button><button class="btn secondary" type="button" onclick="openEmergencyBooking()">Edit details</button></div>`,'Instant Search');
    }
  }
  window.startEmergencySearch=startEmergencySearch;

  function renderSearchState(data){
    const expires=data.expiresAt?new Date(data.expiresAt).getTime():Date.now()+90000;
    const left=Math.max(0,Math.ceil((expires-Date.now())/1000));
    cardShell(`<div class="emergency-search"><div class="emergency-pulse">⚡</div><div class="emergency-brand">AI + GEOLOCATION MATCHING</div><h2>Searching for ${safe(data.serviceName||draft?.analysis?.serviceName||'a professional')}</h2><p class="muted">Fresh GPS distance is authoritative. AI identified the service; SevaHub is contacting the nearest verified, available workers first.</p>
      <div class="emergency-stats"><div class="emergency-stat"><b>${Number(data.reachedWorkers??data.notifiedNow??0)}</b><span>workers reached</span></div><div class="emergency-stat"><b>${Number(data.eligibleWorkers||0)}</b><span>eligible nearby</span></div><div class="emergency-stat"><b>${left}s</b><span>search window</span></div></div>
      <div class="emergency-gps"><b>📍 GPS ready</b><span>~${Math.round(Number(data.gpsAccuracy||0))} m accuracy</span></div>
      <div class="tabs top-space"><button class="btn danger" type="button" onclick="cancelEmergencySearch()">Cancel search</button></div></div>`,'Finding a Worker');
  }

  async function refreshEmergencyStatus(){
    if(!activeRequestId)return;
    try{
      const result=await api(`/emergency/requests/${activeRequestId}`);
      const d=result.data;
      if(d.status==='SEARCHING'){renderSearchState(d);return}
      clearPoll();
      if(d.status==='MATCHED'){
        cardShell(`<div class="emergency-match"><div class="match-icon">✅</div><div class="emergency-brand">AI + GPS MATCH COMPLETE</div><h2>${safe(d.workerName||'Worker')} matched</h2><p><b>${safe(d.serviceName)}</b> · ${d.workerRating?`⭐ ${Number(d.workerRating).toFixed(1)} · `:''}${Number(d.workerExperience||0)} yr experience</p><p class="muted">Booking #${Number(d.matchedBookingId)} is confirmed. Chat, live GPS, completion OTP and payment continue through the normal secure booking flow.</p><div class="tabs"><button class="btn" type="button" onclick="openMatchedEmergencyBooking()">Open My Bookings</button><button class="btn secondary" type="button" onclick="closeEmergencyBooking()">Close</button></div></div>`,'Worker Found');
      }else{
        cardShell(`<div class="emergency-search"><div style="font-size:38px">📍</div><h2>No eligible worker accepted in time</h2><p class="muted">The search only used verified workers with fresh GPS inside their service radius. You can retry for a new 90-second search.</p><div class="tabs"><button class="btn" type="button" onclick="startEmergencySearch()">Retry search</button><button class="btn secondary" type="button" onclick="openEmergencyBooking()">Change problem/service</button></div></div>`,'Search Ended');
      }
    }catch(err){console.warn('Instant request status unavailable',err)}
  }

  async function cancelEmergencySearch(){
    if(!activeRequestId)return removeModal();
    try{await api(`/emergency/requests/${activeRequestId}/cancel`,{method:'POST'});activeRequestId=null;clearPoll();toast('Instant search cancelled');removeModal()}catch(err){toast(err.message)}
  }
  window.cancelEmergencySearch=cancelEmergencySearch;

  function openMatchedEmergencyBooking(){removeModal();try{if(typeof userBookings==='function')userBookings()}catch(e){}}
  window.openMatchedEmergencyBooking=openMatchedEmergencyBooking;

  async function openInstantJobs(){
    if(role()!=='WORKER')return;
    workerView=true;clearPoll();
    const box=document.getElementById('workerContent');if(!box)return;
    box.innerHTML='<div class="card panel"><div class="empty">Loading Instant Jobs…</div></div>';
    await refreshInstantJobs();
  }
  window.openInstantJobs=openInstantJobs;

  async function refreshInstantJobs(){
    if(role()!=='WORKER'||!workerView)return;
    const box=document.getElementById('workerContent');if(!box)return;
    try{
      const [availability,offers]=await Promise.all([api('/emergency/worker/availability'),api('/emergency/worker/offers')]);
      const a=availability.data||{},rows=offers.data||[];
      box.innerHTML=`<div class="card panel instant-jobs-marker"><div class="instant-worker-panel"><div class="instant-top"><div><div class="emergency-brand">AI + GPS INSTANT JOBS</div><h2>⚡ Instant Jobs</h2><p class="muted">Only fresh GPS, verified service matches and workers without an active job are eligible.</p></div><button class="btn ${a.instantAvailable?'danger':'secondary'} small" type="button" onclick="toggleInstantAvailability(${a.instantAvailable?'false':'true'})">${a.instantAvailable?'Pause Instant Jobs':'Go Available'}</button></div><div class="emergency-gps"><b>${a.gpsReady?'✓ GPS ready':'⚠ GPS not ready'}</b><span>${a.gpsReady?`accuracy ~${Math.round(Number(a.gpsAccuracy||0))} m`:safe(a.gpsMessage||'Enable live location')}</span>${!a.gpsReady?'<button class="btn secondary small" type="button" onclick="openLocationSettings()">Open Location</button>':''}</div></div>
        <div class="split"><h2>Nearby urgent requests</h2><button class="btn secondary small" type="button" onclick="refreshInstantJobs()">↻ Refresh</button></div>
        ${rows.length?rows.map(instantOfferHtml).join(''):'<div class="empty">No active Instant Job offer right now. Keep GPS and Instant Jobs on to receive nearby requests.</div>'}</div>`;
      if(!pollTimer)pollTimer=setInterval(()=>{if(document.querySelector('.instant-jobs-marker'))refreshInstantJobs();else{workerView=false;clearPoll()}},5000);
    }catch(err){box.innerHTML=`<div class="card panel"><div class="error">${safe(err.message)}</div></div>`}
  }
  window.refreshInstantJobs=refreshInstantJobs;

  function instantOfferHtml(o){
    return `<article class="instant-offer"><div class="emergency-brand">⚡ URGENT REQUEST #${Number(o.requestId)}</div><h3>${safe(o.serviceName)}</h3><p>${safe(o.problem)}</p><div class="instant-offer-meta"><span class="instant-chip">📍 ${Number(o.distanceKm)<1?`${Math.round(Number(o.distanceKm)*1000)} m`:`${Number(o.distanceKm).toFixed(1)} km`} away</span><span class="instant-chip">Starting ${rupee(o.price)}</span></div><p class="muted">Exact customer address becomes part of the confirmed booking only after you accept.</p><div class="tabs"><button class="btn" type="button" onclick="acceptInstantJob(${Number(o.requestId)})">Accept Now</button><button class="btn secondary" type="button" onclick="declineInstantJob(${Number(o.requestId)})">Decline</button></div></article>`;
  }

  async function toggleInstantAvailability(value){
    try{await api('/emergency/worker/availability',{method:'PUT',body:JSON.stringify({available:Boolean(value)})});toast(value?'⚡ Instant Jobs enabled':'Instant Jobs paused');await refreshInstantJobs()}catch(err){toast(err.message)}
  }
  window.toggleInstantAvailability=toggleInstantAvailability;

  async function acceptInstantJob(requestId){
    try{
      const result=await api(`/emergency/worker/offers/${Number(requestId)}/accept`,{method:'POST'});
      toast(`✅ Instant Booking #${Number(result.data.bookingId)} confirmed`);
      workerView=false;clearPoll();
      if(typeof workerBookings==='function')workerBookings();
    }catch(err){toast(err.message);await refreshInstantJobs()}
  }
  window.acceptInstantJob=acceptInstantJob;

  async function declineInstantJob(requestId){
    try{await api(`/emergency/worker/offers/${Number(requestId)}/decline`,{method:'POST'});toast('Instant offer declined');await refreshInstantJobs()}catch(err){toast(err.message)}
  }
  window.declineInstantJob=declineInstantJob;

  function injectControls(){
    if(!user())return;
    const navActions=document.querySelector('.nav .nav-actions');
    if(navActions&&!document.getElementById('emergencyNavButton')){
      const btn=document.createElement('button');btn.id='emergencyNavButton';btn.type='button';btn.className='theme emergency-nav-btn';
      if(role()==='USER'){btn.innerHTML='⚡ <span>Instant</span>';btn.onclick=openEmergencyBooking;btn.title='AI + GPS Instant Booking'}
      else if(role()==='WORKER'){btn.innerHTML='⚡ <span>Instant Jobs</span>';btn.onclick=openInstantJobs;btn.title='Nearby urgent service requests'}
      if(btn.onclick)navActions.insertBefore(btn,navActions.firstChild);
    }
    if(role()==='USER'){
      const box=document.getElementById('userContent');
      const panel=box?.querySelector(':scope > .card.panel');
      const heading=panel?.querySelector('h2');
      if(panel&&heading&&/popular services/i.test(heading.textContent||'')&&!panel.querySelector('.emergency-services-cta')){
        const cta=document.createElement('div');cta.className='instant-worker-panel emergency-services-cta';
        cta.innerHTML='<div class="instant-top"><div><div class="emergency-brand">NEED HELP RIGHT NOW?</div><b>AI + GPS Instant Booking</b><p class="muted">Describe the problem. AI detects the service and GPS finds nearby verified workers.</p></div><button class="btn" type="button" onclick="openEmergencyBooking()">⚡ Book Now</button></div>';
        const grid=panel.querySelector('.grid');if(grid)grid.before(cta);else panel.appendChild(cta);
      }
    }
  }

  function bindSocket(){
    if(socket||!window.io||!user()||!liveMode())return;
    try{
      socket=window.io({transports:['websocket','polling']});
      socket.on('connect',()=>socket.emit('join-user-room',user().id));
      socket.on('emergency-offer',p=>{if(role()==='WORKER'){toast(`⚡ ${p.serviceName||'Instant job'} · ${Number(p.distanceKm||0).toFixed(1)} km`);if(workerView)refreshInstantJobs()}});
      socket.on('emergency-matched',p=>{if(role()==='USER'&&Number(p.requestId)===Number(activeRequestId))refreshEmergencyStatus()});
      socket.on('emergency-accepted',()=>{if(role()==='WORKER'&&workerView)refreshInstantJobs()});
    }catch(e){}
  }

  const app=document.getElementById('app')||document.body;
  const observer=new MutationObserver(()=>{clearTimeout(injectTimer);injectTimer=setTimeout(()=>{injectControls();bindSocket()},80)});
  observer.observe(app,{childList:true,subtree:true});
  setTimeout(()=>{injectControls();bindSocket()},120);
})();
