/* Realtime bridge for Cooperative Admin support chat.
   Messages are still written through authenticated admin REST endpoints; this
   socket only makes newly committed User/Worker messages appear instantly. */
(function(){
  let adminSupportSocket=null;
  let liveTicketId=null;
  let liveUserId=null;

  function ensureAdminSocket(){
    try{
      if(!window.io||!adminToken)return null;
      if(adminSupportSocket)return adminSupportSocket;
      adminSupportSocket=window.io({transports:['websocket','polling']});
      adminSupportSocket.on('connect',()=>adminSupportSocket.emit('join-admin-support',adminToken));
      adminSupportSocket.on('support-message',payload=>{
        if(String(payload?.senderType||'').toUpperCase()!=='MEMBER')return;
        const id=Number(payload?.ticketId);
        if(id&&id===Number(liveTicketId)&&document.getElementById('adminSupportChatModal')){
          Promise.resolve(globalThis.loadAdminSupportChat?.()).catch(()=>{});
        }else if(currentSection==='support'){
          Promise.resolve(globalThis.openSection?.('support')).catch(()=>{});
        }
      });
      adminSupportSocket.on('support-ticket:refresh',()=>{
        if(currentSection==='support'&&!document.getElementById('adminSupportChatModal')){
          Promise.resolve(globalThis.openSection?.('support')).catch(()=>{});
        }
      });
      return adminSupportSocket;
    }catch(e){
      console.warn('Admin support live socket unavailable',e);
      return null;
    }
  }

  async function refreshLiveTicketOwner(){
    if(!liveTicketId)return;
    try{
      const r=await adminApi(`/support/${liveTicketId}/messages`);
      liveUserId=Number(r?.data?.ticket?.user_id)||null;
    }catch(e){liveUserId=null}
  }

  const originalOpen=globalThis.openAdminSupportChat;
  if(typeof originalOpen==='function'){
    globalThis.openAdminSupportChat=async function(id){
      liveTicketId=Number(id);liveUserId=null;
      ensureAdminSocket();
      const result=await originalOpen.call(this,id);
      await refreshLiveTicketOwner();
      return result;
    };
  }

  const originalClose=globalThis.closeAdminSupportChat;
  if(typeof originalClose==='function'){
    globalThis.closeAdminSupportChat=function(...args){
      liveTicketId=null;liveUserId=null;
      return originalClose.apply(this,args);
    };
  }

  const originalSend=globalThis.sendAdminSupportMessage;
  if(typeof originalSend==='function'){
    globalThis.sendAdminSupportMessage=async function(e){
      e.preventDefault();
      const id=Number(liveTicketId);
      const input=document.getElementById('adminSupportMessageInput');
      const message=input?.value.trim()||'';
      if(!id||!message)return;
      const btn=e.target.querySelector('button[type=submit]');
      try{
        if(btn){btn.disabled=true;btn.textContent='Sending…'}
        await adminApi(`/support/${id}/messages`,{method:'POST',body:JSON.stringify({message})});
        if(!liveUserId)await refreshLiveTicketOwner();
        const socket=ensureAdminSocket();
        if(liveUserId)socket?.emit('support-admin-sent',{token:adminToken,ticketId:id,userId:liveUserId});
        if(input)input.value='';
        await globalThis.loadAdminSupportChat?.();
      }catch(err){
        alert(err.message||'Could not send support reply');
      }finally{
        if(btn){btn.disabled=false;btn.textContent='Send reply'}
      }
    };
  }

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
      adminSupportSocket=null;liveTicketId=null;liveUserId=null;
      return originalLogout.apply(this,args);
    };
  }

  if(adminToken)ensureAdminSocket();
})();
