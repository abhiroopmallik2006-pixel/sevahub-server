/* User-side Razorpay checkout for online bookings. */
(function(){
  if(typeof userBookings!=='function') return;

  const previousUserBookings=userBookings;

  function findBookingCard(id){
    return [...document.querySelectorAll('.booking-list-marker .card.panel')].find(card=>{
      const h3=card.querySelector('h3');
      return h3 && h3.textContent.trim().startsWith(`Booking #${id}`);
    });
  }

  async function loadMyPayments(){
    if(isDemo) return [];
    try{
      return (await api('/payments/my')).data||[];
    }catch(e){
      console.warn('Payments unavailable',e);
      return [];
    }
  }

  function paymentMethodOf(b){
    return String(b.payment_method??b.paymentMethod??b.payment??'Cash');
  }

  function bookingAmount(b){
    return Number(b.final_price??b.finalPrice??b.original_price??b.originalPrice??0);
  }

  async function decoratePayments(){
    if(isDemo || state.role!=='USER' || !state.user) return;

    let bookings=[];
    try{
      bookings=(await api('/bookings')).data||[];
    }catch(e){ return; }

    const payments=await loadMyPayments();

    bookings.forEach(b=>{
      const method=paymentMethodOf(b).toLowerCase();
      if(method==='cash') return;
      if(!['ACCEPTED','IN_PROGRESS','COMPLETED'].includes(String(b.status))) return;

      const card=findBookingCard(b.id);
      if(!card || card.querySelector('.payment-action-box')) return;

      const payment=payments.find(p=>Number(p.booking_id)===Number(b.id));
      const amount=bookingAmount(b);
      const box=document.createElement('div');
      box.className='offer payment-action-box top-space';

      if(payment?.status==='PAID'){
        box.innerHTML=`
          <div class="split">
            <div>
              <b>✅ Payment completed</b>
              <p class="muted">Paid ${money(payment.amount)}${payment.razorpay_payment_id?` · ID ${esc(payment.razorpay_payment_id)}`:''}</p>
            </div>
            <span class="pill success">PAID</span>
          </div>`;
      }else{
        box.innerHTML=`
          <div class="split">
            <div>
              <b>💳 Online payment</b>
              <p class="muted">${esc(paymentMethodOf(b))} · Amount ${money(amount)}</p>
              ${payment?.status==='FAILED'?'<p class="muted">Previous attempt was not completed. You can try again.</p>':''}
            </div>
            <button class="btn small" type="button" onclick="payBookingWithRazorpay(${Number(b.id)})">Pay ${money(amount)}</button>
          </div>`;
      }

      card.appendChild(box);
    });
  }

  window.payBookingWithRazorpay=async function(bookingId){
    if(typeof Razorpay==='undefined'){
      return toast('Payment checkout could not load. Check internet and refresh.');
    }

    try{
      const order=(await api('/payments/order',{
        method:'POST',
        body:JSON.stringify({bookingId})
      })).data;

      const options={
        key:order.keyId,
        amount:order.amount,
        currency:order.currency||'INR',
        name:'SevaHub',
        description:`Booking #${bookingId}`,
        order_id:order.orderId,
        prefill:{
          name:order.name||state.user.fullName||'',
          email:order.email||state.user.email||'',
          contact:order.contact||''
        },
        notes:{booking_id:String(bookingId)},
        theme:{color:'#f97316'},
        handler:async function(response){
          try{
            await api('/payments/verify',{
              method:'POST',
              body:JSON.stringify({
                bookingId,
                razorpay_payment_id:response.razorpay_payment_id,
                razorpay_order_id:response.razorpay_order_id,
                razorpay_signature:response.razorpay_signature
              })
            });
            toast('✅ Payment successful');
            await userBookings();
          }catch(err){
            toast(err.message||'Payment verification failed');
          }
        },
        modal:{
          ondismiss:function(){ toast('Payment window closed'); }
        },
        retry:{enabled:true}
      };

      const checkout=new Razorpay(options);
      checkout.on('payment.failed',async function(response){
        const reason=response?.error?.description||response?.error?.reason||'Payment failed';
        try{
          await api('/payments/failed',{
            method:'POST',
            body:JSON.stringify({bookingId,reason})
          });
        }catch(e){}
        toast(reason);
      });
      checkout.open();
    }catch(err){
      toast(err.message||'Could not start payment');
    }
  };

  userBookings=async function(){
    await previousUserBookings();
    await decoratePayments();
  };
})();
