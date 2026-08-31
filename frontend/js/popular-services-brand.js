/* Add the settings gear icon beside Popular services in narrow app/WebView layouts. */
(function(){
  const originalUserServices=typeof userServices==='function'?userServices:null;

  function settingsMark(){
    return `
      <span class="popular-services-settings-icon" aria-hidden="true">
        <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" role="img">
          <g fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="24" cy="24" r="6.5"/>
            <path d="M24 5.5v5M24 37.5v5M5.5 24h5M37.5 24h5M10.9 10.9l3.6 3.6M33.5 33.5l3.6 3.6M37.1 10.9l-3.6 3.6M14.5 33.5l-3.6 3.6"/>
            <circle cx="24" cy="24" r="14.2"/>
          </g>
        </svg>
      </span>`;
  }

  function decoratePopularServices(){
    const box=document.getElementById('userContent');
    if(!box)return;
    const headings=[...box.querySelectorAll('h2')];
    const heading=headings.find(h=>String(h.textContent||'').trim().toLowerCase()==='popular services');
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
