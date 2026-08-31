/* Mobile/App location permission helper. Adds native Android permission recovery and HTTPS guidance. */
(function(){
  function isPhoneLike(){
    const ua=String(navigator.userAgent||'');
    return /Android|iPhone|iPad|Mobile|SevaHubAndroid/i.test(ua) || window.innerWidth<=900;
  }

  function nativeBridge(){
    try{return window.SevaHubNative||null}catch(e){return null}
  }

  function secureForGps(){
    return location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1';
  }

  async function permissionState(){
    const bridge=nativeBridge();
    if(bridge&&typeof bridge.hasLocationPermission==='function'){
      try{if(bridge.hasLocationPermission())return 'granted'}catch(e){}
    }
    if(!navigator.permissions?.query)return 'prompt';
    try{return (await navigator.permissions.query({name:'geolocation'})).state||'prompt'}catch(e){return 'prompt'}
  }

  function labelFor(state){
    const bridge=nativeBridge();
    if(!secureForGps()){
      return {
        title:'HTTPS required for phone GPS',
        detail:'Android WebView allows web location only on secure HTTPS pages. Connect SevaHub to your ngrok HTTPS URL, then allow location.',
        button:'🔒 Change server to HTTPS',
        action:'https'
      };
    }
    if(state==='granted')return {title:'Phone location allowed',detail:'SevaHub can request your phone GPS when you choose to share it.',button:'✓ Location allowed',action:'none'};
    if(state==='denied')return {
      title:'Phone location blocked',
      detail:bridge?'Open SevaHub app settings and set Location to Allow while using the app.':'Allow Location for SevaHub from your phone browser settings, then return here.',
      button:bridge?'⚙ Open phone app settings':'📱 Try location permission again',
      action:bridge?'settings':'request'
    };
    return {title:'Allow phone location',detail:'Android/iPhone will ask whether SevaHub may use this device’s location.',button:'📱 Allow phone location',action:'request'};
  }

  async function injectPermissionCard(){
    if(!isPhoneLike())return;
    const body=document.getElementById('locationModalBody');
    if(!body)return;
    body.querySelector('.phone-location-permission')?.remove();

    const state=await permissionState();
    if(!document.getElementById('locationModalBody') || body!==document.getElementById('locationModalBody'))return;
    const copy=labelFor(state);
    const card=document.createElement('div');
    card.className=`phone-location-permission ${state} ${copy.action==='https'?'needs-https':''}`;
    card.innerHTML=`
      <div class="phone-location-icon">📱</div>
      <div class="phone-location-copy">
        <b>${copy.title}</b>
        <span>${copy.detail}</span>
      </div>
      <button class="btn secondary small" type="button" data-phone-location-action="${copy.action}" ${copy.action==='none'?'disabled':''}>${copy.button}</button>`;

    card.querySelector('button')?.addEventListener('click',()=>window.requestPhoneLocationPermission(copy.action));
    const privacy=body.querySelector('.location-privacy-note');
    if(privacy)privacy.before(card);else body.prepend(card);
  }

  window.requestPhoneLocationPermission=function(action){
    const bridge=nativeBridge();

    if(action==='https' || !secureForGps()){
      if(bridge&&typeof bridge.openServerSettings==='function'){
        try{bridge.openServerSettings();return}catch(e){}
      }
      return toast('For phone GPS, connect SevaHub using your HTTPS ngrok URL.');
    }

    if(action==='settings'&&bridge&&typeof bridge.openAppLocationSettings==='function'){
      try{bridge.openAppLocationSettings();return}catch(e){}
    }

    if(bridge&&typeof bridge.requestLocationPermission==='function'){
      try{
        const btn=document.querySelector('.phone-location-permission button');
        if(btn){btn.disabled=true;btn.textContent='Opening permission…'}
        bridge.requestLocationPermission();
        return;
      }catch(e){}
    }

    if(!navigator.geolocation)return toast('Location is not supported on this device');
    const btn=document.querySelector('.phone-location-permission button');
    if(btn){btn.disabled=true;btn.textContent='Requesting…'}

    navigator.geolocation.getCurrentPosition(async()=>{
      toast('📍 Phone location permission allowed');
      if(typeof openLocationSettings==='function')await openLocationSettings();
    },async err=>{
      const message=err?.code===1
        ? 'Location permission is blocked. Enable Location for SevaHub in your phone settings.'
        : err?.code===2
          ? 'Turn on your phone GPS and try again.'
          : 'Could not get phone location. Try again.';
      toast(message);
      if(typeof openLocationSettings==='function')await openLocationSettings();
    },{enableHighAccuracy:true,maximumAge:0,timeout:15000});
  };

  window.addEventListener('sevahub:native-location-permission',async e=>{
    const granted=Boolean(e?.detail?.granted);
    toast(granted?'📍 Phone location allowed':'Location is still blocked for SevaHub');
    if(typeof openLocationSettings==='function'){
      await openLocationSettings();
      if(granted)setTimeout(()=>{
        const live=document.getElementById('startLocationButton');
        if(live)live.focus();
      },100);
    }
  });

  if(typeof openLocationSettings==='function'){
    const originalOpenLocationSettings=openLocationSettings;
    const wrapped=async function(){
      const result=await originalOpenLocationSettings.apply(this,arguments);
      setTimeout(injectPermissionCard,0);
      return result;
    };
    try{openLocationSettings=wrapped}catch(e){}
    window.openLocationSettings=wrapped;
  }

  const style=document.createElement('style');
  style.textContent=`
    .phone-location-permission{display:grid;grid-template-columns:42px 1fr auto;gap:12px;align-items:center;margin:14px 0;padding:13px 14px;border-radius:15px;background:#fff;border:1px solid #ecd3bf}.phone-location-icon{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:#fff1df;font-size:20px}.phone-location-copy{display:flex;flex-direction:column;gap:3px;min-width:0}.phone-location-copy span{font-size:12px;color:#75645a;line-height:1.4}.phone-location-permission.granted{border-color:#b9e6c7;background:#f1fbf4}.phone-location-permission.denied{border-color:#f1c6bc;background:#fff5f2}.phone-location-permission.needs-https{border-color:#f0b36c;background:#fff7e8}.dark .phone-location-permission,body.dark .phone-location-permission{background:#11181c;border-color:#28343b;color:#eef1f3}.dark .phone-location-icon,body.dark .phone-location-icon{background:#171310}.dark .phone-location-copy span,body.dark .phone-location-copy span{color:#aeb8be}@media(max-width:650px){.phone-location-permission{grid-template-columns:42px 1fr}.phone-location-permission button{grid-column:1/-1;width:100%}}
  `;
  document.head.appendChild(style);
})();
