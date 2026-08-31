/* Razorpay checkout + 2% platform-fee breakdowns for users and workers. */
(function(){
  if(typeof userBookings!=='function') return;

  const PLATFORM_FEE_PERCENT=2;
  const previousUserBookings=userBookings;
  const previousWorkerBookings=typeof workerBookings==='function'?workerBookings:null;

  function feeFor(amount){return Number((Math.max(0,Number(amount)||0)*PLATFORM_FEE_PERCENT/100).toFixed(2))}
  function paymentMethodOf(b){return String(b.payment_method??b.paymentMethod??b.payment??'Cash')}
  function bookingAmount(b){return Number(b.final_price??b.finalPrice??b.original_price??b.originalPrice??0)}

  function findUserBookingCard(id){
    return [...document.querySelectorAll('.booking-list-marker .card.panel')].find(card=>{
      const h3=card.querySelector('h3');
      return h3 && h3.textContent.trim().startsWith(`Booking #${id}`);
    });
  }

  function findWorkerBookingCard(id){
    return [...document.querySelectorAll('#workerContent .offer')].find(card=>{
      const b=card.querySelector('b');
      return b && b.textContent.trim().startsWith(`#${id} ·`);
    });
  }

  async function loadMyPayments(){
    if(isDemo) return [];
    try{return (await api('/payments/my')).data||[]}
    catch(e){console.warn('Payments unavailable',e);return []}
  }

  async function loadWorkerPayments(){
    if(isDemo) return [];
    try{return (await api('/payments/worker')).data||[]}
    catch(e){console.warn('Worker payments unavailable',e);return []}
  }

  function receiptHtml(payment,viewer){
    const amount=Number(payment.amount||0);
    const fee=Number(payment.platform_fee??feeFor(amount));
    const feePercent=Number(payment.platform_fee_percent??(amount>0?(fee/amount*100):PLATFORM_FEE_PERCENT));
    const workerNet=Number(payment.worker_net_amount??Math.max(0,amount-fee));
    const paidAt=payment.paid_at?new Date(payment.paid_at).toLocaleString():'';
    const otherParty=viewer==='WORKER'?payment.customer_name:payment.worker_name;
    const otherLabel=viewer==='WORKER'?'Customer':'Worker';
    return `
      <div class="payment-receipt top-space">
        <div class="split">
          <div><b>🧾 SevaHub Receipt ${esc(payment.receipt_number||'')}</b><p class="muted">Booking #${Number(payment.booking_id)}${payment.service_name?` · ${esc(payment.service_name)}`:''}</p></div>
          <span class="pill success">PAID</span>
        </div>
        ${otherParty?`<p class="muted">${otherLabel}: ${esc(otherParty)}</p>`:''}
        <div class="offer">
          <div class="split"><span>Customer paid</span><b>${money(amount)}</b></div>
          <div class="split"><span>SevaHub platform fee (${feePercent}%)</span><b>− ${money(fee)}</b></div>
          <div class="split"><span>Worker net amount</span><b>${money(workerNet)}</b></div>
        </div>
        ${payment.razorpay_payment_id?`<p class="muted">Payment ID: ${esc(payment.razorpay_payment_id)}</p>`:''}
        ${paidAt?`<p class="muted">Paid: ${esc(paidAt)}</p>`:''}
      </div>`;
  }

  function cashBreakdownHtml(b,viewer){
    const amount=bookingAmount(b);
    const fee=feeFor(amount);
    const workerNet=Number(Math.max(0,amount-fee).toFixed(2));
    return `
      <div class="cash-fee-breakdown top-space">
        <div class="split">
          <div><b>💵 Cash payment</b><p class="muted">SevaHub platform fee applies to cash bookings too.</p></div>
          <span class="pill">CASH</span>
        </div>
        <div class="offer">
          <div class="split"><span>Service amount</span><b>${money(amount)}</b></div>
          <div class="split"><span>SevaHub platform fee (${PLATFORM_FEE_PERCENT}%)</span><b>− ${money(fee)}</b></div>
          <div class="split"><span>${viewer==='WORKER'?'Your net amount':'Worker net amount'}</span><b>${money(workerNet)}</b></div>
        </div>
        <p class="muted">Cash is paid directly between customer and worker; this shows the SevaHub fee breakdown for the booking.</p>
      </div>`;
  }

  async function decoratePayments(){
    if(isDemo || state.role!=='USER' || !state.user) return;
    let bookings=[];
    try{bookings=(await api('/bookings')).data||[]}catch(e){return}
    const payments=await loadMyPayments();

    bookings.forEach(b=>{
      if(!['ACCEPTED','IN_PROGRESS','COMPLETED'].includes(String(b.status))) return;
      const card=findUserBookingCard(b.id);
      if(!card || card.querySelector('.payment-action-box')) return;

      const method=paymentMethodOf(b).toLowerCase();
      const payment=payments.find(p=>Number(p.booking_id)===Number(b.id));
      const amount=bookingAmount(b);
      const fee=feeFor(amount);
      const workerNet=Number(Math.max(0,amount-fee).toFixed(2));
      const box=document.createElement('div');
      box.className='offer payment-action-box top-space';

      if(method==='cash'){
        box.innerHTML=cashBreakdownHtml(b,'USER');
      }else if(payment?.status==='PAID'){
        box.innerHTML=receiptHtml(payment,'USER');
      }else{
        box.innerHTML=`
          <div class="split">
            <div>
              <b>💳 Online payment</b>
              <p class="muted">${esc(paymentMethodOf(b))} · Customer pays ${money(amount)}</p>
              <p class="muted">SevaHub platform fee ${PLATFORM_FEE_PERCENT}% = ${money(fee)} · Worker receives ${money(workerNet)}</p>
              ${payment?.status==='FAILED'?'<p class="muted">Previous attempt was not completed. You can try again.</p>':''}
            </div>
            <button class="btn small" type="button" onclick="payBookingWithRazorpay(${Number(b.id)})">Pay ${money(amount)}</button>
          </div>`;
      }
      card.appendChild(box);
    });
  }

  async function decorateWorkerFeeBreakdowns(){
    if(isDemo || state.role!=='WORKER' || !state.user) return;
    let bookings=[];
    try{bookings=(await api('/bookings')).data||[]}catch(e){return}

    bookings.forEach(b=>{
      if(!['ACCEPTED','IN_PROGRESS','COMPLETED'].includes(String(b.status))) return;
      const card=findWorkerBookingCard(b.id);
      if(!card || card.querySelector('.worker-fee-breakdown')) return;

      const amount=bookingAmount(b);
      const fee=feeFor(amount);
      const workerNet=Number(Math.max(0,amount-fee).toFixed(2));
      const method=paymentMethodOf(b);
      const box=document.createElement('div');
      box.className='worker-fee-breakdown top-space';

      if(method.toLowerCase()==='cash'){
        box.innerHTML=cashBreakdownHtml(b,'WORKER');
      }else{
        box.innerHTML=`
          <div class="offer">
            <div class="split"><span>Payment method</span><b>${esc(method)}</b></div>
            <div class="split"><span>Service amount</span><b>${money(amount)}</b></div>
            <div class="split"><span>SevaHub platform fee (${PLATFORM_FEE_PERCENT}%)</span><b>− ${money(fee)}</b></div>
            <div class="split"><span>Your net amount</span><b>${money(workerNet)}</b></div>
          </div>`;
      }
      card.appendChild(box);
    });
  }

  async function decorateWorkerReceipts(){
    if(isDemo || state.role!=='WORKER' || !state.user) return;
    const host=document.getElementById('workerContent');
    if(!host || host.querySelector('.worker-payment-receipts')) return;
    const payments=await loadWorkerPayments();
    if(!payments.length) return;
    const section=document.createElement('div');
    section.className='card panel worker-payment-receipts top-space';
    section.innerHTML=`<h2>💳 Online payment receipts</h2><p class="muted">SevaHub deducts a ${PLATFORM_FEE_PERCENT}% platform fee from each online payment.</p>${payments.map(p=>receiptHtml(p,'WORKER')).join('')}`;
    host.appendChild(section);
  }

  window.payBookingWithRazorpay=async function(bookingId){
    if(typeof Razorpay==='undefined') return toast('Payment checkout could not load. Check internet and refresh.');
    try{
      const order=(await api('/payments/order',{method:'POST',body:JSON.stringify({bookingId})})).data;
      const feePercent=Number(order.platformFeePercent??PLATFORM_FEE_PERCENT);
      const fee=Number(order.platformFee??0);
      const options={
        key:order.keyId,
        amount:order.amount,
        currency:order.currency||'INR',
        name:'SevaHub',
        description:`Booking #${bookingId} · Platform fee ${feePercent}% (${money(fee)})`,
        order_id:order.orderId,
        prefill:{name:order.name||state.user.fullName||'',email:order.email||state.user.email||'',contact:order.contact||''},
        notes:{booking_id:String(bookingId),platform_fee_percent:String(feePercent),platform_fee:String(fee)},
        theme:{color:'#f97316'},
        handler:async function(response){
          try{
            const verified=await api('/payments/verify',{method:'POST',body:JSON.stringify({bookingId,razorpay_payment_id:response.razorpay_payment_id,razorpay_order_id:response.razorpay_order_id,razorpay_signature:response.razorpay_signature})});
            toast(`✅ Payment successful · Receipt ${verified.data?.receiptNumber||''}`);
            await userBookings();
          }catch(err){toast(err.message||'Payment verification failed')}
        },
        modal:{ondismiss:function(){toast('Payment window closed')}},
        retry:{enabled:true}
      };
      const checkout=new Razorpay(options);
      checkout.on('payment.failed',async function(response){
        const reason=response?.error?.description||response?.error?.reason||'Payment failed';
        try{await api('/payments/failed',{method:'POST',body:JSON.stringify({bookingId,reason})})}catch(e){}
        toast(reason);
      });
      checkout.open();
    }catch(err){toast(err.message||'Could not start payment')}
  };

  userBookings=async function(){
    await previousUserBookings();
    await decoratePayments();
  };

  if(previousWorkerBookings){
    workerBookings=function(){
      const result=previousWorkerBookings();
      Promise.resolve(result).then(()=>setTimeout(async()=>{
        await decorateWorkerFeeBreakdowns();
        await decorateWorkerReceipts();
      },200));
      return result;
    };
  }
})();
