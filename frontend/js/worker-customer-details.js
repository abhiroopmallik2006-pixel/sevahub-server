/* Assigned-worker customer details: contact, booking address, and opt-in live GPS. */
(function(){
  let refreshTimer=null;
  let activeBookingId=null;
  const REQUEST_STATUSES=['PENDING','BARGAINING','COUNTER_OFFER_PENDING_USER'];

  function escapeHtml(v=''){
    try{return typeof esc==='function'?esc(v):String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}catch(e){return String(v)}
  }

  function ageText(value){
    if(!value)return '';
    const seconds=Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/1000));
    if(seconds<15)return 'just now';
    if(seconds<60)return `${seconds}s ago`;
    const minutes=Math.floor(seconds/60);
    return `${minutes} min ago`;
  }

  function ensureModal(){
    let root=document.getElementById('workerCustomerDetailsModal');
    if(root)return root;
    root=document.createElement('div');
    root.id='workerCustomerDetailsModal';
    root.className='location-modal hidden';
    root.innerHTML=`<div class="location-dialog worker-customer-dialog" role="dialog" aria-modal="true" aria-labelledby="workerCustomerTitle">
      <div class="split location-dialog-head">
        <div><h2 id="workerCustomerTitle">👤 Customer details</h2><p class="muted" id="workerCustomerSubtitle"></p></div>
        <button class="btn secondary small" type="button" id="workerCustomerClose">✕</button>
      </div>
      <div id="workerCustomerBody"></div>
    </div>`;
    document.body.appendChild(root);
    root.addEventListener('click',e=>{if(e.target===root)closeWorkerCustomerDetails()});
    root.querySelector('#workerCustomerClose').addEventListener('click',closeWorkerCustomerDetails);
    return root;
  }

  function closeWorkerCustomerDetails(){
    const modal=document.getElementById('workerCustomerDetailsModal');
    if(modal)modal.classList.add('hidden');
    if(refreshTimer){clearInterval(refreshTimer);refreshTimer=null}
    activeBookingId=null;
  }
  window.closeWorkerCustomerDetails=closeWorkerCustomerDetails;

  function phoneHref(phone){
    const cleaned=String(phone||'').replace(/[^0-9+]/g,'');
    return cleaned||'';
  }

  function customerLocationCard(customer){
    const name=escapeHtml(customer?.name||'Customer');
    const phone=customer?.phone?escapeHtml(customer.phone):'';
    const tel=phoneHref(customer?.phone);
    const phoneBlock=phone
      ? `<div class="worker-customer-contact"><span>📞 ${phone}</span>${tel?`<a class="btn secondary small" href="tel:${escapeHtml(tel)}">Call customer</a>`:''}</div>`
      : '<p class="muted">Phone number was not provided by this customer.</p>';

    if(!customer?.sharing){
      return `<div class="worker-customer-card">
        <div class="worker-customer-avatar">🏠</div>
        <div class="worker-customer-main"><h3>${name}</h3>${phoneBlock}<p class="muted">Live GPS sharing is currently off. Use the booking address below.</p></div>
      </div>`;
    }

    const mapUrl=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(customer.latitude+','+customer.longitude)}`;
    return `<div class="worker-customer-card">
      <div class="worker-customer-avatar">🏠</div>
      <div class="worker-customer-main">
        <h3>${name}</h3>
        ${phoneBlock}
        <p class="${customer.isLive?'location-live':'muted'}">${customer.isLive?'● Live GPS':'Last shared GPS'} · ${ageText(customer.updatedAt)} · accuracy ~${Math.round(Number(customer.accuracy||0))} m</p>
        <a class="btn secondary small" href="${mapUrl}" target="_blank" rel="noopener">📍 Open customer location in Maps ↗</a>
      </div>
    </div>`;
  }

  async function refreshCustomerDetails(){
    if(!activeBookingId)return;
    const body=document.getElementById('workerCustomerBody');
    if(!body)return;
    try{
      const data=(await api(`/location/booking/${activeBookingId}`)).data;
      const modal=ensureModal();
      modal.querySelector('#workerCustomerSubtitle').textContent=`Booking #${data.bookingId} · ${data.status}`;
      const address=data.bookingAddress?escapeHtml(data.bookingAddress):'';
      const addressMap=data.bookingAddress?`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.bookingAddress)}`:'';
      const requestState=REQUEST_STATUSES.includes(data.status);
      body.innerHTML=`
        <div class="worker-customer-status"><span class="pill">${escapeHtml(data.status)}</span><b>${requestState?'Booking customer':'Assigned customer'}</b></div>
        ${customerLocationCard(data.customer)}
        <div class="worker-booking-address">
          <span class="muted">Service address</span>
          <b>${address||'No address provided'}</b>
          ${addressMap?`<a class="btn secondary small" href="${addressMap}" target="_blank" rel="noopener">🗺 Open address in Maps ↗</a>`:''}
        </div>
        <p class="location-disclaimer">Customer contact and precise GPS are visible only to the worker assigned to this booking. GPS appears only while the customer has location sharing enabled.</p>`;
    }catch(e){
      body.innerHTML=`<div class="empty">${escapeHtml(e.message||'Could not load customer details')}</div>`;
    }
  }

  async function openWorkerCustomerDetails(bookingId){
    activeBookingId=Number(bookingId);
    const modal=ensureModal();
    modal.querySelector('#workerCustomerSubtitle').textContent=`Booking #${activeBookingId}`;
    modal.querySelector('#workerCustomerBody').innerHTML='<div class="empty">Loading customer details…</div>';
    modal.classList.remove('hidden');
    await refreshCustomerDetails();
    if(refreshTimer)clearInterval(refreshTimer);
    refreshTimer=setInterval(refreshCustomerDetails,5000);
  }
  window.openWorkerCustomerDetails=openWorkerCustomerDetails;

  function findBookingCard(container,bookingId){
    const cards=[...container.querySelectorAll('.offer')];
    return cards.find(card=>new RegExp(`(^|\\s)#?${bookingId}(\\s|·|$)`).test(card.textContent||''));
  }

  async function addCustomerDetailButtons(){
    if(isDemo||state?.role!=='WORKER'||!state?.user)return;
    const container=document.getElementById('workerContent');
    if(!container)return;
    try{
      const rows=(await api('/bookings')).data||[];
      rows.filter(b=>[...REQUEST_STATUSES,'ACCEPTED','IN_PROGRESS'].includes(b.status)).forEach(b=>{
        const card=findBookingCard(container,b.id);
        if(!card)return;
        card.querySelector('.live-location-btn')?.remove();
        if(card.querySelector('.worker-customer-details-btn'))return;
        const actions=card.querySelector('.tabs.top-space')||card.querySelector('.tabs')||card;
        const btn=document.createElement('button');
        btn.type='button';
        btn.className='btn secondary small worker-customer-details-btn';
        btn.textContent=REQUEST_STATUSES.includes(b.status)?'👤 Customer details':'📍 Customer details & location';
        btn.onclick=()=>openWorkerCustomerDetails(Number(b.id));
        actions.appendChild(btn);
      });
    }catch(e){console.warn('Customer details unavailable',e)}
  }

  function wrapWorkerBookings(){
    try{
      if(typeof loadWorkerBookingsLive!=='function'||loadWorkerBookingsLive.__customerDetailsWrapped)return;
      const original=loadWorkerBookingsLive;
      loadWorkerBookingsLive=async function(){
        const result=await original.apply(this,arguments);
        await addCustomerDetailButtons();
        return result;
      };
      loadWorkerBookingsLive.__customerDetailsWrapped=true;
    }catch(e){}
  }

  function wrapLocationPrivacyCopy(){
    try{
      if(typeof openLocationSettings!=='function'||openLocationSettings.__bookingPrivacyWrapped)return;
      const original=openLocationSettings;
      const wrapped=async function(){
        const result=await original.apply(this,arguments);
        const subtitle=document.getElementById('locationSubtitle');
        const note=document.querySelector('#locationModalBody .location-privacy-note');
        if(state?.role==='USER'){
          if(subtitle)subtitle.textContent='When enabled, SevaHub can calculate nearby worker distance. After you book a worker, that assigned worker can see your shared GPS, name and phone while the request is pending, bargaining or active.';
          if(note)note.innerHTML='<b>Privacy:</b> SevaHub stores only your latest location, not a route/history. Nearby discovery exposes distance only. Your precise GPS is shown only to the worker you booked while location sharing is enabled.';
        }else if(state?.role==='WORKER'){
          if(subtitle)subtitle.textContent='When enabled, nearby users can see your distance. For assigned bookings, you can view the customer’s shared GPS and contact details; your exact GPS is shared with the customer only after the booking is accepted or in progress.';
          if(note)note.innerHTML='<b>Privacy:</b> Customer contact and precise GPS are restricted to the worker assigned to that booking. Your own precise GPS is shared with the customer only during accepted/in-progress bookings.';
        }
        return result;
      };
      wrapped.__bookingPrivacyWrapped=true;
      try{openLocationSettings=wrapped}catch(e){}
      window.openLocationSettings=wrapped;
    }catch(e){}
  }

  wrapWorkerBookings();
  wrapLocationPrivacyCopy();
  setTimeout(addCustomerDetailButtons,0);

  const style=document.createElement('style');
  style.textContent=`
    .worker-customer-dialog{max-width:640px}.worker-customer-status{display:flex;align-items:center;gap:10px;margin-bottom:12px}.worker-customer-card{display:grid;grid-template-columns:52px 1fr;gap:14px;padding:16px;border:1px solid #ead5c7;border-radius:16px;background:#fff8f1}.worker-customer-avatar{width:48px;height:48px;border-radius:14px;display:grid;place-items:center;background:#ffe8d3;font-size:24px}.worker-customer-main{display:flex;flex-direction:column;gap:9px;min-width:0}.worker-customer-main h3{margin:0}.worker-customer-contact{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.worker-booking-address{display:flex;flex-direction:column;gap:8px;margin-top:14px;padding:14px;border-radius:14px;background:#fff;border:1px solid #ead5c7}.worker-booking-address .btn{align-self:flex-start}.dark .worker-customer-card,body.dark .worker-customer-card,.dark .worker-booking-address,body.dark .worker-booking-address{background:#12191d;border-color:#2d393f}@media(max-width:650px){.worker-customer-card{grid-template-columns:44px 1fr;padding:13px}.worker-customer-avatar{width:42px;height:42px}.worker-customer-contact .btn,.worker-booking-address .btn{width:100%}}
  `;
  document.head.appendChild(style);
})();
