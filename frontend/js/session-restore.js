/* Persist the logged-in SevaHub dashboard and current interior page across refreshes. */
(function(){
  const SESSION_KEY='sevahub_ui_session_v1';
  const ROUTE_KEY='sevahub_ui_route_v1';
  let restoring=false;

  function safeState(){
    try{return state}catch(e){return null}
  }

  function saveSession(){
    const s=safeState();
    if(!s?.user||!s?.role) return;
    try{
      sessionStorage.setItem(SESSION_KEY,JSON.stringify({role:s.role,user:s.user}));
    }catch(e){}
  }

  function clearSaved(){
    try{
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(ROUTE_KEY);
    }catch(e){}
  }

  function saveRoute(route){
    if(restoring||!route) return;
    try{sessionStorage.setItem(ROUTE_KEY,JSON.stringify(route))}catch(e){}
  }

  function savedRoute(){
    try{return JSON.parse(sessionStorage.getItem(ROUTE_KEY)||'null')}catch(e){return null}
  }

  function wrap(name,routeBuilder){
    let original;
    try{original=globalThis[name]}catch(e){return}
    if(typeof original!=='function'||original.__sevahubPersistWrapped) return;
    const wrapped=function(...args){
      if(!restoring){
        try{saveSession();saveRoute(routeBuilder(...args))}catch(e){}
      }
      return original.apply(this,args);
    };
    wrapped.__sevahubPersistWrapped=true;
    try{globalThis[name]=wrapped}catch(e){}
  }

  wrap('userServices',()=>({view:'user-services'}));
  wrap('userBookings',()=>({view:'user-bookings'}));
  wrap('userAI',()=>({view:'user-ai'}));
  wrap('userSpendHistory',()=>({view:'user-spend'}));
  wrap('userRewards',()=>({view:'user-rewards'}));
  wrap('userNotifications',()=>({view:'user-notifications'}));
  wrap('showWorkers',serviceId=>({view:'user-workers',serviceId:Number(serviceId)}));
  wrap('openBooking',(worker,serviceId,bargain=false)=>({view:'user-booking-form',worker,serviceId:Number(serviceId),bargain:Boolean(bargain)}));
  wrap('openExistingBargain',bookingId=>({view:'user-bargain',bookingId:Number(bookingId)}));
  wrap('showBargainLive',(bookingId,price)=>({view:'user-bargain-live',bookingId:Number(bookingId),price:Number(price||0)}));
  wrap('showBargainDemo',booking=>({view:'user-bargain',bookingId:Number(booking?.id||0)}));
  wrap('openBookingChat',(bookingId,role)=>({view:'chat',bookingId:Number(bookingId),role:String(role||safeState()?.role||'')}));

  wrap('workerHome',()=>({view:'worker-home'}));
  wrap('workerBargains',()=>({view:'worker-bargains'}));
  wrap('workerBookings',()=>({view:'worker-bookings'}));
  wrap('workerEarnings',()=>({view:'worker-earnings'}));
  wrap('workerProfile',()=>({view:'worker-profile'}));

  try{
    const originalLogout=globalThis.logout;
    if(typeof originalLogout==='function'){
      globalThis.logout=function(...args){
        clearSaved();
        return originalLogout.apply(this,args);
      };
    }
  }catch(e){}

  async function restoreRoute(route){
    if(!route) return;
    const fn=(name,...args)=>{
      const f=globalThis[name];
      if(typeof f==='function') return f(...args);
    };
    switch(route.view){
      case 'user-services': return fn('userServices');
      case 'user-bookings': return fn('userBookings');
      case 'user-ai': return fn('userAI');
      case 'user-spend': return fn('userSpendHistory');
      case 'user-rewards': return fn('userRewards');
      case 'user-notifications': return fn('userNotifications');
      case 'user-workers': return fn('showWorkers',Number(route.serviceId));
      case 'user-booking-form': return fn('openBooking',route.worker,Number(route.serviceId),Boolean(route.bargain));
      case 'user-bargain': return fn('openExistingBargain',Number(route.bookingId));
      case 'user-bargain-live': return fn('showBargainLive',Number(route.bookingId),Number(route.price||0));
      case 'chat': return fn('openBookingChat',Number(route.bookingId),route.role||safeState()?.role);
      case 'worker-home': return fn('workerHome');
      case 'worker-bargains': return fn('workerBargains');
      case 'worker-bookings': return fn('workerBookings');
      case 'worker-earnings': return fn('workerEarnings');
      case 'worker-profile': return fn('workerProfile');
    }
  }

  function restoreSession(){
    let saved;
    try{saved=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null')}catch(e){saved=null}
    if(!saved?.user||!saved?.role) return;

    /* Live sessions also need the existing JWT. sessionStorage keeps it across refresh. */
    if(!isDemo&&!sessionStorage.getItem('sevahub_token')){
      clearSaved();
      return;
    }

    const route=savedRoute();
    const s=safeState();
    if(!s) return;

    restoring=true;
    try{
      s.role=saved.role;
      s.user=saved.user;
      render();
      if(typeof initLiveChat==='function') initLiveChat();
      Promise.resolve().then(()=>restoreRoute(route)).catch(e=>console.warn('Could not restore SevaHub page',e)).finally(()=>{restoring=false;saveSession()});
    }catch(e){
      restoring=false;
      console.warn('Could not restore SevaHub session',e);
    }
  }

  const app=document.getElementById('app');
  if(app){
    new MutationObserver(()=>saveSession()).observe(app,{childList:true,subtree:true});
  }

  document.addEventListener('click',e=>{
    const el=e.target.closest('[onclick]');
    if(el&&String(el.getAttribute('onclick')||'').includes('logout()')) clearSaved();
  },true);

  window.addEventListener('beforeunload',()=>{
    saveSession();
    try{
      if(history.state?.sevahub) saveRoute(history.state);
    }catch(e){}
  });

  window.addEventListener('popstate',()=>{
    setTimeout(()=>{
      saveSession();
      try{if(history.state?.sevahub) saveRoute(history.state)}catch(e){}
    },80);
  });

  restoreSession();
})();
