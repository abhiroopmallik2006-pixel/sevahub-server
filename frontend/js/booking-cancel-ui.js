/* Customer booking cancellation + live refresh after either side cancels a bargain. */
(function(){
  const CANCELLABLE=new Set(['PENDING','BARGAINING','COUNTER_OFFER_PENDING_USER','ACCEPTED','REJECTED']);
  let decorating=false;

  function role(){
    try{return String(state?.role||'').toUpperCase()}catch(e){return ''}
  }

  function findCard(id){
    return [...document.querySelectorAll('.booking-list-marker .card.panel')].find(card=>{
      const h3=card.querySelector('h3');
      return h3&&h3.textContent.trim().startsWith(`Booking #${id}`);
    });
  }

  function actionHost(card){
    let host=card.querySelector('.tabs,.actions');
    if(host)return host;
    host=document.createElement('div');
    host.className='tabs booking-cancel-actions';
    card.appendChild(host);
    return host;
  }

  async function cancelBooking(id){
    const bookingId=Number(id);
    if(!bookingId)return;
    if(!confirm(`Cancel Booking #${bookingId}?\n\nThis will close any active bargain for this booking.`))return;
    const button=document.querySelector(`[data-cancel-booking-id="${bookingId}"]`);
    const old=button?.textContent;
    if(button){button.disabled=true;button.textContent='Cancelling…'}
    try{
      const result=await api(`/bookings/${bookingId}/cancel`,{method:'POST'});
      if(typeof toast==='function')toast(result?.message||'Booking cancelled');
      if(typeof userBookings==='function')await userBookings();
    }catch(err){
      if(typeof toast==='function')toast(err.message||'Could not cancel booking');
      else alert(err.message||'Could not cancel booking');
    }finally{
      if(button?.isConnected){button.disabled=false;button.textContent=old||'Cancel booking'}
    }
  }
  globalThis.cancelUserBooking=cancelBooking;

  async function decorate(){
    if(decorating||role()!=='USER'||!document.querySelector('.booking-list-marker')||typeof api!=='function')return;
    decorating=true;
    try{
      const rows=(await api('/bookings'))?.data||[];
      for(const b of rows){
        const id=Number(b.id);
        const status=String(b.status||'').toUpperCase();
        const card=findCard(id);
        if(!card)continue;
        card.querySelectorAll('.user-cancel-booking').forEach(el=>el.remove());
        if(!CANCELLABLE.has(status))continue;
        const btn=document.createElement('button');
        btn.type='button';
        btn.className='btn danger small user-cancel-booking';
        btn.dataset.cancelBookingId=String(id);
        btn.textContent='Cancel booking';
        btn.addEventListener('click',()=>cancelBooking(id));
        actionHost(card).appendChild(btn);
      }
    }catch(e){
      console.warn('[Booking Cancel UI] decorate failed:',e.message);
    }finally{decorating=false}
  }

  try{
    if(typeof userBookings==='function'&&!userBookings.__cancelUiWrapped){
      const original=userBookings;
      const wrapped=async function(){
        const result=await original.apply(this,arguments);
        setTimeout(decorate,0);
        return result;
      };
      wrapped.__cancelUiWrapped=true;
      userBookings=wrapped;
    }
  }catch(e){console.warn('[Booking Cancel UI] wrapper skipped:',e.message)}

  // Existing realtime socket joins the user's room. Refresh My Bookings whenever
  // bargaining rejection or customer cancellation changes the booking status.
  try{
    if(typeof io==='function'){
      const socket=io({transports:['websocket','polling']});
      socket.on('connect',()=>{
        const uid=Number(state?.user?.id||0);
        if(uid)socket.emit('join-user-room',uid);
      });
      socket.on('booking-cancelled',()=>{
        if(document.querySelector('.booking-list-marker')&&typeof userBookings==='function')userBookings();
      });
    }
  }catch(e){}

  setTimeout(decorate,350);
})();
