/* Keep SevaHub signed in on this browser/app until explicit logout. */
(function(){
  const TOKEN_KEY='sevahub_token';
  const SESSION_KEY='sevahub_ui_session_v1';

  function read(storage,key){
    try{return storage.getItem(key)}catch(e){return null}
  }
  function write(storage,key,value){
    try{if(value!=null)storage.setItem(key,value)}catch(e){}
  }
  function remove(storage,key){
    try{storage.removeItem(key)}catch(e){}
  }

  /* sessionStorage is the source of truth while the current tab/WebView is
     alive. login() writes the freshly issued token there first. Previously we
     preferred localStorage, which could copy an older USER/WORKER token back
     over a new login and cause 403 "Access denied" on role-protected APIs. */
  function syncToken(){
    const token=read(sessionStorage,TOKEN_KEY)||read(localStorage,TOKEN_KEY);
    if(!token)return null;
    write(sessionStorage,TOKEN_KEY,token);
    write(localStorage,TOKEN_KEY,token);
    return token;
  }

  function saveIdentity(){
    try{
      if(state?.user&&state?.role){
        write(localStorage,SESSION_KEY,JSON.stringify({role:state.role,user:state.user}));
      }
    }catch(e){}
  }

  function clearPersistentAuth(){
    remove(localStorage,TOKEN_KEY);
    remove(sessionStorage,TOKEN_KEY);
    remove(localStorage,SESSION_KEY);
    remove(sessionStorage,SESSION_KEY);
  }

  /* Upgrade any older tab-only login to a persistent login. */
  syncToken();

  /* app.js historically reads only sessionStorage. Before every API call,
     repopulate it from the active session first, falling back to the persistent
     token only when the current tab has no token yet. */
  try{
    const originalApi=globalThis.api;
    if(typeof originalApi==='function'&&!originalApi.__persistentTokenWrapped){
      const wrapped=function(...args){
        syncToken();
        return originalApi.apply(this,args);
      };
      wrapped.__persistentTokenWrapped=true;
      globalThis.api=wrapped;
    }
  }catch(e){}

  function wrapAuthAction(name){
    const original=globalThis[name];
    if(typeof original!=='function'||original.__persistentLoginWrapped)return;
    const wrapped=async function(...args){
      const result=await original.apply(this,args);
      /* Persist the token produced by this login/registration, never an older
         local token from a previous role/account. */
      const fresh=read(sessionStorage,TOKEN_KEY);
      if(fresh)write(localStorage,TOKEN_KEY,fresh);
      else syncToken();
      saveIdentity();
      return result;
    };
    wrapped.__persistentLoginWrapped=true;
    globalThis[name]=wrapped;
  }

  wrapAuthAction('login');
  wrapAuthAction('finishRegistration');

  try{
    const originalLogout=globalThis.logout;
    if(typeof originalLogout==='function'&&!originalLogout.__persistentLoginWrapped){
      const wrapped=function(...args){
        clearPersistentAuth();
        return originalLogout.apply(this,args);
      };
      wrapped.__persistentLoginWrapped=true;
      globalThis.logout=wrapped;
    }
  }catch(e){}

  async function refreshPersistentToken(){
    if(isDemo)return;
    const token=syncToken();
    if(!token)return;
    try{
      const result=await api('/auth/refresh',{method:'POST'});
      const fresh=result?.data?.token;
      if(fresh){
        write(sessionStorage,TOKEN_KEY,fresh);
        write(localStorage,TOKEN_KEY,fresh);
      }
    }catch(e){
      /* Render may be waking from a cold start or temporarily offline. Never
         erase a remembered login just because one refresh request failed. */
    }
  }

  window.sevahubPersistentAuthReady=refreshPersistentToken();

  window.addEventListener('pageshow',()=>syncToken());
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible')syncToken();
  });
  window.addEventListener('storage',e=>{
    if(e.key!==TOKEN_KEY)return;
    if(e.newValue)write(sessionStorage,TOKEN_KEY,e.newValue);
    else remove(sessionStorage,TOKEN_KEY);
  });
})();
