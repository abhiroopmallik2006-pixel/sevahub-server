/* Realtime bridge for User/Worker <-> Cooperative Admin support chat.
   REST remains the source of truth; Socket.IO only triggers immediate refresh
   after a message has been committed successfully. */
(function(){
  let supportSocket=null;
  let activeTicketId=null;

  function currentToken(){
    try{return sessionStorage.getItem('sevahub_token')||localStorage.getItem('sevahub_token')||''}catch(e){return ''}
  }

  function ensureSocket(){
    try{
      if(typeof isDemo!=='undefined'&&isDemo)return null;
      if(!window.io||!state?.user)return null;
      if(supportSocket)return supportSocket;
      supportSocket=window.io({transports:['websocket','polling']});
      supportSocket.on('connect',()=>{
        if(state?.user?.id)supportSocket.emit('join-user-room',state.user.id);
      });
      supportSocket.on('support-message',payload=>{
        if(String(payload?.senderType||'').toUpperCase()!=='ADMIN')return;
        const id=Number(payload?.ticketId);
        if(id&&id===Number(activeTicketId)&&document.getElementById('supportHumanChat')){
          Promise.resolve(window.loadSupportHumanChat?.()).catch(()=>{});
        }
        if(document.getElementById('supportTicketList')){
          Promise.resolve(window.loadSupportTickets?.()).catch(()=>{});
        }
      });
      return supportSocket;
    }catch(e){
      console.warn('Support live socket unavailable',e);
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

  const originalSend=window.sendSupportHumanMessage;
  if(typeof originalSend==='function'){
    window.sendSupportHumanMessage=async function(e){
      if(typeof isDemo!=='undefined'&&isDemo)return originalSend.call(this,e);
      e.preventDefault();
      const id=Number(activeTicketId);
      const input=document.getElementById('supportHumanInput');
      const message=input?.value.trim()||'';
      if(!id||!message)return;
      const btn=e.target.querySelector('button[type=submit]');
      try{
        if(btn){btn.disabled=true;btn.textContent='…'}
        await api(`/support/${id}/messages`,{method:'POST',body:JSON.stringify({message})});
        if(input)input.value='';
        const socket=ensureSocket();
        socket?.emit('support-member-sent',{token:currentToken(),ticketId:id});
        await window.loadSupportHumanChat?.();
        await window.loadSupportTickets?.();
      }catch(err){
        if(typeof toast==='function')toast(err.message||'Could not send support message');
      }finally{
        if(btn){btn.disabled=false;btn.textContent='Send'}
      }
    };
  }

  const originalSubmit=window.submitSupportTicket;
  if(typeof originalSubmit==='function'){
    window.submitSupportTicket=async function(...args){
      const result=await originalSubmit.apply(this,args);
      const socket=ensureSocket();
      socket?.emit('support-list-refresh',{token:currentToken()});
      return result;
    };
  }

  const originalResolve=window.resolveSupportTicket;
  if(typeof originalResolve==='function'){
    window.resolveSupportTicket=async function(...args){
      const result=await originalResolve.apply(this,args);
      const socket=ensureSocket();
      socket?.emit('support-list-refresh',{token:currentToken()});
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
