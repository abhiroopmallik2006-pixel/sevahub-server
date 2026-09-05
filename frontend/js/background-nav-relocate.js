/* Relocate the existing dashboard background chooser into the same top bar as theme/profile/logout. */
(function(){
  let controlsRef=null;
  let scheduled=false;

  function findThemeButton(actions){
    return actions?.querySelector('button.theme[onclick*="toggleTheme"]')||null;
  }

  function place(){
    scheduled=false;
    if(!document.querySelector('main.dashboard'))return;

    const connected=document.querySelector('.sev-dashboard-bg-controls');
    if(connected)controlsRef=connected;

    const actions=document.querySelector('.nav .nav-actions');
    if(!actions||!controlsRef)return;

    if(controlsRef.parentElement!==actions){
      const theme=findThemeButton(actions);
      const profile=actions.querySelector('.account-profile-button');
      const logout=actions.querySelector('button[onclick*="logout"]');
      actions.insertBefore(controlsRef,theme||profile||logout||null);
    }

    controlsRef.classList.add('sev-dashboard-bg-in-nav');
  }

  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(place);
  }

  const observer=new MutationObserver(schedule);
  observer.observe(document.body,{childList:true,subtree:true});

  document.addEventListener('DOMContentLoaded',()=>{
    schedule();
    setTimeout(schedule,80);
    setTimeout(schedule,250);
  },{once:true});

  if(document.readyState!=='loading'){
    schedule();
    setTimeout(schedule,80);
  }
})();
