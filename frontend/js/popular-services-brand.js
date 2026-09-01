/* Mobile/WebView app settings for both User and Worker dashboards. */
(function(){
  const LANGUAGE_KEY='sevahub_language_v1';
  const originalUserServices=typeof userServices==='function'?userServices:null;

  function currentLanguage(){
    try{return localStorage.getItem(LANGUAGE_KEY)==='hi'?'hi':'en'}catch(e){return 'en'}
  }

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

  function settingsCopy(){
    const hi=currentLanguage()==='hi';
    return hi?{
      title:'⚙ सेटिंग्स',appearance:'दिखावट',appearanceHelp:'इस डिवाइस पर SevaHub का रूप चुनें।',
      light:'☀ लाइट',dark:'🌙 डार्क',language:'भाषा',languageHelp:'SevaHub की भाषा चुनें।',
      english:'English',hindi:'हिन्दी',location:'लोकेशन शेयरिंग',locationHelp:'नज़दीकी वर्कर और लाइव-बुकिंग GPS मैनेज करें',
      notifications:'सूचनाएँ',notificationsHelp:'अपनी SevaHub सूचनाएँ खोलें'
    }:{
      title:'⚙ Settings',appearance:'Appearance',appearanceHelp:'Choose how SevaHub looks on this device.',
      light:'☀ Light',dark:'🌙 Dark',language:'Language',languageHelp:'Choose the SevaHub platform language.',
      english:'English',hindi:'हिन्दी',location:'Location sharing',locationHelp:'Manage nearby-worker and live-booking GPS',
      notifications:'Notifications',notificationsHelp:'Open your saved SevaHub notifications'
    };
  }

  function ensureSettingsModal(){
    let modal=document.getElementById('sevahubSettingsModal');
    if(modal)return modal;
    const copy=settingsCopy();
    modal=document.createElement('div');
    modal.id='sevahubSettingsModal';
    modal.className='sevahub-settings-modal hidden';
    modal.innerHTML=`
      <div class="sevahub-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="sevahubSettingsTitle">
        <div class="sevahub-settings-head">
          <div>
            <span class="sevahub-settings-kicker">SEVAHUB</span>
            <h2 id="sevahubSettingsTitle">${copy.title}</h2>
          </div>
          <button type="button" class="sevahub-settings-close" onclick="closeSevaHubSettings()" aria-label="Close settings">✕</button>
        </div>

        <section class="sevahub-settings-section">
          <h3>${copy.appearance}</h3>
          <p>${copy.appearanceHelp}</p>
          <div class="sevahub-theme-options">
            <button type="button" data-sevahub-theme="light" onclick="setSevaHubTheme('light')">${copy.light}</button>
            <button type="button" data-sevahub-theme="dark" onclick="setSevaHubTheme('dark')">${copy.dark}</button>
          </div>
        </section>

        <section class="sevahub-settings-section" data-no-translate="true">
          <h3>${copy.language} / Language</h3>
          <p>${copy.languageHelp}</p>
          <div class="sevahub-theme-options">
            <button type="button" data-sevahub-language="en" onclick="setSevaHubLanguage('en')">🌐 ${copy.english}</button>
            <button type="button" data-sevahub-language="hi" onclick="setSevaHubLanguage('hi')">🌐 ${copy.hindi}</button>
          </div>
        </section>

        <section class="sevahub-settings-section">
          <button type="button" class="sevahub-settings-row" onclick="openSevaHubLocationFromSettings()">
            <span class="sevahub-settings-row-icon">📍</span>
            <span><b>${copy.location}</b><small>${copy.locationHelp}</small></span>
            <span class="sevahub-settings-chevron">›</span>
          </button>
          <button type="button" class="sevahub-settings-row" onclick="openSevaHubNotificationsFromSettings()">
            <span class="sevahub-settings-row-icon">🔔</span>
            <span><b>${copy.notifications}</b><small>${copy.notificationsHelp}</small></span>
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

  function syncLanguageButtons(){
    const lang=currentLanguage();
    document.querySelectorAll('[data-sevahub-language]').forEach(btn=>{
      btn.classList.toggle('active',btn.dataset.sevahubLanguage===lang);
    });
  }

  window.openSevaHubSettings=function(){
    const modal=ensureSettingsModal();
    syncThemeButtons();
    syncLanguageButtons();
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

  window.setSevaHubLanguage=function(mode){
    if(!['en','hi'].includes(mode))return;
    const old=currentLanguage();
    localStorage.setItem(LANGUAGE_KEY,mode);
    syncLanguageButtons();
    if(old===mode)return;
    try{toast(mode==='hi'?'भाषा हिन्दी कर दी गई':'Language changed to English')}catch(e){}
    setTimeout(()=>location.reload(),120);
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

  /* Keep the recovery button reliable even in WebView after older cached JS. */
  window.authHelp=function(){
    if(typeof renderForgotPassword==='function')return renderForgotPassword();
    try{toast('Password reset is loading. Reopen SevaHub and try again.')}catch(e){}
  };

  function decoratePopularServices(){
    const box=document.getElementById('userContent');
    if(!box)return;
    const headings=[...box.querySelectorAll('h2')];
    const heading=headings.find(h=>{
      const text=String(h.childNodes?.[0]?.textContent||h.textContent||'').trim().toLowerCase();
      return text==='popular services'||text==='लोकप्रिय सेवाएँ';
    });
    if(!heading||heading.querySelector('.popular-services-settings-icon'))return;
    heading.classList.add('popular-services-heading');
    heading.insertAdjacentHTML('beforeend',settingsMark());
  }

  function decorateWorkerSettings(){
    if(state?.role!=='WORKER'||!state?.user)return;
    const main=document.querySelector('#app main.dashboard');
    if(!main)return;
    const heading=main.querySelector('h1');
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
    decoratePopularServices();
    decorateWorkerSettings();
  });
  observer.observe(document.body,{childList:true,subtree:true});
  setTimeout(()=>{decoratePopularServices();decorateWorkerSettings()},0);
})();
