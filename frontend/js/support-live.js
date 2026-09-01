/* Realtime support updates for User/Worker without replacing the working REST send flow. */
(function(){
  let supportSocket=null;
  let activeTicketId=null;

  function currentToken(){
    try{return sessionStorage.getItem('sevahub_token')||localStorage.getItem('sevahub_token')||''}catch(e){return ''}
  }

  function refreshOpenSupport(){
    if(activeTicketId&&document.getElementById('supportHumanChat')){
      Promise.resolve(window.loadSupportHumanChat?.()).catch(()=>{});
    }
    if(document.getElementById('supportTicketList')){
      Promise.resolve(window.loadSupportTickets?.()).catch(()=>{});
    }
  }

  function ensureSocket(){
    try{
      if(typeof isDemo!=='undefined'&&isDemo)return null;
      if(!window.io||!state?.user?.id)return null;
      if(supportSocket)return supportSocket;
      supportSocket=window.io({transports:['websocket','polling']});
      supportSocket.on('connect',()=>supportSocket.emit('join-user-room',state.user.id));

      /* Admin replies already create a SUPPORT notification on the server.
         Use that committed server event to refresh the open conversation. */
      supportSocket.on('notification:new',payload=>{
        if(String(payload?.type||'').toUpperCase()==='SUPPORT')refreshOpenSupport();
      });

      /* Kept for compatibility with support-message events from newer server builds. */
      supportSocket.on('support-message',payload=>{
        if(String(payload?.senderType||'').toUpperCase()!=='ADMIN')return;
        const id=Number(payload?.ticketId);
        if(!id||!activeTicketId||id===Number(activeTicketId))refreshOpenSupport();
      });
      return supportSocket;
    }catch(e){
      console.warn('Support realtime unavailable',e);
      return null;
    }
  }

  const originalOpen=window.openSupportHumanChat;
  if(typeof originalOpen==='function'){
    window.openSupportHumanChat=async function(id,subject){
      activeTicketId=Number(id);
      ensureSocket();
      return originalOpen.call(this,id,subject);
    };
  }

  const originalClose=window.closeSupportHumanChat;
  if(typeof originalClose==='function'){
    window.closeSupportHumanChat=function(...args){
      activeTicketId=null;
      return originalClose.apply(this,args);
    };
  }

  const originalOpenCenter=window.openSupportCenter;
  if(typeof originalOpenCenter==='function'){
    window.openSupportCenter=async function(...args){
      ensureSocket();
      return originalOpenCenter.apply(this,args);
    };
  }

  /* Preserve the original, already-working sender. Only after it finishes do
     we tell the admin socket room to refresh. No duplicate REST request here. */
  const originalSend=window.sendSupportHumanMessage;
  if(typeof originalSend==='function'){
    window.sendSupportHumanMessage=async function(e){
      const id=Number(activeTicketId);
      const result=await originalSend.call(this,e);
      if(id){
        const socket=ensureSocket();
        socket?.emit('support-member-sent',{token:currentToken(),ticketId:id});
      }
      return result;
    };
  }

  try{
    const originalLogout=globalThis.logout;
    if(typeof originalLogout==='function'&&!originalLogout.__supportLiveWrapped){
      const wrapped=function(...args){
        try{supportSocket?.disconnect()}catch(e){}
        supportSocket=null;activeTicketId=null;
        return originalLogout.apply(this,args);
      };
      wrapped.__supportLiveWrapped=true;
      globalThis.logout=wrapped;
    }
  }catch(e){}

  try{if(state?.user)ensureSocket()}catch(e){}
})();