/* Open the relevant SevaHub page when a saved notification is tapped. */
(function(){
  let rowsCache=new Map();
  let loadingRows=null;

  function currentRole(){
    try{return state?.role||null}catch(e){return null}
  }

  function bookingIdFrom(n){
    const text=`${n?.title||''} ${n?.message||''}`;
    const match=text.match(/Booking\s*#\s*(\d+)/i)||text.match(/#\s*(\d+)/);
    return match?Number(match[1]):null;
  }

  function targetLabel(type){
    const t=String(type||'').toUpperCase();
    if(t.includes('CHAT'))return 'Open chat →';
    if(t.includes('PAY'))return 'Open payment report →';
    if(t.includes('BARGAIN'))return 'Open bargain →';
    if(t.includes('LOCATION'))return 'Open live location →';
    if(t.includes('REWARD')||t.includes('GEM'))return 'Open GEMS →';
    return 'Open booking →';
  }

  async function loadRows(force=false){
    if(isDemo)return [];
    if(!force&&rowsCache.size)return [...rowsCache.values()];
    if(loadingRows)return loadingRows;
    loadingRows=(async()=>{
      try{
        const result=await api('/notifications?limit=200');
        const rows=result.data?.rows||[];
        rowsCache=new Map(rows.map(n=>[Number(n.id),n]));
        return rows;
      }finally{loadingRows=null}
    })();
    return loadingRows;
  }

  function clickDashboardAction(fnName){
    const dashboard=document.querySelector('main.dashboard');
    const buttons=[...(dashboard?.querySelectorAll(':scope > .tabs button')||[])];
    const button=buttons.find(b=>String(b.getAttribute('onclick')||'').includes(`${fnName}(`));
    if(button){button.click();return true}
    const fn=globalThis[fnName];
    if(typeof fn==='function'){fn();return true}
    return false;
  }

  function clickContentAction(snippet){
    const buttons=[...document.querySelectorAll('#userContent button[onclick],#workerContent button[onclick]')];
    const button=buttons.find(b=>String(b.getAttribute('onclick')||'').includes(snippet));
    if(button){button.click();return true}
    return false;
  }

  async function openTarget(n){
    const type=String(n?.type||'BOOKING').toUpperCase();
    const role=currentRole();
    const bookingId=bookingIdFrom(n);

    if(type.includes('CHAT')){
      clickDashboardAction(role==='WORKER'?'workerBookings':'userBookings');
      if(bookingId){
        setTimeout(()=>{
          if(!clickContentAction(`openBookingChat(${bookingId}`)&&typeof openBookingChat==='function'){
            openBookingChat(bookingId,role||'USER');
          }
        },260);
      }
      return;
    }

    if(type.includes('PAY')){
      clickDashboardAction(role==='WORKER'?'workerEarnings':'userSpendHistory');
      if(bookingId&&typeof openBookingReport==='function'){
        setTimeout(()=>openBookingReport(bookingId,role||'USER'),300);
      }
      return;
    }

    if(type.includes('BARGAIN')){
      if(role==='WORKER'){
        clickDashboardAction('workerBargains');
      }else{
        clickDashboardAction('userBookings');
        if(bookingId){
          setTimeout(()=>{
            if(!clickContentAction(`openExistingBargain(${bookingId})`)&&typeof openExistingBargain==='function'){
              openExistingBargain(bookingId);
            }
          },260);
        }
      }
      return;
    }

    if(type.includes('LOCATION')){
      clickDashboardAction(role==='WORKER'?'workerBookings':'userBookings');
      if(bookingId&&typeof openBookingLocation==='function'){
        setTimeout(()=>openBookingLocation(bookingId),300);
      }
      return;
    }

    if(type.includes('REWARD')||type.includes('GEM')){
      if(role==='USER')clickDashboardAction('userRewards');
      else clickDashboardAction('workerEarnings');
      return;
    }

    /* Booking, completion OTP, review and other account activity. */
    clickDashboardAction(role==='WORKER'?'workerBookings':'userBookings');
  }

  async function openNotification(id){
    const notificationId=Number(id);
    if(!Number.isInteger(notificationId)||notificationId<1)return;
    try{
      if(typeof markNotificationRead==='function')await markNotificationRead(notificationId);
      let n=rowsCache.get(notificationId);
      if(!n){await loadRows(true);n=rowsCache.get(notificationId)}
      if(!n)return toast('Notification details are unavailable');
      await openTarget(n);
    }catch(e){toast(e.message||'Could not open notification')}
  }
  window.openNotification=openNotification;

  async function decorateItems(){
    if(isDemo)return;
    const items=[...document.querySelectorAll('.notification-item[data-notification-id]')];
    if(!items.length)return;
    try{await loadRows()}catch(e){return}
    items.forEach(item=>{
      const id=Number(item.dataset.notificationId);
      const n=rowsCache.get(id);
      if(!n)return;
      item.setAttribute('role','button');
      item.tabIndex=0;
      item.setAttribute('aria-label',`${n.title||'Notification'}. ${targetLabel(n.type)}`);
      if(!item.querySelector('.notification-open-hint')){
        const hint=document.createElement('span');
        hint.className='muted notification-open-hint';
        hint.textContent=targetLabel(n.type);
        item.querySelector('.notification-main')?.appendChild(hint);
      }
    });
  }

  document.addEventListener('click',async e=>{
    const item=e.target.closest('.notification-item[data-notification-id]');
    if(!item)return;
    e.preventDefault();
    e.stopImmediatePropagation();
    await openNotification(item.dataset.notificationId);
  },true);

  document.addEventListener('keydown',async e=>{
    if(!['Enter',' '].includes(e.key))return;
    const item=e.target.closest('.notification-item[data-notification-id]');
    if(!item)return;
    e.preventDefault();
    e.stopImmediatePropagation();
    await openNotification(item.dataset.notificationId);
  },true);

  const observer=new MutationObserver(()=>{
    if(document.querySelector('.notification-center'))decorateItems().catch(()=>{});
  });
  observer.observe(document.body,{childList:true,subtree:true});
  setTimeout(()=>decorateItems().catch(()=>{}),0);
})();
