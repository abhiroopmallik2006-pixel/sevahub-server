/* Mobile/App location permission helper. Adds a clear phone permission action inside SevaHub location settings. */
(function(){
  function isPhoneLike(){
    const ua=String(navigator.userAgent||'');
    return /Android|iPhone|iPad|Mobile|SevaHubAndroid/i.test(ua) || window.innerWidth<=900;
  }

  async function permissionState(){
    if(!navigator.permissions?.query)return 'prompt';
    try{return (await navigator.permissions.query({name:'geolocation'})).state||'prompt'}catch(e){return 'prompt'}
  }

  function labelFor(state){
    if(state==='granted')return {title:'Phone location allowed',detail:'SevaHub can request your phone GPS when you choose to share it.',button:'✓ Location allowed'};
    if(state==='denied')return {title:'Phone location blocked',detail:'Allow Location for SevaHub from your phone app/browser settings, then return here.',button:'📱 Try location permission again'};
    return {title:'Allow phone location',detail:'Android/iPhone will ask whether SevaHub may use this device’s location.',button:'📱 Allow phone location'};
  }

  async function injectPermissionCard(){
    if(!isPhoneLike())return;
    const body=document.getElementById('locationModalBody');
    if(!body || body.querySelector('.phone-location-permission'))return;

    const state=await permissionState();
    if(!document.getElementById('locationModalBody') || body!==document.getElementById('locationModalBody'))return;
    const copy=labelFor(state);
    const card=document.createElement('div');
    card.className=`phone-location-permission ${state}`;
    card.innerHTML=`
      <div class="phone-location-icon">📱</div>
      <div class="phone-location-copy">
        <b>${copy.title}</b>
        <span>${copy.detail}</span>
      </div>
      <button class="btn secondary small" type="button" onclick="requestPhoneLocationPermission()" ${state==='granted'?'disabled':''}>${copy.button}</button>`;

    const privacy=body.querySelector('.location-privacy-note');
    if(privacy)privacy.before(card);else body.prepend(card);
  }

  window.requestPhoneLocationPermission=function(){
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
    .phone-location-permission{display:grid;grid-template-columns:42px 1fr auto;gap:12px;align-items:center;margin:14px 0;padding:13px 14px;border-radius:15px;background:#fff;border:1px solid #ecd3bf}.phone-location-icon{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:#fff1df;font-size:20px}.phone-location-copy{display:flex;flex-direction:column;gap:3px;min-width:0}.phone-location-copy span{font-size:12px;color:#75645a;line-height:1.4}.phone-location-permission.granted{border-color:#b9e6c7;background:#f1fbf4}.phone-location-permission.denied{border-color:#f1c6bc;background:#fff5f2}.dark .phone-location-permission,body.dark .phone-location-permission{background:#11181c;border-color:#28343b;color:#eef1f3}.dark .phone-location-icon,body.dark .phone-location-icon{background:#171310}.dark .phone-location-copy span,body.dark .phone-location-copy span{color:#aeb8be}@media(max-width:650px){.phone-location-permission{grid-template-columns:42px 1fr}.phone-location-permission button{grid-column:1/-1;width:100%}}
  `;
  document.head.appendChild(style);
})();
