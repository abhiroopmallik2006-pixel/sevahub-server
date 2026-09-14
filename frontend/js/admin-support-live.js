/* Realtime Cooperative Admin support updates.
   Important: this file never replaces the working admin REST send function. */
(function(){
  let adminSupportSocket=null;

  function ensureAdminSocket(){
    try{
      if(!window.io||!adminToken)return null;
      if(adminSupportSocket)return adminSupportSocket;
      adminSupportSocket=window.io({transports:['websocket','polling']});
      adminSupportSocket.on('connect',()=>adminSupportSocket.emit('join-admin-support',adminToken));

      adminSupportSocket.on('support-message',payload=>{
        if(String(payload?.senderType||'').toUpperCase()!=='MEMBER')return;
        const incomingId=Number(payload?.ticketId);
        const openId=Number(activeAdminSupportTicketId||0);
        if(incomingId&&openId&&incomingId===openId&&document.getElementById('adminSupportChatModal')){
          Promise.resolve(loadAdminSupportChat()).catch(()=>{});
        }else if(currentSection==='support'){
          Promise.resolve(openSection('support')).catch(()=>{});
        }
      });

      adminSupportSocket.on('support-ticket:refresh',()=>{
        if(currentSection==='support'&&!document.getElementById('adminSupportChatModal')){
          Promise.resolve(openSection('support')).catch(()=>{});
        }
      });
      return adminSupportSocket;
    }catch(e){
      console.warn('Admin support realtime unavailable',e);
      return null;
    }
  }

  /* Do not wrap openAdminSupportChat/sendAdminSupportMessage. Those original
     functions are the source of truth and must always be allowed to run. */
  const originalLogin=globalThis.adminLogin;
  if(typeof originalLogin==='function'){
    globalThis.adminLogin=async function(...args){
      const result=await originalLogin.apply(this,args);
      ensureAdminSocket();
      return result;
    };
  }

  const originalLogout=globalThis.adminLogout;
  if(typeof originalLogout==='function'){
    globalThis.adminLogout=function(...args){
      try{adminSupportSocket?.disconnect()}catch(e){}
      adminSupportSocket=null;
      return originalLogout.apply(this,args);
    };
  }

  if(adminToken)ensureAdminSocket();
})();