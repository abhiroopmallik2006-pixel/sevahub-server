/* Browser-history support for SevaHub's single-page dashboard. */
(function(){
  let restoring=false;

  function role(){
    try{return state?.role||null}catch(e){return null}
  }

  function baseViewFromDom(){
    const currentRole=role();
    if(document.querySelector('.booking-chat')) return {view:'chat'};
    if(document.querySelector('.booking-list-marker')) return {view:'user-bookings'};
    if(document.querySelector('.gem-wallet')) return {view:'user-rewards'};
    if(document.querySelector('.earn-history-marker')) return {view:currentRole==='WORKER'?'worker-earnings':'user-spend'};
    if(currentRole==='WORKER') return {view:'worker-bookings'};
    if(currentRole==='USER') return {view:'user-services'};
    return {view:'home'};
  }

  function ensureCurrentState(){
    if(history.state?.sevahub) return;
    const base=baseViewFromDom();
    history.replaceState({sevahub:true,...base},'',location.href);
  }

  function pushView(view,data={}){
    if(restoring) return;
    ensureCurrentState();
    const current=history.state||{};
    const same=current.sevahub&&current.view===view&&
      Number(current.bookingId||0)===Number(data.bookingId||0)&&
      String(current.role||'')===String(data.role||'');
    if(same) return;
    history.pushState({sevahub:true,view,...data},'',location.href);
  }

  function callIfExists(name,...args){
    const fn=globalThis[name];
    if(typeof fn==='function') return fn(...args);
  }

  document.addEventListener('click',function(e){
    const target=e.target.closest('[onclick]');
    if(!target) return;
    const code=String(target.getAttribute('onclick')||'').trim();

    /* The Back button inside booking chat should behave like a real browser Back. */
    if(target.closest('.booking-chat') && (code.includes('userBookings()')||code.includes('workerBookings()'))){
      e.preventDefault();
      e.stopImmediatePropagation();
      try{activeChatBookingId=null}catch(err){}
      if(history.state?.sevahub && history.state.view==='chat') history.back();
      else if(role()==='WORKER') callIfExists('workerBookings');
      else callIfExists('userBookings');
      return;
    }

    if(code.startsWith('userServices()')) return pushView('user-services');
    if(code.startsWith('userBookings()')) return pushView('user-bookings');
    if(code.startsWith('userAI()')) return pushView('user-ai');
    if(code.startsWith('userSpendHistory()')) return pushView('user-spend');
    if(code.startsWith('userRewards()')) return pushView('user-rewards');
    if(code.startsWith('userNotifications()')) return pushView('user-notifications');

    if(code.startsWith('workerBookings()')) return pushView('worker-bookings');
    if(code.startsWith('workerBargains()')) return pushView('worker-bargains');
    if(code.startsWith('workerEarnings(')) return pushView('worker-earnings');
    if(code.startsWith('workerProfile()')) return pushView('worker-profile');

    const bargain=code.match(/openExistingBargain\((\d+)\)/);
    if(bargain) return pushView('user-bargain',{bookingId:Number(bargain[1])});

    const chat=code.match(/openBookingChat\((\d+),\s*['"](USER|WORKER)['"]\)/);
    if(chat) return pushView('chat',{bookingId:Number(chat[1]),role:chat[2]});
  },true);

  window.addEventListener('popstate',async function(e){
    const s=e.state;
    if(!s?.sevahub) return;
    try{
      if(!state?.user) return;
    }catch(err){return}

    restoring=true;
    try{
      switch(s.view){
        case 'user-services': await callIfExists('userServices'); break;
        case 'user-bookings': await callIfExists('userBookings'); break;
        case 'user-ai': await callIfExists('userAI'); break;
        case 'user-spend': await callIfExists('userSpendHistory'); break;
        case 'user-rewards': await callIfExists('userRewards'); break;
        case 'user-notifications': await callIfExists('userNotifications'); break;
        case 'user-bargain': await callIfExists('openExistingBargain',Number(s.bookingId)); break;
        case 'worker-bookings': await callIfExists('workerBookings'); break;
        case 'worker-bargains': await callIfExists('workerBargains'); break;
        case 'worker-earnings': await callIfExists('workerEarnings'); break;
        case 'worker-profile': await callIfExists('workerProfile'); break;
        case 'chat': await callIfExists('openBookingChat',Number(s.bookingId),s.role||role()); break;
        default:
          if(role()==='WORKER') await callIfExists('workerBookings');
          else await callIfExists('userServices');
      }
    }catch(err){
      console.warn('Could not restore previous SevaHub view',err);
    }finally{
      restoring=false;
    }
  });
})();
