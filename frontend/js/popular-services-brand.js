/* Mobile/WebView app settings: gear beside Popular services opens SevaHub settings. */
(function(){
  const originalUserServices=typeof userServices==='function'?userServices:null;

  function settingsMark(){
    return `
      <button class="popular-services-settings-icon" type="button" onclick="openSevaHubSettings()" aria-label="Open SevaHub settings" title="Settings">
        <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <g fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="24" cy="24" r="6.5"/>
            <path d="M24 5.5v5M24 37.5v5M5.5 24h5M37.5 24h5M10.9 10.9l3.6 3.6M33.5 33.5l3.6 3.6M37.1 10.9l-3.6 3.6M14.5 33.5l-3.6 3.6"/>
            <circle cx="24" cy="24" r="14.2"/>
          </g>
        </svg>
      </button>`;
  }

  function ensureSettingsModal(){
    let modal=document.getElementById('sevahubSettingsModal');
    if(modal)return modal;
    modal=document.createElement('div');
    modal.id='sevahubSettingsModal';
    modal.className='sevahub-settings-modal hidden';
    modal.innerHTML=`
      <div class="sevahub-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="sevahubSettingsTitle">
        <div class="sevahub-settings-head">
          <div>
            <span class="sevahub-settings-kicker">SEVAHUB</span>
            <h2 id="sevahubSettingsTitle">⚙ Settings</h2>
          </div>
          <button type="button" class="sevahub-settings-close" onclick="closeSevaHubSettings()" aria-label="Close settings">✕</button>
        </div>

        <section class="sevahub-settings-section">
          <h3>Appearance</h3>
          <p>Choose how SevaHub looks on this device.</p>
          <div class="sevahub-theme-options">
            <button type="button" data-sevahub-theme="light" onclick="setSevaHubTheme('light')">☀ Light</button>
            <button type="button" data-sevahub-theme="dark" onclick="setSevaHubTheme('dark')">🌙 Dark</button>
          </div>
        </section>

        <section class="sevahub-settings-section">
          <button type="button" class="sevahub-settings-row" onclick="openSevaHubLocationFromSettings()">
            <span class="sevahub-settings-row-icon">📍</span>
            <span><b>Location sharing</b><small>Manage nearby-worker and live-booking GPS</small></span>
            <span class="sevahub-settings-chevron">›</span>
          </button>
          <button type="button" class="sevahub-settings-row" onclick="openSevaHubNotificationsFromSettings()">
            <span class="sevahub-settings-row-icon">🔔</span>
            <span><b>Notifications</b><small>Open your saved SevaHub notifications</small></span>
            <span class="sevahub-settings-chevron">›</span>
          </button>
        </section>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click',e=>{if(e.target===modal)closeSevaHubSettings()});
    return modal;
  }

  function syncThemeButtons(){
    const dark=document.body.classList.contains('dark');
    document.querySelectorAll('[data-sevahub-theme]').forEach(btn=>{
      btn.classList.toggle('active',btn.dataset.sevahubTheme===(dark?'dark':'light'));
    });
  }

  window.openSevaHubSettings=function(){
    const modal=ensureSettingsModal();
    syncThemeButtons();
    modal.classList.remove('hidden');
  };

  window.closeSevaHubSettings=function(){
    document.getElementById('sevahubSettingsModal')?.classList.add('hidden');
  };

  window.setSevaHubTheme=function(mode){
    const dark=mode==='dark';
    document.body.classList.toggle('dark',dark);
    localStorage.setItem('sevahub_theme',dark?'dark':'light');
    syncThemeButtons();
    try{toast(dark?'Dark mode enabled':'Light mode enabled')}catch(e){}
  };

  window.openSevaHubLocationFromSettings=function(){
    closeSevaHubSettings();
    if(typeof openLocationSettings==='function')openLocationSettings();
    else try{toast('Location settings are unavailable right now')}catch(e){}
  };

  window.openSevaHubNotificationsFromSettings=function(){
    closeSevaHubSettings();
    try{
      if(state?.role==='WORKER'&&typeof workerNotifications==='function')return workerNotifications();
      if(typeof userNotifications==='function')return userNotifications();
      toast('Notifications are unavailable right now');
    }catch(e){}
  };

  function decoratePopularServices(){
    const box=document.getElementById('userContent');
    if(!box)return;
    const headings=[...box.querySelectorAll('h2')];
    const heading=headings.find(h=>String(h.childNodes?.[0]?.textContent||h.textContent||'').trim().toLowerCase()==='popular services');
    if(!heading||heading.querySelector('.popular-services-settings-icon'))return;
    heading.classList.add('popular-services-heading');
    heading.insertAdjacentHTML('beforeend',settingsMark());
  }

  if(originalUserServices){
    const wrapped=async function(){
      const result=await originalUserServices.apply(this,arguments);
      requestAnimationFrame(decoratePopularServices);
      return result;
    };
    try{userServices=wrapped}catch(e){}
    window.userServices=wrapped;
  }

  const observer=new MutationObserver(()=>{
    if(document.getElementById('userContent'))decoratePopularServices();
  });
  observer.observe(document.body,{childList:true,subtree:true});
  setTimeout(decoratePopularServices,0);
})();
