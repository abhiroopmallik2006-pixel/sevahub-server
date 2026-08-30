/* User-side review controls for completed bookings. */
(function(){
  if(typeof userBookings!=='function') return;

  const originalUserBookings=userBookings;

  function stars(n){
    const value=Math.max(0,Math.min(5,Number(n)||0));
    return '★'.repeat(value)+'☆'.repeat(5-value);
  }

  function findBookingCard(id){
    return [...document.querySelectorAll('.booking-list-marker .card.panel')].find(card=>{
      const h3=card.querySelector('h3');
      return h3 && h3.textContent.trim().startsWith(`Booking #${id}`);
    });
  }

  async function loadMyReviews(){
    if(isDemo){
      const d=db();
      return (d.reviews||[]).filter(r=>Number(r.userId)===Number(state.user?.id));
    }
    try{
      return (await api('/reviews/my')).data||[];
    }catch(e){
      console.warn('Reviews unavailable',e);
      return [];
    }
  }

  async function decorateCompletedBookings(){
    if(state.role!=='USER' || !state.user) return;

    let bookings=[];
    try{
      bookings=isDemo
        ? db().bookings.filter(b=>Number(b.userId)===Number(state.user.id))
        : (await api('/bookings')).data||[];
    }catch(e){ return; }

    const completed=bookings.filter(b=>b.status==='COMPLETED');
    if(!completed.length) return;

    const reviews=await loadMyReviews();

    completed.forEach(b=>{
      const card=findBookingCard(b.id);
      if(!card || card.querySelector('.review-action-box')) return;

      const existing=reviews.find(r=>Number(r.booking_id??r.bookingId)===Number(b.id));
      const box=document.createElement('div');
      box.className='offer review-action-box top-space';

      if(existing){
        box.innerHTML=`
          <b>⭐ Your review</b>
          <div class="review-stars-readonly">${stars(existing.rating)}</div>
          ${existing.comment?`<p class="muted">${esc(existing.comment)}</p>`:''}
        `;
      }else{
        box.innerHTML=`
          <div class="split">
            <div>
              <b>How was your service?</b>
              <p class="muted review-help-text">Rate the worker after your completed booking.</p>
            </div>
            <button class="btn small" type="button" onclick="openReviewForm(${Number(b.id)})">⭐ Rate Worker</button>
          </div>
          <div id="reviewForm-${Number(b.id)}"></div>
        `;
      }

      card.appendChild(box);
    });
  }

  window.openReviewForm=function(bookingId){
    const host=document.getElementById(`reviewForm-${bookingId}`);
    if(!host) return;

    host.innerHTML=`
      <form class="review-form top-space" onsubmit="submitWorkerReview(event,${bookingId})">
        <div class="field">
          <label>Rating</label>
          <select id="reviewRating-${bookingId}" required>
            <option value="">Choose rating</option>
            <option value="5">★★★★★ Excellent</option>
            <option value="4">★★★★☆ Very good</option>
            <option value="3">★★★☆☆ Good</option>
            <option value="2">★★☆☆☆ Needs improvement</option>
            <option value="1">★☆☆☆☆ Poor</option>
          </select>
        </div>
        <div class="field">
          <label>Comment <span class="muted">(optional)</span></label>
          <textarea id="reviewComment-${bookingId}" maxlength="500" rows="3" placeholder="Tell us about your experience"></textarea>
        </div>
        <div class="tabs review-buttons">
          <button class="btn small" type="submit">Submit Review</button>
          <button class="btn secondary small" type="button" onclick="document.getElementById('reviewForm-${bookingId}').innerHTML=''">Cancel</button>
        </div>
      </form>`;
  };

  window.submitWorkerReview=async function(e,bookingId){
    e.preventDefault();
    const rating=Number(document.getElementById(`reviewRating-${bookingId}`)?.value);
    const comment=document.getElementById(`reviewComment-${bookingId}`)?.value?.trim()||'';

    if(!Number.isInteger(rating) || rating<1 || rating>5){
      return toast('Choose a rating from 1 to 5 stars');
    }

    try{
      if(isDemo){
        const d=db();
        d.reviews=d.reviews||[];
        if(d.reviews.some(r=>Number(r.bookingId)===Number(bookingId))) return toast('You already reviewed this booking');
        const booking=d.bookings.find(b=>Number(b.id)===Number(bookingId)&&Number(b.userId)===Number(state.user.id));
        if(!booking || booking.status!=='COMPLETED') return toast('Service must be completed first');
        d.reviews.push({id:Date.now(),bookingId,userId:state.user.id,workerId:booking.workerId,rating,comment,createdAt:new Date().toISOString()});
        const worker=d.workers.find(w=>Number(w.id)===Number(booking.workerId));
        if(worker){
          const all=d.reviews.filter(r=>Number(r.workerId)===Number(worker.id));
          worker.rating=all.reduce((sum,r)=>sum+Number(r.rating),0)/all.length;
          worker.reviews=all.length;
        }
        saveDB(d);
      }else{
        await api('/reviews',{method:'POST',body:JSON.stringify({bookingId,rating,comment})});
      }

      toast('⭐ Review submitted. Thank you!');
      await userBookings();
    }catch(err){
      toast(err.message);
    }
  };

  userBookings=async function(){
    await originalUserBookings();
    await decorateCompletedBookings();
  };
})();
