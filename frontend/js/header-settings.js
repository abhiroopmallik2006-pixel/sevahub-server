/* Unified SevaHub header settings: Location, appearance and logout live behind one gear beside the brand. */
(function(){
  function escapeText(value=''){
    try{return typeof esc==='function'?esc(value):String(value)}catch(e){return String(value)}
  }

  function gearSvg(){
    return `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g fill="none" stroke="currentColor" stroke-width="3.1" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="24" cy="24" r="6.3"/>
        <circle cx="24" cy="24" r="14.1"/>
        <path d="M24 5.5v5M24 37.5v5M5.5 24h5M37.5 24h5M10.9 10.9l3.6 3.6M33.5 33.5l3.6 3.6M37.1 10.9l-3.6 3.6M14.5 33.5l-3.6 3.6"/>
      </g>
    </svg>`;
  }

  function settingsButton(){
    return `<button class="header-settings-button" type="button" onclick="openSevaHubSettings()" aria-label="SevaHub settings" title="Settings">${gearSvg()}</button>`;
  }

  /* Replace the dashboard header for every future render. */
  try{
    nav=function(){
      return `<nav class="nav">
        <div class="nav-brand-group"><div class="brand">SEVAHUB</div>${settingsButton()}</div>
        <div class="nav-actions"><span class="pill">${escapeText(state.user?.fullName||'')} · ${escapeText(state.role||'')}</span></div>
      </nav>`;
    };
    window.nav=nav;
  }catch(e){}

  function retrofitHeader(){
    const bar=document.querySelector('.nav');
    if(!bar||!state?.user)return;

    /* Remove the old standalone Location, dark-mode and Logout controls. */
    bar.querySelectorAll('#locationNavButton').forEach(el=>el.remove());
    bar.querySelectorAll('button.theme').forEach(el=>el.remove());
    bar.querySelectorAll('button[onclick="toggleTheme()"],button[onclick="logout()"],button[onclick="openLocationSettings()"],button[onclick="openSevaHubSettings()"]')
      .forEach(el=>{if(!el.classList.contains('header-settings-button'))el.remove()});

    const brand=bar.querySelector('.brand');
    if(!brand)return;
    let group=bar.querySelector('.nav-brand-group');
    if(!group){
      group=document.createElement('div');
      group.className='nav-brand-group';
      brand.parentNode.insertBefore(group,brand);
      group.appendChild(brand);
    }
    if(!group.querySelector('.header-settings-button'))group.insertAdjacentHTML('beforeend',settingsButton());
  }

  function ensureSettingsModal(){
    let modal=document.getElementById('sevahubSettingsModal');
    if(modal)return modal;
    modal=document.createElement('div');
    modal.id='sevahubSettingsModal';
    modal.className='sevahub-settings-modal hidden';
    modal.innerHTML=`<div class="sevahub-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="sevahubSettingsTitle">
      <div class="sevahub-settings-head">
        <div><span class="settings-kicker">SEVAHUB</span><h2 id="sevahubSettingsTitle">Settings</h2></div>
        <button class="settings-close" type="button" onclick="closeSevaHubSettings()" aria-label="Close settings">✕</button>
      </div>
      <div id="sevahubSettingsBody"></div>
    </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click',e=>{if(e.target===modal)closeSevaHubSettings()});
    return modal;
  }

  function settingsBody(){
    const dark=document.body.classList.contains('dark');
    const name=escapeText(state?.user?.fullName||'SevaHub user');
    const role=escapeText(state?.role||'');
    return `<div class="settings-profile"><b>${name}</b><span>${role}</span></div>
      <div class="settings-menu">
        <button class="settings-row" type="button" onclick="settingsOpenLocation()">
          <span class="settings-row-icon">📍</span><span class="settings-row-copy"><b>Location</b><small>GPS sharing and live tracking</small></span><span class="settings-chevron">›</span>
        </button>
        <button class="settings-row" type="button" onclick="settingsToggleAppearance()">
          <span class="settings-row-icon">${dark?'☀️':'🌙'}</span><span class="settings-row-copy"><b>${dark?'Light mode':'Dark mode'}</b><small>Change SevaHub appearance</small></span><span class="settings-state">${dark?'Dark':'Light'}</span>
        </button>
        <button class="settings-row settings-logout" type="button" onclick="settingsDoLogout()">
          <span class="settings-row-icon">↪</span><span class="settings-row-copy"><b>Log out</b><small>Sign out of this account</small></span><span class="settings-chevron">›</span>
        </button>
      </div>`;
  }

  function openSevaHubSettings(){
    if(!state?.user)return;
    const modal=ensureSettingsModal();
    modal.querySelector('#sevahubSettingsBody').innerHTML=settingsBody();
    modal.classList.remove('hidden');
  }
  window.openSevaHubSettings=openSevaHubSettings;

  function closeSevaHubSettings(){
    document.getElementById('sevahubSettingsModal')?.classList.add('hidden');
  }
  window.closeSevaHubSettings=closeSevaHubSettings;

  function settingsOpenLocation(){
    closeSevaHubSettings();
    if(typeof openLocationSettings==='function')openLocationSettings();
    else if(typeof toast==='function')toast('Location settings are unavailable right now');
  }
  window.settingsOpenLocation=settingsOpenLocation;

  function settingsToggleAppearance(){
    if(typeof toggleTheme==='function')toggleTheme();
    const modal=document.getElementById('sevahubSettingsModal');
    if(modal&&!modal.classList.contains('hidden'))modal.querySelector('#sevahubSettingsBody').innerHTML=settingsBody();
  }
  window.settingsToggleAppearance=settingsToggleAppearance;

  function settingsDoLogout(){
    closeSevaHubSettings();
    if(typeof logout==='function')logout();
  }
  window.settingsDoLogout=settingsDoLogout;

  /* Remove the previous gear that was placed beside Popular services. */
  function removeOldPopularSettings(){
    document.querySelectorAll('.popular-services-settings-icon,.popular-services-app-logo').forEach(el=>el.remove());
    document.querySelectorAll('.popular-services-heading').forEach(el=>el.classList.remove('popular-services-heading'));
  }

  const observer=new MutationObserver(()=>{
    retrofitHeader();
    removeOldPopularSettings();
  });
  observer.observe(document.body,{childList:true,subtree:true});
  retrofitHeader();
  removeOldPopularSettings();
})();
