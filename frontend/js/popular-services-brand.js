/* Add the SevaHub Android launcher/settings mark beside Popular services in narrow app/WebView layouts. */
(function(){
  const originalUserServices=typeof userServices==='function'?userServices:null;

  function appMark(){
    return `
      <span class="popular-services-app-logo" aria-hidden="true">
        <svg viewBox="0 0 108 108" xmlns="http://www.w3.org/2000/svg" role="img">
          <rect width="108" height="108" rx="22" fill="#FF8A1F"/>
          <rect x="22" y="22" width="64" height="64" fill="#080D12"/>
          <path fill="#FFFFFF" d="M54 29 L77 43 L71 52 L58 44 L58 75 L47 75 L47 44 L34 52 L28 43 Z"/>
          <rect x="47" y="61" width="11" height="14" fill="#FF8A1F"/>
        </svg>
      </span>`;
  }

  function decoratePopularServices(){
    const box=document.getElementById('userContent');
    if(!box)return;
    const headings=[...box.querySelectorAll('h2')];
    const heading=headings.find(h=>String(h.textContent||'').trim().toLowerCase()==='popular services');
    if(!heading||heading.querySelector('.popular-services-app-logo'))return;
    heading.classList.add('popular-services-heading');
    heading.insertAdjacentHTML('afterbegin',appMark());
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
