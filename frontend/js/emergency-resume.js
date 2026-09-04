/* Restores an active AI + GPS Instant search after a page reload. */
(function(){
  const originalOpen=window.openEmergencyBooking;
  let resumeId=null;
  let timer=null;
  let patchTimer=null;

  function role(){try{return typeof state!=='undefined'?state?.role:null}catch(e){return null}}
  function safe(v=''){try{return typeof esc==='function'?esc(v):String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}catch(e){return String(v)}}
  function clear(){if(timer){clearInterval(timer);timer=null}}
  function root(){let r=document.getElementById('emergencyModal');if(!r){r=document.createElement('div');r.id='emergencyModal';r.className='emergency-modal';document.body.appendChild(r)}return r}
  function closeResume(){clear();resumeId=null;document.getElementById('emergencyModal')?.remove()}
  window.closeEmergencyResume=closeResume;

  function shell(body,title='Finding a Worker'){
    root().innerHTML=`<section class="emergency-card" role="dialog" aria-modal="true"><div class="emergency-head"><div><div class="emergency-brand">SEVAHUB AI + GPS</div><h2>⚡ ${safe(title)}</h2><p class="muted">Restored from your active Instant search.</p></div><button class="btn secondary small" type="button" onclick="closeEmergencyResume()">✕</button></div>${body}</section>`;
  }

  async function refresh(){
    if(!resumeId)return;
    try{
      const d=(await api(`/emergency/requests/${resumeId}`)).data;
      if(d.status==='SEARCHING'){
        const left=Math.max(0,Math.ceil((new Date(d.expiresAt).getTime()-Date.now())/1000));
        shell(`<div class="emergency-search"><div class="emergency-pulse">⚡</div><h2>Searching for ${safe(d.serviceName)}</h2><p class="muted">Your AI + GPS search continued on the server while the page reloaded.</p><div class="emergency-stats"><div class="emergency-stat"><b>${Number(d.reachedWorkers||0)}</b><span>workers reached</span></div><div class="emergency-stat"><b>${Number(d.eligibleWorkers||0)}</b><span>eligible nearby</span></div><div class="emergency-stat"><b>${left}s</b><span>remaining</span></div></div><div class="tabs"><button class="btn danger" type="button" onclick="cancelResumedEmergency()">Cancel search</button></div></div>`);
        return;
      }
      clear();
      if(d.status==='MATCHED'){
        shell(`<div class="emergency-match"><div class="match-icon">✅</div><h2>${safe(d.workerName||'Worker')} matched</h2><p><b>${safe(d.serviceName)}</b>${d.matchedPrice==null?'':` · ₹${Number(d.matchedPrice).toLocaleString('en-IN')}`}${d.matchedDistanceKm==null?'':` · 📍 ${Number(d.matchedDistanceKm)<1?`${Math.round(Number(d.matchedDistanceKm)*1000)} m`:`${Number(d.matchedDistanceKm).toFixed(1)} km`}`}</p><p class="muted">Booking #${Number(d.matchedBookingId)} is confirmed.</p><button class="btn" type="button" onclick="openResumedMatchedBooking()">Open My Bookings</button></div>`,'Worker Found');
      }else{
        shell('<div class="emergency-search"><h2>Instant search ended</h2><p class="muted">No worker was matched in this search window.</p><button class="btn" type="button" onclick="startNewEmergencyAfterResume()">Start a new search</button></div>','Search Ended');
      }
    }catch(e){clear();shell(`<div class="error">${safe(e.message)}</div><button class="btn secondary" type="button" onclick="startNewEmergencyAfterResume()">Start again</button>`,'Instant Search')}
  }

  async function cancelResumedEmergency(){
    if(!resumeId)return closeResume();
    try{await api(`/emergency/requests/${resumeId}/cancel`,{method:'POST'});if(typeof toast==='function')toast('Instant search cancelled');closeResume()}catch(e){if(typeof toast==='function')toast(e.message)}
  }
  window.cancelResumedEmergency=cancelResumedEmergency;
  window.openResumedMatchedBooking=function(){closeResume();try{if(typeof userBookings==='function')userBookings()}catch(e){}};
  window.startNewEmergencyAfterResume=function(){closeResume();if(typeof originalOpen==='function')originalOpen()};

  async function openWithRecovery(){
    if(role()!=='USER'||typeof api!=='function')return typeof originalOpen==='function'&&originalOpen();
    try{
      const active=(await api('/emergency/active')).data;
      if(active?.requestId){
        resumeId=Number(active.requestId);shell('<div class="emergency-search"><div class="emergency-pulse">⚡</div><h2>Resuming active search…</h2></div>');await refresh();clear();timer=setInterval(refresh,3000);return;
      }
    }catch(e){}
    if(typeof originalOpen==='function')return originalOpen();
  }
  window.openEmergencyBooking=openWithRecovery;

  function patchNav(){
    const btn=document.getElementById('emergencyNavButton');
    if(btn&&role()==='USER'&&btn.onclick!==openWithRecovery)btn.onclick=openWithRecovery;
  }
  const app=document.getElementById('app')||document.body;
  new MutationObserver(()=>{clearTimeout(patchTimer);patchTimer=setTimeout(patchNav,60)}).observe(app,{childList:true,subtree:true});
  setTimeout(patchNav,160);
})();
