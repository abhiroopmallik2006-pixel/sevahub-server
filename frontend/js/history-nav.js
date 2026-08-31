/* Browser + Android WebView history support for SevaHub's single-page dashboard. */
(function(){
  let restoring=false;
  const ROUTE_KEY='sevahub_ui_route_v1';

  function role(){
    try{return state?.role||null}catch(e){return null}
  }

  function callIfExists(name,...args){
    const fn=globalThis[name];
    if(typeof fn==='function') return fn(...args);
  }

  function baseViewFromDom(){
    const currentRole=role();
    if(document.querySelector('.booking-chat')) return {view:'chat'};
    if(document.querySelector('.booking-list-marker')) return {view:'user-bookings'};
    if(document.querySelector('.gem-wallet')) return {view:'user-rewards'};
    if(document.querySelector('.spend-history-marker')) return {view:'user-spend'};
    if(document.querySelector('.earn-history-marker')) return {view:'worker-earnings'};
    if(currentRole==='WORKER') return {view:'worker-home'};
    if(currentRole==='USER') return {view:'user-services'};
    return {view:'home'};
  }

  function ensureCurrentState(){
    if(history.state?.sevahub) return;
    const base=baseViewFromDom();
    history.replaceState({sevahub:true,...base,root:true},'',location.href);
  }

  function pushView(view,data={}){
    if(restoring) return;
    ensureCurrentState();
    const current=history.state||{};
    const same=current.sevahub&&current.view===view&&
      Number(current.bookingId||0)===Number(data.bookingId||0)&&
      Number(current.serviceId||0)===Number(data.serviceId||0)&&
      String(current.role||'')===String(data.role||'');
    if(same) return;
    history.pushState({sevahub:true,root:false,view,...data},'',location.href);
  }

  function readSavedRoute(){
    try{return JSON.parse(sessionStorage.getItem(ROUTE_KEY)||'null')}catch(e){return null}
  }

  function replaceAsRoot(view,data={}){
    try{history.replaceState({sevahub:true,root:true,view,...data},'',location.href)}catch(e){}
  }

  /*
    Called by the native Android wrapper before it considers closing the Activity.
    Return true when SevaHub handled Back internally.
  */
  window.sevahubNativeBack=function(){
    try{
      const s=history.state;
      if(s?.sevahub && s.root!==true){
        history.back();
        return true;
      }

      /* Fallback for a restored/refreshed page whose browser stack is unavailable. */
      const route=readSavedRoute()||baseViewFromDom();
      const currentRole=role();

      if(route?.view==='chat'){
        try{activeChatBookingId=null}catch(e){}
        if((route.role||currentRole)==='WORKER'){
          callIfExists('workerBookings');
          replaceAsRoot('worker-bookings');
        }else{
          callIfExists('userBookings');
          replaceAsRoot('user-bookings');
        }
        return true;
      }

      if(route?.view==='user-booking-form' && Number(route.serviceId)>0){
        callIfExists('showWorkers',Number(route.serviceId));
        replaceAsRoot('user-workers',{serviceId:Number(route.serviceId)});
        return true;
      }

      if(route?.view==='user-workers'){
        callIfExists('userServices');
        replaceAsRoot('user-services');
        return true;
      }

      if(['user-bargain','user-bargain-live'].includes(route?.view)){
        callIfExists('userBookings');
        replaceAsRoot('user-bookings');
        return true;
      }

      if(['user-bookings','user-ai','user-spend','user-rewards','user-notifications'].includes(route?.view)){
        callIfExists('userServices');
        replaceAsRoot('user-services');
        return true;
      }

      if(['worker-bookings','worker-bargains','worker-earnings','worker-profile'].includes(route?.view)){
        callIfExists('workerHome');
        replaceAsRoot('worker-home');
        return true;
      }
    }catch(e){
      console.warn('SevaHub native Back fallback failed',e);
    }
    return false;
  };

  document.addEventListener('click',function(e){
    const target=e.target.closest('[onclick]');
    if(!target) return;
    const code=String(target.getAttribute('onclick')||'').trim();
    const text=String(target.textContent||'').trim().toLowerCase();

    /* Visible in-app Back buttons should traverse the same history stack. */
    if((text.startsWith('←')||text==='back'||text.includes('← back')) && history.state?.sevahub && history.state.root!==true){
      if(code.includes('userServices()')||code.includes('userBookings()')||code.includes('workerBookings()')||code.includes('workerHome()')||code.includes('showWorkers(')){
        e.preventDefault();
        e.stopImmediatePropagation();
        try{activeChatBookingId=null}catch(err){}
        history.back();
        return;
      }
    }

    /* The Back button inside booking chat should behave like a real browser Back. */
    if(target.closest('.booking-chat') && (code.includes('userBookings()')||code.includes('workerBookings()'))){
      e.preventDefault();
      e.stopImmediatePropagation();
      try{activeChatBookingId=null}catch(err){}
      if(history.state?.sevahub && history.state.root!==true) history.back();
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

    const workers=code.match(/^showWorkers\((\d+)\)/);
    if(workers) return pushView('user-workers',{serviceId:Number(workers[1])});
    if(code.startsWith('openBooking(')) return pushView('user-booking-form');

    if(code.startsWith('workerHome()')) return pushView('worker-home');
    if(code.startsWith('workerBookings()')) return pushView('worker-bookings');
    if(code.startsWith('workerBargains()')) return pushView('worker-bargains');
    if(code.startsWith('workerEarnings(')||code.startsWith('workerEarnings()')) return pushView('worker-earnings');
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
        case 'user-workers': await callIfExists('showWorkers',Number(s.serviceId)); break;
        case 'user-bargain': await callIfExists('openExistingBargain',Number(s.bookingId)); break;
        case 'worker-home': await callIfExists('workerHome'); break;
        case 'worker-bookings': await callIfExists('workerBookings'); break;
        case 'worker-bargains': await callIfExists('workerBargains'); break;
        case 'worker-earnings': await callIfExists('workerEarnings'); break;
        case 'worker-profile': await callIfExists('workerProfile'); break;
        case 'chat': await callIfExists('openBookingChat',Number(s.bookingId),s.role||role()); break;
        default:
          if(role()==='WORKER') await callIfExists('workerHome');
          else await callIfExists('userServices');
      }
    }catch(err){
      console.warn('Could not restore previous SevaHub view',err);
    }finally{
      restoring=false;
    }
  });
})();
