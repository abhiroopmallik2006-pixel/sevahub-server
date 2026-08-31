/* Browser + Android WebView history support for SevaHub's single-page dashboard. */
(function(){
  let restoring=false;
  let guardInstalled=false;
  const ROUTE_KEY='sevahub_ui_route_v1';

  function role(){
    try{return state?.role||null}catch(e){return null}
  }

  function loggedIn(){
    try{return Boolean(state?.user&&state?.role)}catch(e){return false}
  }

  function callIfExists(name,...args){
    const fn=globalThis[name];
    if(typeof fn==='function') return fn(...args);
  }

  function baseViewFromDom(){
    const currentRole=role();
    if(document.querySelector('.booking-chat')) return {view:'chat'};
    if(document.querySelector('.notification-center')) return {view:currentRole==='WORKER'?'worker-notifications':'user-notifications'};
    if(document.querySelector('.booking-list-marker')) return {view:'user-bookings'};
    if(document.querySelector('.gem-wallet')) return {view:'user-rewards'};
    if(document.querySelector('.spend-history-marker')) return {view:'user-spend'};
    if(document.querySelector('.earn-history-marker')) return {view:'worker-earnings'};
    if(currentRole==='WORKER') return {view:'worker-home'};
    if(currentRole==='USER') return {view:'user-services'};
    return {view:'home'};
  }

  function routeUrl(view,data={}){
    const bits=[`view=${encodeURIComponent(view||'home')}`];
    if(data.bookingId) bits.push(`booking=${encodeURIComponent(data.bookingId)}`);
    if(data.serviceId) bits.push(`service=${encodeURIComponent(data.serviceId)}`);
    if(data.role) bits.push(`role=${encodeURIComponent(data.role)}`);
    return `${location.pathname}${location.search}#sevahub:${bits.join('&')}`;
  }

  function saveRoute(route){
    if(!route||route.guard) return;
    try{sessionStorage.setItem(ROUTE_KEY,JSON.stringify(route))}catch(e){}
  }

  function readSavedRoute(){
    try{return JSON.parse(sessionStorage.getItem(ROUTE_KEY)||'null')}catch(e){return null}
  }

  function ensureAndroidGuard(){
    if(!loggedIn()||guardInstalled) return;
    guardInstalled=true;

    const base=baseViewFromDom();
    try{
      history.replaceState({sevahub:true,guard:true,view:'guard'},'',`${location.pathname}${location.search}#sevahub:guard`);
      history.pushState({sevahub:true,root:true,...base},'',routeUrl(base.view,base));
      saveRoute({sevahub:true,root:true,...base});
    }catch(e){
      console.warn('Could not install SevaHub history guard',e);
    }
  }

  function ensureCurrentState(){
    ensureAndroidGuard();
    if(history.state?.sevahub&&!history.state.guard) return;
    const base=baseViewFromDom();
    try{
      history.replaceState({sevahub:true,root:true,...base},'',routeUrl(base.view,base));
      saveRoute({sevahub:true,root:true,...base});
    }catch(e){}
  }

  function pushView(view,data={}){
    if(restoring) return;
    ensureCurrentState();
    const current=history.state||{};
    const same=current.sevahub&&!current.guard&&current.view===view&&
      Number(current.bookingId||0)===Number(data.bookingId||0)&&
      Number(current.serviceId||0)===Number(data.serviceId||0)&&
      String(current.role||'')===String(data.role||'');
    if(same) return;
    const next={sevahub:true,root:false,view,...data};
    history.pushState(next,'',routeUrl(view,data));
    saveRoute(next);
  }

  function replaceAsRoot(view,data={}){
    const next={sevahub:true,root:true,view,...data};
    try{
      history.replaceState(next,'',routeUrl(view,data));
      saveRoute(next);
    }catch(e){}
  }

  function restoreRoot(){
    const currentRole=role();
    restoring=true;
    try{
      if(currentRole==='WORKER') callIfExists('workerHome');
      else callIfExists('userServices');
      const rootView=currentRole==='WORKER'?'worker-home':'user-services';
      history.pushState({sevahub:true,root:true,view:rootView},'',routeUrl(rootView));
      saveRoute({sevahub:true,root:true,view:rootView});
    }finally{
      restoring=false;
    }
  }

  window.sevahubNativeBack=function(){
    try{
      ensureAndroidGuard();
      if(history.state?.sevahub){
        history.back();
        return true;
      }
    }catch(e){console.warn('SevaHub native Back failed',e)}
    return false;
  };

  document.addEventListener('click',function(e){
    const target=e.target.closest('[onclick]');
    if(!target) return;
    const code=String(target.getAttribute('onclick')||'').trim();
    const text=String(target.textContent||'').trim().toLowerCase();

    ensureAndroidGuard();

    if((text.startsWith('←')||text==='back'||text.includes('← back')) && history.state?.sevahub && !history.state.guard){
      if(code.includes('userServices()')||code.includes('userBookings()')||code.includes('workerBookings()')||code.includes('workerHome()')||code.includes('showWorkers(')){
        e.preventDefault();
        e.stopImmediatePropagation();
        try{activeChatBookingId=null}catch(err){}
        history.back();
        return;
      }
    }

    if(target.closest('.booking-chat') && (code.includes('userBookings()')||code.includes('workerBookings()'))){
      e.preventDefault();
      e.stopImmediatePropagation();
      try{activeChatBookingId=null}catch(err){}
      history.back();
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

    if(code.startsWith('workerHome()')) return pushView('worker-home');
    if(code.startsWith('workerBookings()')) return pushView('worker-bookings');
    if(code.startsWith('workerBargains()')) return pushView('worker-bargains');
    if(code.startsWith('workerEarnings(')||code.startsWith('workerEarnings()')) return pushView('worker-earnings');
    if(code.startsWith('workerProfile()')) return pushView('worker-profile');
    if(code.startsWith('workerNotifications()')) return pushView('worker-notifications');

    const bargain=code.match(/openExistingBargain\((\d+)\)/);
    if(bargain) return pushView('user-bargain',{bookingId:Number(bargain[1])});

    const chat=code.match(/openBookingChat\((\d+),\s*['"](USER|WORKER)['"]\)/);
    if(chat) return pushView('chat',{bookingId:Number(chat[1]),role:chat[2]});
  },true);

  window.addEventListener('popstate',async function(e){
    const s=e.state;

    if(s?.sevahub&&s.guard){
      if(loggedIn()) restoreRoot();
      return;
    }

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
        case 'worker-notifications': await callIfExists('workerNotifications'); break;
        case 'chat': await callIfExists('openBookingChat',Number(s.bookingId),s.role||role()); break;
        default:
          if(role()==='WORKER') await callIfExists('workerHome');
          else await callIfExists('userServices');
      }
      saveRoute(s);
    }catch(err){
      console.warn('Could not restore previous SevaHub view',err);
    }finally{
      restoring=false;
    }
  });

  const app=document.getElementById('app');
  if(app){
    const observer=new MutationObserver(()=>{
      if(loggedIn()) ensureAndroidGuard();
    });
    observer.observe(app,{childList:true,subtree:true});
  }
  setTimeout(()=>{if(loggedIn()) ensureAndroidGuard()},0);
})();
