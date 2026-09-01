/* Keep SevaHub signed in on this browser/app until explicit logout. */
(function(){
  const TOKEN_KEY='sevahub_token';

  function read(storage,key){
    try{return storage.getItem(key)}catch(e){return null}
  }
  function write(storage,key,value){
    try{if(value)storage.setItem(key,value)}catch(e){}
  }
  function remove(storage,key){
    try{storage.removeItem(key)}catch(e){}
  }

  function migrateToken(){
    const persistent=read(localStorage,TOKEN_KEY);
    const current=read(sessionStorage,TOKEN_KEY);
    if(persistent&&!current) write(sessionStorage,TOKEN_KEY,persistent);
    else if(current&&!persistent) write(localStorage,TOKEN_KEY,current);
  }

  function syncToken(){
    const token=read(sessionStorage,TOKEN_KEY)||read(localStorage,TOKEN_KEY);
    if(!token)return;
    write(localStorage,TOKEN_KEY,token);
    write(sessionStorage,TOKEN_KEY,token);
  }

  function clearToken(){
    remove(localStorage,TOKEN_KEY);
    remove(sessionStorage,TOKEN_KEY);
  }

  migrateToken();

  function wrapAuthAction(name){
    const original=globalThis[name];
    if(typeof original!=='function'||original.__persistentLoginWrapped)return;
    const wrapped=async function(...args){
      const result=await original.apply(this,args);
      syncToken();
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
        clearToken();
        return originalLogout.apply(this,args);
      };
      wrapped.__persistentLoginWrapped=true;
      globalThis.logout=wrapped;
    }
  }catch(e){}

  async function refreshPersistentToken(){
    if(isDemo)return;
    const token=read(sessionStorage,TOKEN_KEY)||read(localStorage,TOKEN_KEY);
    if(!token)return;
    write(sessionStorage,TOKEN_KEY,token);
    try{
      const result=await api('/auth/refresh',{method:'POST'});
      const fresh=result?.data?.token;
      if(fresh){
        write(localStorage,TOKEN_KEY,fresh);
        write(sessionStorage,TOKEN_KEY,fresh);
      }
    }catch(e){
      // Session restore will verify the account and clear invalid credentials.
    }
  }

  window.sevahubPersistentAuthReady=refreshPersistentToken();

  window.addEventListener('storage',e=>{
    if(e.key!==TOKEN_KEY)return;
    if(e.newValue) write(sessionStorage,TOKEN_KEY,e.newValue);
    else remove(sessionStorage,TOKEN_KEY);
  });
})();
