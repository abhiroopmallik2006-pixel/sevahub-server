/* Worker review history + live chat notification popups for user and worker dashboards. */
(function(){
  function safe(value=''){
    try{return typeof esc==='function'?esc(value):String(value)}catch(e){return String(value)}
  }

  function reviewStars(value){
    const n=Math.max(0,Math.min(5,Math.round(Number(value)||0)));
    return '★'.repeat(n)+'☆'.repeat(5-n);
  }

  function ensureReviewModal(){
    let modal=document.getElementById('workerReviewsModal');
    if(modal)return modal;
    modal=document.createElement('div');
    modal.id='workerReviewsModal';
    modal.className='worker-reviews-modal hidden';
    modal.innerHTML=`<div class="worker-reviews-dialog" role="dialog" aria-modal="true" aria-labelledby="workerReviewsTitle">
      <div class="worker-reviews-head">
        <div><span>SEVAHUB REVIEWS</span><h2 id="workerReviewsTitle">Worker reviews</h2><p id="workerReviewsSummary" class="muted"></p></div>
        <button class="worker-reviews-close" type="button" onclick="closeWorkerReviews()" aria-label="Close reviews">✕</button>
      </div>
      <div id="workerReviewsBody" class="worker-reviews-body"></div>
    </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click',e=>{if(e.target===modal)window.closeWorkerReviews()});
    return modal;
  }

  window.closeWorkerReviews=function(){
    document.getElementById('workerReviewsModal')?.classList.add('hidden');
  };

  async function getWorkerReviews(workerId){
    if(typeof isDemo!=='undefined'&&isDemo){
      const d=db();
      const worker=(d.workers||[]).find(w=>Number(w.id)===Number(workerId));
      const rows=(d.reviews||[])
        .filter(r=>Number(r.workerId??r.worker_id)===Number(workerId))
        .sort((a,b)=>new Date(b.createdAt??b.created_at??0)-new Date(a.createdAt??a.created_at??0))
        .map(r=>({
          ...r,
          reviewer_name:(d.users||[]).find(u=>Number(u.id)===Number(r.userId??r.user_id))?.fullName||'Customer',
          created_at:r.created_at??r.createdAt
        }));
      const avg=rows.length?rows.reduce((sum,r)=>sum+Number(r.rating||0),0)/rows.length:Number(worker?.rating||0);
      return {workerName:worker?.name||'Professional',averageRating:avg,totalReviews:rows.length,reviews:rows};
    }
    return (await api(`/reviews/worker/${Number(workerId)}`)).data;
  }

  window.openWorkerReviews=async function(workerId){
    const modal=ensureReviewModal();
    const title=modal.querySelector('#workerReviewsTitle');
    const summary=modal.querySelector('#workerReviewsSummary');
    const body=modal.querySelector('#workerReviewsBody');
    title.textContent='Worker reviews';
    summary.textContent='Loading reviews…';
    body.innerHTML='<div class="worker-reviews-loading">Loading customer feedback…</div>';
    modal.classList.remove('hidden');

    try{
      const data=await getWorkerReviews(workerId);
      const rows=data.reviews||[];
      title.textContent=`${data.workerName||'Professional'} · Reviews`;
      summary.innerHTML=`<b>★ ${Number(data.averageRating||0).toFixed(1)}</b> · ${Number(data.totalReviews||rows.length||0)} review${Number(data.totalReviews||rows.length||0)===1?'':'s'}`;
      if(!rows.length){
        body.innerHTML='<div class="worker-reviews-empty">No reviews yet. This professional has not received customer feedback yet.</div>';
        return;
      }
      body.innerHTML=rows.map(r=>{
        const date=r.created_at?new Date(r.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}):'';
        const comment=String(r.comment||'').trim();
        return `<article class="worker-review-item">
          <div class="worker-review-top"><div><b>${safe(r.reviewer_name||'Customer')}</b>${r.service_name?`<small>${safe(r.service_name)}</small>`:''}</div><span class="worker-review-stars">${reviewStars(r.rating)}</span></div>
          ${comment?`<p>${safe(comment)}</p>`:'<p class="muted">Rating submitted without a written comment.</p>'}
          ${date?`<time>${safe(date)}</time>`:''}
        </article>`;
      }).join('');
    }catch(err){
      summary.textContent='';
      body.innerHTML=`<div class="worker-reviews-empty">Could not load reviews: ${safe(err.message||'Unknown error')}</div>`;
    }
  };

  /* Workers can open their own complete review history directly from the worker dashboard. */
  window.openMyWorkerReviews=async function(){
    if(typeof state==='undefined'||state?.role!=='WORKER'||!state?.user)return;
    try{
      let workerId=null;
      if(typeof isDemo!=='undefined'&&isDemo){
        const d=db();
        workerId=(d.workers||[]).find(w=>Number(w.userId??w.user_id)===Number(state.user.id))?.id||null;
      }else{
        const worker=(await api('/workers/me')).data||{};
        workerId=worker.id||worker.worker_id||null;
      }
      if(!workerId)return toast('Worker profile not found');
      await window.openWorkerReviews(Number(workerId));
    }catch(err){
      toast(err.message||'Could not load your reviews');
    }
  };

  function ensureWorkerReviewsTab(){
    try{
      if(typeof state==='undefined'||state?.role!=='WORKER'||!state?.user)return;
      const tabs=document.querySelector('.dashboard > .tabs');
      if(!tabs||tabs.querySelector('.worker-my-reviews-tab'))return;
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='btn secondary worker-my-reviews-tab';
      btn.innerHTML='⭐ Reviews';
      btn.setAttribute('aria-label','View my customer reviews');
      btn.onclick=window.openMyWorkerReviews;
      tabs.appendChild(btn);
    }catch(e){}
  }

  // Replace the existing professional-card renderer with the same card plus See reviews.
  if(typeof workerHTML==='function'){
    const enhancedWorkerHTML=function(w,sid){
      const wid=Number(w.id??w.worker_id);
      const count=Number(w.reviews??w.total_reviews??0);
      return `<div class="card worker-card" data-worker-id="${wid}"><div class="split"><div><h3>${safe(w.name||w.full_name)}</h3><span class="pill success">✓ Verified</span></div><div>👤</div></div><p class="muted">${safe(w.experience_years??w.experience)} years experience · ${safe(w.area||w.service_area)}</p><p class="rating">★ ${w.rating||5} <span class="muted">(${count})</span></p><div class="price">${money(w.price??w.service_price)}</div><div class="tabs worker-card-actions"><button class="btn small" onclick='openBooking(${JSON.stringify(w)},${sid})'>Book now</button><button class="btn secondary small" onclick='openBooking(${JSON.stringify(w)},${sid},true)'>Bargain</button><button class="btn secondary small worker-see-reviews" type="button" onclick="openWorkerReviews(${wid})">⭐ See reviews${count?` (${count})`:''}</button></div></div>`;
    };
    try{workerHTML=enhancedWorkerHTML}catch(e){}
    window.workerHTML=enhancedWorkerHTML;
  }

  function removeChatPopup(el){
    if(!el)return;
    el.classList.add('leaving');
    setTimeout(()=>el.remove(),220);
  }

  function showChatPopup(payload){
    if(!payload||payload.type!=='CHAT')return;
    const message=String(payload.message||'New chat message');
    const match=message.match(/Booking\s*#(\d+)/i);
    const bookingId=match?Number(match[1]):null;
    const stack=document.getElementById('chatNotificationStack')||(()=>{
      const node=document.createElement('div');node.id='chatNotificationStack';node.className='chat-notification-stack';document.body.appendChild(node);return node;
    })();
    const popup=document.createElement('button');
    popup.type='button';
    popup.className='chat-notification-popup';
    popup.innerHTML=`<span class="chat-notification-icon">💬</span><span class="chat-notification-copy"><b>${safe(payload.title||'New message')}</b><small>${safe(message)}</small></span><span class="chat-notification-close" aria-hidden="true">×</span>`;
    popup.addEventListener('click',()=>{
      removeChatPopup(popup);
      if(bookingId&&typeof openBookingChat==='function'&&typeof state!=='undefined'&&state?.user){
        openBookingChat(bookingId,state.role==='WORKER'?'WORKER':'USER');
      }
    });
    stack.appendChild(popup);
    while(stack.children.length>4)stack.firstElementChild?.remove();
    setTimeout(()=>removeChatPopup(popup),6500);
  }

  let boundNotificationSocket=null;
  function bindChatNotificationPopup(){
    try{
      if(!chatSocket||boundNotificationSocket===chatSocket)return;
      boundNotificationSocket=chatSocket;
      chatSocket.on('notification:new',showChatPopup);
    }catch(e){}
  }

  if(typeof initLiveChat==='function'){
    const originalInitLiveChat=initLiveChat;
    const enhancedInitLiveChat=function(){
      const result=originalInitLiveChat.apply(this,arguments);
      setTimeout(bindChatNotificationPopup,0);
      return result;
    };
    try{initLiveChat=enhancedInitLiveChat}catch(e){}
    window.initLiveChat=enhancedInitLiveChat;
  }
  setTimeout(bindChatNotificationPopup,0);

  const workerTabObserver=new MutationObserver(()=>ensureWorkerReviewsTab());
  workerTabObserver.observe(document.body,{childList:true,subtree:true});
  setTimeout(ensureWorkerReviewsTab,0);

  document.addEventListener('keydown',e=>{
    if(e.key==='Escape')window.closeWorkerReviews();
  });
})();
