/* Persistent notification center for USER + WORKER. */
(function(){
  const originalUserNotifications=typeof userNotifications==='function'?userNotifications:null;
  const originalRenderUser=typeof renderUser==='function'?renderUser:null;
  const originalRenderWorker=typeof renderWorker==='function'?renderWorker:null;
  let notificationSocket=null;
  let socketUserId=null;
  let pollTimer=null;

  function loggedIn(){
    try{return Boolean(state?.user&&state?.role)}catch(e){return false}
  }

  function iconFor(type){
    const t=String(type||'').toUpperCase();
    if(t.includes('CHAT'))return '💬';
    if(t.includes('PAY'))return '💳';
    if(t.includes('REVIEW'))return '⭐';
    if(t.includes('LOCATION'))return '📍';
    if(t.includes('REWARD')||t.includes('GEM'))return '💎';
    if(t.includes('BOOK'))return '📋';
    return '🔔';
  }

  function formatTime(value){
    if(!value)return '';
    const d=new Date(value);
    if(Number.isNaN(d.getTime()))return '';
    return d.toLocaleString([],{
      day:'2-digit',month:'short',year:'numeric',
      hour:'2-digit',minute:'2-digit'
    });
  }

  function ensureWorkerButton(){
    if(!loggedIn()||state.role!=='WORKER')return;
    const dashboard=document.querySelector('main.dashboard');
    const tabBar=dashboard?.querySelector(':scope > .tabs');
    if(!tabBar||tabBar.querySelector('[data-notification-tab="worker"]'))return;
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='btn secondary notification-tab-btn';
    btn.dataset.notificationTab='worker';
    btn.setAttribute('onclick','workerNotifications()');
    btn.innerHTML='🔔 Notifications <span class="notification-badge hidden" data-notification-badge>0</span>';
    tabBar.appendChild(btn);
  }

  function decorateUserButton(){
    if(!loggedIn()||state.role!=='USER')return;
    const dashboard=document.querySelector('main.dashboard');
    const buttons=[...(dashboard?.querySelectorAll(':scope > .tabs button')||[])];
    const btn=buttons.find(b=>String(b.getAttribute('onclick')||'').includes('userNotifications()'));
    if(!btn)return;
    btn.classList.add('notification-tab-btn');
    btn.dataset.notificationTab='user';
    if(!btn.querySelector('[data-notification-badge]')){
      btn.insertAdjacentHTML('beforeend',' <span class="notification-badge hidden" data-notification-badge>0</span>');
    }
  }

  function setBadge(count){
    const n=Math.max(0,Number(count)||0);
    document.querySelectorAll('[data-notification-badge]').forEach(b=>{
      b.textContent=n>99?'99+':String(n);
      b.classList.toggle('hidden',n===0);
    });
  }

  async function refreshUnreadCount(){
    if(!loggedIn()||isDemo){setBadge(0);return}
    try{
      const r=await api('/notifications?limit=1');
      setBadge(r.data?.unread||0);
    }catch(e){}
  }

  async function markNotificationRead(id){
    if(isDemo)return;
    try{
      await api(`/notifications/${Number(id)}/read`,{method:'PUT'});
      const item=document.querySelector(`[data-notification-id="${Number(id)}"]`);
      if(item){
        item.classList.remove('unread');
        item.querySelector('.notification-unread-dot')?.remove();
      }
      await refreshUnreadCount();
    }catch(e){toast(e.message)}
  }
  window.markNotificationRead=markNotificationRead;

  async function markAllNotificationsRead(){
    if(isDemo)return;
    try{
      await api('/notifications/all/read',{method:'PUT'});
      document.querySelectorAll('.notification-item.unread').forEach(item=>{
        item.classList.remove('unread');
        item.querySelector('.notification-unread-dot')?.remove();
      });
      setBadge(0);
      toast('All notifications marked as read');
    }catch(e){toast(e.message)}
  }
  window.markAllNotificationsRead=markAllNotificationsRead;

  function renderRows(rows){
    if(!rows.length)return '<div class="empty">No notifications yet.</div>';
    return `<div class="notification-list">${rows.map(n=>`
      <div class="notification-item ${n.is_read?'':'unread'}" data-notification-id="${Number(n.id)}" onclick="markNotificationRead(${Number(n.id)})">
        <div class="notification-icon">${iconFor(n.type)}</div>
        <div class="notification-main">
          <div class="notification-title-row">
            <b>${n.is_read?'':'<span class="notification-unread-dot"></span>'}${esc(n.title||'Notification')}</b>
            <span class="muted notification-time">${esc(formatTime(n.created_at))}</span>
          </div>
          <p class="notification-message">${esc(n.message||'')}</p>
          ${n.type?`<span class="muted">${esc(String(n.type).replaceAll('_',' '))}</span>`:''}
        </div>
      </div>`).join('')}</div>`;
  }

  async function openNotificationCenter(role){
    const box=document.getElementById(role==='WORKER'?'workerContent':'userContent');
    if(!box)return;
    box.innerHTML='<div class="empty">Loading notifications...</div>';

    if(isDemo){
      if(role==='USER'&&originalUserNotifications)return originalUserNotifications();
      const rows=(db().notifications||[]).filter(n=>Number(n.userId)===Number(state.user.id)).reverse();
      box.innerHTML=`<div class="card panel notification-center"><div class="split"><div><h2>🔔 Notifications</h2><p class="muted">Saved activity and updates for your SevaHub account.</p></div></div>${rows.length?`<div class="notification-list">${rows.map(n=>`<div class="notification-item"><div class="notification-icon">🔔</div><div class="notification-main"><b>${esc(n.title||'Notification')}</b><p class="notification-message">${esc(n.message||'')}</p></div></div>`).join('')}</div>`:'<div class="empty">No notifications yet.</div>'}</div>`;
      return;
    }

    try{
      const r=await api('/notifications?limit=200');
      const rows=r.data?.rows||[];
      box.innerHTML=`<div class="card panel notification-center">
        <div class="split">
          <div><h2>🔔 Notifications</h2><p class="muted">Booking, chat, payment, location and account updates are saved here.</p></div>
          ${Number(r.data?.unread||0)>0?'<button class="btn secondary small" type="button" onclick="markAllNotificationsRead()">Mark all read</button>':''}
        </div>
        ${renderRows(rows)}
      </div>`;
      setBadge(r.data?.unread||0);
    }catch(e){
      box.innerHTML=`<div class="empty">${esc(e.message)}</div>`;
    }
  }

  window.userNotifications=function(){return openNotificationCenter('USER')};
  window.workerNotifications=function(){return openNotificationCenter('WORKER')};
  try{userNotifications=window.userNotifications}catch(e){}

  function ensureSocket(){
    if(isDemo||!loggedIn()||!window.io)return;
    const uid=Number(state.user.id);
    if(notificationSocket&&socketUserId===uid)return;
    if(notificationSocket){try{notificationSocket.disconnect()}catch(e){}}
    notificationSocket=window.io({transports:['websocket','polling']});
    socketUserId=uid;
    notificationSocket.on('connect',()=>notificationSocket.emit('join-user-room',uid));
    notificationSocket.on('notification:new',payload=>{
      refreshUnreadCount();
      if(document.querySelector('.notification-center')){
        openNotificationCenter(state.role).catch(()=>{});
      }
      if(payload?.title)toast(`🔔 ${payload.title}`);
    });
  }

  function ensureUi(){
    if(!loggedIn()){
      setBadge(0);
      if(notificationSocket){try{notificationSocket.disconnect()}catch(e){};notificationSocket=null;socketUserId=null}
      return;
    }
    decorateUserButton();
    ensureWorkerButton();
    ensureSocket();
  }

  if(originalRenderUser){
    renderUser=function(app){
      const r=originalRenderUser.apply(this,arguments);
      setTimeout(()=>{ensureUi();refreshUnreadCount()},0);
      return r;
    };
  }

  if(originalRenderWorker){
    renderWorker=function(app){
      const r=originalRenderWorker.apply(this,arguments);
      setTimeout(()=>{ensureUi();refreshUnreadCount()},0);
      return r;
    };
  }

  setTimeout(()=>{ensureUi();refreshUnreadCount()},0);
  pollTimer=setInterval(()=>{if(loggedIn()){ensureUi();refreshUnreadCount()}},30000);
})();
