/* Worker moderation banner.
   Lightweight: no polling; refreshes on dashboard render/profile open/window focus. */
(function(){
  const originalRenderWorker=globalThis.renderWorker;
  const originalWorkerProfile=globalThis.workerProfile;
  let cached=null;
  let cachedAt=0;
  let inflight=null;

  function lang(){try{return localStorage.getItem('sevahub_language_v1')==='hi'?'hi':'en'}catch(e){return 'en'}}
  function safe(v=''){try{return typeof esc==='function'?esc(v):String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}catch(e){return String(v)}}
  const copy={
    en:{title:'Worker Account Restricted',reason:'Reason',body:'Your service listing is hidden and service actions are disabled until the cooperative admin removes this restriction.',edit:'Profile editing is disabled while restricted.'},
    hi:{title:'वर्कर अकाउंट प्रतिबंधित',reason:'कारण',body:'जब तक सहकारी एडमिन यह प्रतिबंध नहीं हटाता, आपकी सेवा लिस्टिंग छिपी रहेगी और सेवा संबंधी कार्य बंद रहेंगे।',edit:'प्रतिबंध के दौरान प्रोफ़ाइल एडिट बंद है।'}
  };

  async function fetchState(force=false){
    if(location.protocol==='file:'||typeof api!=='function')return null;
    if(!force&&cached&&Date.now()-cachedAt<15000)return cached;
    if(inflight)return inflight;
    inflight=api('/workers/me').then(result=>{
      cached=result?.data||null;
      cachedAt=Date.now();
      return cached;
    }).catch(()=>cached).finally(()=>{inflight=null});
    return inflight;
  }

  function renderBanner(data){
    const dashboard=document.querySelector('main.dashboard');
    document.getElementById('workerRestrictionBanner')?.remove();
    document.body.classList.toggle('worker-account-restricted',Boolean(data?.is_banned));
    if(!dashboard||!data?.is_banned)return;
    const c=copy[lang()];
    const banner=document.createElement('section');
    banner.id='workerRestrictionBanner';
    banner.className='worker-restriction-banner';
    banner.innerHTML=`<div class="worker-restriction-icon">⛔</div><div><h2>${safe(c.title)}</h2><p><b>${safe(c.reason)}:</b> ${safe(data.ban_reason||'Restricted by cooperative admin')}</p><small>${safe(c.body)}</small></div>`;
    dashboard.insertAdjacentElement('afterbegin',banner);
  }

  function syncProfileEdit(data){
    const button=document.querySelector('.worker-profile-live .worker-profile-head button');
    if(!button)return;
    const banned=Boolean(data?.is_banned);
    button.disabled=banned;
    button.title=banned?copy[lang()].edit:'';
  }

  async function refreshWorkerModeration(force=false){
    try{
      if(typeof state!=='undefined'&&state?.role!=='WORKER')return;
      const data=await fetchState(force);
      renderBanner(data);
      syncProfileEdit(data);
    }catch(e){}
  }

  if(typeof originalRenderWorker==='function'&&!originalRenderWorker.__sevahubModerationWrapped){
    const wrapped=function(...args){
      const result=originalRenderWorker.apply(this,args);
      requestAnimationFrame(()=>refreshWorkerModeration(true));
      return result;
    };
    wrapped.__sevahubModerationWrapped=true;
    globalThis.renderWorker=wrapped;
  }

  if(typeof originalWorkerProfile==='function'&&!originalWorkerProfile.__sevahubModerationProfileWrapped){
    const wrappedProfile=function(...args){
      const result=originalWorkerProfile.apply(this,args);
      Promise.resolve(result).finally(()=>requestAnimationFrame(()=>refreshWorkerModeration(true)));
      return result;
    };
    wrappedProfile.__sevahubModerationProfileWrapped=true;
    globalThis.workerProfile=wrappedProfile;
  }

  window.addEventListener('focus',()=>{
    try{if(typeof state!=='undefined'&&state?.role==='WORKER'&&state?.user)refreshWorkerModeration(true)}catch(e){}
  });
  window.addEventListener('sevahub-language-changed',()=>{if(cached)renderBanner(cached)});
  globalThis.refreshWorkerModeration=refreshWorkerModeration;
})();
