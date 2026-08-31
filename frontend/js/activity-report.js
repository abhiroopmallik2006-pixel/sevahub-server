/* SevaHub activity timestamps + detailed spend/earn reports. */
(function(){
  const PLATFORM_FEE_PERCENT=2;
  const originalAppendBookingMessage=typeof appendBookingMessage==='function'?appendBookingMessage:null;
  const originalUserBookings=typeof userBookings==='function'?userBookings:null;
  const originalWorkerBookings=typeof workerBookings==='function'?workerBookings:null;
  const originalUserSpendHistory=typeof userSpendHistory==='function'?userSpendHistory:null;
  const originalWorkerEarnings=typeof workerEarnings==='function'?workerEarnings:null;

  function safeEsc(v=''){
    try{return typeof esc==='function'?esc(v):String(v)}catch(e){return String(v)}
  }
  function cash(v){
    try{return typeof money==='function'?money(Number(v||0)):`₹${Number(v||0).toLocaleString('en-IN')}`}catch(e){return `₹${Number(v||0)}`}
  }
  function feeFor(amount){
    return Number((Math.max(0,Number(amount)||0)*PLATFORM_FEE_PERCENT/100).toFixed(2));
  }
  function fmtDateTime(value){
    if(!value)return '—';
    const d=new Date(value);
    if(Number.isNaN(d.getTime()))return safeEsc(String(value));
    return d.toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  }
  function fmtTimeOnly(value){
    const d=value?new Date(value):new Date();
    return d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
  }
  function fmtScheduled(date,time){
    const ds=String(date||'').slice(0,10);
    const ts=String(time||'').slice(0,5);
    if(!ds&&!ts)return '—';
    if(!ds)return ts;
    const d=new Date(`${ds}T${ts||'00:00'}:00`);
    if(Number.isNaN(d.getTime()))return `${ds}${ts?` · ${ts}`:''}`;
    return d.toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  }

  function addMessageTime(node,value){
    if(!node||node.querySelector('.msg-time'))return;
    const time=document.createElement('span');
    time.className='msg-time';
    time.textContent=fmtTimeOnly(value);
    node.appendChild(time);
  }

  /* Worker/user private chat uses the real message created_at from MySQL. */
  if(originalAppendBookingMessage){
    appendBookingMessage=function(m){
      const result=originalAppendBookingMessage.apply(this,arguments);
      const node=document.getElementById('chat-msg-'+m.id);
      addMessageTime(node,m.created_at||m.createdAt||new Date().toISOString());
      return result;
    };
  }

  /* AI chat and the floating SevaBot are client conversations, so stamp each visible message as it appears. */
  const messageObserver=new MutationObserver(records=>{
    records.forEach(record=>record.addedNodes.forEach(node=>{
      if(!(node instanceof Element))return;
      const candidates=[];
      if(node.matches?.('#aiMessages .msg,#chatBody .msg'))candidates.push(node);
      node.querySelectorAll?.('#aiMessages .msg,#chatBody .msg').forEach(x=>candidates.push(x));
      candidates.forEach(x=>addMessageTime(x,new Date().toISOString()));
    }));
  });
  messageObserver.observe(document.body,{childList:true,subtree:true});

  function findUserBookingCard(id){
    return [...document.querySelectorAll('.booking-list-marker .card.panel')].find(card=>{
      const h3=card.querySelector('h3');
      return h3&&h3.textContent.trim().startsWith(`Booking #${id}`);
    });
  }
  function findWorkerBookingCard(id){
    return [...document.querySelectorAll('#workerContent .offer')].find(card=>{
      const b=card.querySelector('b');
      const text=b?.textContent?.trim()||'';
      return text.startsWith(`#${id} ·`)||text.startsWith(`Booking #${id}`);
    });
  }

  async function completedMap(){
    if(isDemo)return new Map();
    try{
      const r=await api('/bookings/history?from=2000-01-01&to=2099-12-31');
      return new Map((r.data?.rows||[]).map(x=>[Number(x.id),x]));
    }catch(e){return new Map()}
  }

  async function decorateBookingTimings(role){
    if(isDemo||!state?.user)return;
    try{
      const [bookingsRes,done]=await Promise.all([api('/bookings'),completedMap()]);
      (bookingsRes.data||[]).forEach(b=>{
        const card=role==='WORKER'?findWorkerBookingCard(b.id):findUserBookingCard(b.id);
        if(!card||card.querySelector('.booking-time-strip'))return;
        const completed=b.completed_at||done.get(Number(b.id))?.completed_at;
        const timeline=document.createElement('div');
        timeline.className='booking-time-strip';
        timeline.innerHTML=`
          <span>📝 <b>Booked:</b> ${fmtDateTime(b.created_at)}</span>
          <span>📅 <b>Scheduled:</b> ${fmtScheduled(b.booking_date,b.booking_time)}</span>
          ${completed?`<span>✅ <b>Completed:</b> ${fmtDateTime(completed)}</span>`:''}`;
        const split=card.querySelector('.split');
        if(split)split.after(timeline);else card.prepend(timeline);
      });
    }catch(e){console.warn('Booking timings unavailable',e)}
  }

  if(originalUserBookings){
    userBookings=async function(){
      const r=await originalUserBookings.apply(this,arguments);
      setTimeout(()=>decorateBookingTimings('USER'),120);
      return r;
    };
  }
  if(originalWorkerBookings){
    workerBookings=function(){
      const r=originalWorkerBookings.apply(this,arguments);
      Promise.resolve(r).then(()=>setTimeout(()=>decorateBookingTimings('WORKER'),450));
      return r;
    };
  }

  function ensureReportModal(){
    let modal=document.getElementById('bookingReportModal');
    if(modal)return modal;
    modal=document.createElement('div');
    modal.id='bookingReportModal';
    modal.className='report-modal hidden';
    modal.innerHTML=`<div class="report-dialog" role="dialog" aria-modal="true" aria-labelledby="bookingReportTitle">
      <div class="split report-head"><div><h2 id="bookingReportTitle">🧾 Booking report</h2><p class="muted" id="bookingReportSubtitle"></p></div><button class="btn secondary small" type="button" id="bookingReportClose">✕</button></div>
      <div id="bookingReportBody"></div>
    </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click',e=>{if(e.target===modal)closeBookingReport()});
    modal.querySelector('#bookingReportClose').addEventListener('click',closeBookingReport);
    return modal;
  }
  function closeBookingReport(){document.getElementById('bookingReportModal')?.classList.add('hidden')}
  window.closeBookingReport=closeBookingReport;

  async function loadPaymentFor(bookingId,viewerRole){
    if(isDemo)return null;
    try{
      const path=viewerRole==='WORKER'?'/payments/worker':'/payments/my';
      const rows=(await api(path)).data||[];
      return rows.find(p=>Number(p.booking_id)===Number(bookingId))||null;
    }catch(e){return null}
  }

  async function getCompletedRow(bookingId){
    if(isDemo)return null;
    try{
      const r=await api('/bookings/history?from=2000-01-01&to=2099-12-31');
      return (r.data?.rows||[]).find(x=>Number(x.id)===Number(bookingId))||null;
    }catch(e){return null}
  }

  window.openBookingReport=async function(bookingId,viewerRole){
    const modal=ensureReportModal();
    modal.classList.remove('hidden');
    modal.querySelector('#bookingReportSubtitle').textContent=`Booking #${Number(bookingId)}`;
    const body=modal.querySelector('#bookingReportBody');
    body.innerHTML='<div class="empty">Building full report…</div>';

    try{
      if(isDemo){
        const d=db();
        const b=d.bookings.find(x=>Number(x.id)===Number(bookingId));
        if(!b)throw new Error('Booking not found');
        const worker=d.workers.find(x=>x.id===b.workerId);
        const customer=d.users.find(x=>x.id===b.userId);
        const service=services.find(x=>x.id===b.serviceId);
        const amount=Number(b.finalPrice??b.originalPrice??0);
        const fee=feeFor(amount),net=Number((amount-fee).toFixed(2));
        renderReport(body,{id:b.id,status:b.status,service_name:service?.name,worker_name:worker?.name,customer_name:customer?.fullName,created_at:b.createdAt||null,booking_date:b.date,booking_time:b.time,completed_at:b.completedAt,payment_method:b.payment||'Cash',amount,platformFee:fee,workerNet:net,platformFeePercent:PLATFORM_FEE_PERCENT,payment:null},viewerRole);
        return;
      }

      const [bookingsRes,completed,payment]=await Promise.all([api('/bookings'),getCompletedRow(bookingId),loadPaymentFor(bookingId,viewerRole)]);
      const b=(bookingsRes.data||[]).find(x=>Number(x.id)===Number(bookingId));
      if(!b)throw new Error('Booking not found');
      const amount=Number(completed?.final_price??b.final_price??b.original_price??0);
      const platformFee=Number(payment?.platform_fee??feeFor(amount));
      const workerNet=Number(payment?.worker_net_amount??Math.max(0,amount-platformFee));
      const percent=Number(payment?.platform_fee_percent??(amount>0?platformFee/amount*100:PLATFORM_FEE_PERCENT));
      renderReport(body,{
        id:b.id,status:b.status,service_name:b.service_name||completed?.service_name,
        worker_name:b.worker_user_name||completed?.worker_name,
        customer_name:b.customer_name||completed?.customer_name,
        created_at:b.created_at,booking_date:b.booking_date,booking_time:b.booking_time,
        completed_at:completed?.completed_at||b.completed_at,
        payment_method:b.payment_method||payment?.payment_method||'Cash',
        amount,platformFee,workerNet,platformFeePercent:Number(percent.toFixed(2)),payment
      },viewerRole);
    }catch(e){body.innerHTML=`<div class="empty">${safeEsc(e.message||'Could not load report')}</div>`}
  };

  function renderReport(body,r,viewerRole){
    const p=r.payment;
    const paidAt=p?.paid_at?fmtDateTime(p.paid_at):null;
    const receipt=p?.receipt_number||'';
    const paymentStatus=p?.status||(String(r.payment_method).toLowerCase()==='cash'?'CASH':'NOT PAID / NOT RECORDED');
    body.innerHTML=`
      <div class="report-summary">
        <div><span>Service</span><b>${safeEsc(r.service_name||'Service')}</b></div>
        <div><span>Status</span><b>${safeEsc(String(r.status||'').replaceAll('_',' '))}</b></div>
        ${viewerRole==='WORKER'?`<div><span>Customer</span><b>${safeEsc(r.customer_name||'—')}</b></div>`:`<div><span>Worker</span><b>${safeEsc(r.worker_name||'—')}</b></div>`}
      </div>

      <div class="report-section">
        <h3>⏱ Booking timeline</h3>
        <div class="report-timeline">
          <div><span>Booking created</span><b>${fmtDateTime(r.created_at)}</b></div>
          <div><span>Service scheduled</span><b>${fmtScheduled(r.booking_date,r.booking_time)}</b></div>
          <div><span>Service completed</span><b>${r.completed_at?fmtDateTime(r.completed_at):'Not completed yet'}</b></div>
          ${paidAt?`<div><span>Payment recorded</span><b>${paidAt}</b></div>`:''}
        </div>
      </div>

      <div class="report-section">
        <div class="split"><h3>💳 Payment report</h3><span class="pill">${safeEsc(paymentStatus)}</span></div>
        <div class="report-money">
          <div><span>Service fee</span><b>${cash(r.amount)}</b></div>
          <div><span>SevaHub platform fee (${Number(r.platformFeePercent||0)}%)</span><b>− ${cash(r.platformFee)}</b></div>
          <div class="report-net"><span>Worker net earning</span><b>${cash(r.workerNet)}</b></div>
          <div><span>Customer total service payment</span><b>${cash(r.amount)}</b></div>
        </div>
        <p class="muted report-note">Platform fee is part of the service amount and is shown as the SevaHub deduction from the worker payout; it is not added again on top of the service fee.</p>
        <div class="report-meta">
          <span><b>Method:</b> ${safeEsc(r.payment_method||'—')}</span>
          ${receipt?`<span><b>Receipt:</b> ${safeEsc(receipt)}</span>`:''}
          ${p?.razorpay_payment_id?`<span><b>Payment ID:</b> ${safeEsc(p.razorpay_payment_id)}</span>`:''}
        </div>
      </div>`;
  }

  function historyRowHtml(r,viewerRole,displayAmount){
    const other=viewerRole==='WORKER'?r.customer_name:r.worker_name;
    return `<div class="offer history-report-row" role="button" tabindex="0" onclick="openBookingReport(${Number(r.id)},'${viewerRole}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openBookingReport(${Number(r.id)},'${viewerRole}')}" aria-label="Open full report for booking ${Number(r.id)}">
      <div class="split"><div><b>${safeEsc(r.service_name||'Service')}</b><p class="muted">${safeEsc(other||'')} · Booking #${Number(r.id)}</p><p class="history-completed-time">✅ ${r.completed_at?fmtDateTime(r.completed_at):String(r.booking_date||'').slice(0,10)}</p></div><div class="history-price-side"><div class="price">${cash(displayAmount)}</div><small>Tap for full report →</small></div></div>
    </div>`;
  }

  if(originalUserSpendHistory){
    userSpendHistory=async function(e){
      if(isDemo)return originalUserSpendHistory.apply(this,arguments);
      if(e)e.preventDefault();
      const box=document.getElementById('userContent');
      const {from:defFrom,to:defTo}=monthRange();
      const from=document.getElementById('histFrom')?.value||defFrom;
      const to=document.getElementById('histTo')?.value||defTo;
      try{
        const r=await api(`/bookings/history?from=${from}&to=${to}`);
        const rows=r.data?.rows||[];
        box.innerHTML=`<div class="spend-history-marker">${historyPanel('Spend history','Total spent in range',r.data?.total||0,rows,row=>historyRowHtml(row,'USER',row.final_price??row.original_price),'userSpendHistory',from,to)}</div>`;
      }catch(err){toast(err.message)}
    };
  }

  if(originalWorkerEarnings){
    workerEarnings=async function(e){
      if(isDemo)return originalWorkerEarnings.apply(this,arguments);
      if(e)e.preventDefault();
      const box=document.getElementById('workerContent');
      const {from:defFrom,to:defTo}=monthRange();
      const from=document.getElementById('histFrom')?.value||defFrom;
      const to=document.getElementById('histTo')?.value||defTo;
      try{
        const [historyRes,paymentsRes]=await Promise.all([
          api(`/bookings/history?from=${from}&to=${to}`),
          api('/payments/worker').catch(()=>({data:[]}))
        ]);
        const rows=historyRes.data?.rows||[];
        const paymentMap=new Map((paymentsRes.data||[]).map(p=>[Number(p.booking_id),p]));
        const netFor=row=>{
          const amount=Number(row.final_price??row.original_price??0);
          const p=paymentMap.get(Number(row.id));
          return Number(p?.worker_net_amount??Math.max(0,amount-feeFor(amount)));
        };
        const totalNet=Number(rows.reduce((sum,row)=>sum+netFor(row),0).toFixed(2));
        box.innerHTML=`<div class="earn-history-marker">${historyPanel('Earnings history','Net earned after platform fee',totalNet,rows,row=>historyRowHtml(row,'WORKER',netFor(row)),'workerEarnings',from,to)}</div>`;
      }catch(err){toast(err.message)}
    };
  }

  /* Stamp already-visible AI greetings after initial render, and again after later dashboard renders. */
  setInterval(()=>{
    document.querySelectorAll('#aiMessages .msg,#chatBody .msg').forEach(x=>addMessageTime(x,new Date().toISOString()));
  },1200);
})();
