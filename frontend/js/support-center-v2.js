/* SevaHub Support Center v2
   Stable by design: no MutationObserver, no polling and no background API calls.
   Tickets, Support AI and human chat run only when the user explicitly opens/uses Support. */
(function(){
  const DEMO_KEY='sevahub_support_tickets_v2';
  const categoryOptions=[
    ['BOOKING','Booking'],['PAYMENT','Payment'],['BARGAINING','Bargaining'],['LOCATION','Location'],
    ['ACCOUNT','Account'],['SAFETY','Safety'],['TECHNICAL','Technical'],['OTHER','Other']
  ];
  let activeSupportChatTicketId=null;
  let activeSupportChatSubject='';

  function hi(){
    try{return localStorage.getItem('sevahub_language_v1')==='hi'}catch(e){return false}
  }

  function supportCopy(){
    return hi()?{
      tab:'🛟 सहायता',title:'🛟 सहायता केंद्र',intro:'Booking, payment, bargaining, location, account या technical issue के लिए ticket बनाएँ।',
      aiTitle:'✨ AI Support Assistant',aiIntro:'Issue बताइए। AI पहले troubleshooting और next step बताएगा; जरूरत होने पर नीचे support ticket बना सकते हैं।',
      aiHello:'नमस्ते! अपना support issue बताइए — जैसे “payment update नहीं हुआ” या “booking status समझ नहीं आ रहा”.',
      aiPlaceholder:'अपना support issue लिखें…',aiAsk:'AI से पूछें',aiThinking:'SevaHub Support AI सोच रहा है…',
      aiNote:'AI guidance देता है; payment/refund/account/ticket में बदलाव अपने-आप नहीं करता। OTP, UPI PIN, password या card PIN कभी न भेजें।',
      quickBooking:'📋 Booking help',quickPayment:'💳 Payment help',quickLocation:'📍 Location help',
      quick:'जल्दी मदद',q1:'Booking issue',a1:'Booking number जोड़ें ताकि issue जल्दी identify हो सके।',
      q2:'Payment issue',a2:'Payment ID/UPI PIN जैसी sensitive details message में न लिखें।',
      q3:'Safety issue',a3:'Safety category चुनें और जरूरी जानकारी short और clear रखें।',
      newTicket:'नया support ticket',category:'Category',subject:'Subject',booking:'Booking # (optional)',message:'Issue details',send:'Ticket भेजें',
      myTickets:'मेरे tickets',loading:'Tickets load हो रहे हैं…',empty:'अभी कोई support ticket नहीं है।',resolve:'Resolved mark करें',
      created:'Support ticket बन गया',resolved:'Ticket resolved mark हो गया',open:'OPEN',resolvedLabel:'RESOLVED',
      chat:'💬 Admin से chat',chatTitle:'Support Admin Chat',chatEmpty:'अभी कोई chat message नहीं है। Admin को message भेज सकते हैं।',
      chatPlaceholder:'Admin को message लिखें…',chatSend:'भेजें',chatRefresh:'Refresh',chatClose:'बंद करें',adminLabel:'SevaHub Admin',youLabel:'आप',
      chatNote:'Resolved ticket पर नया message भेजने से ticket दोबारा OPEN हो जाएगा।'
    }:{
      tab:'🛟 Support',title:'🛟 Support Center',intro:'Create a ticket for booking, payment, bargaining, location, account or technical issues.',
      aiTitle:'✨ AI Support Assistant',aiIntro:'Describe the issue first. AI can troubleshoot and suggest the next step; if needed, submit a support ticket below.',
      aiHello:'Hi! Tell me the support issue — for example “my payment is not updated” or “I do not understand my booking status”.',
      aiPlaceholder:'Describe your support issue…',aiAsk:'Ask AI',aiThinking:'SevaHub Support AI is thinking…',
      aiNote:'AI gives guidance only; it does not automatically change payments, refunds, accounts or ticket status. Never share OTPs, UPI PINs, passwords or card PINs.',
      quickBooking:'📋 Booking help',quickPayment:'💳 Payment help',quickLocation:'📍 Location help',
      quick:'Quick help',q1:'Booking issue',a1:'Add the booking number so the issue can be identified quickly.',
      q2:'Payment issue',a2:'Do not include sensitive details such as UPI PINs or passwords.',
      q3:'Safety issue',a3:'Choose the Safety category and keep the important details clear and concise.',
      newTicket:'New support ticket',category:'Category',subject:'Subject',booking:'Booking # (optional)',message:'Issue details',send:'Submit ticket',
      myTickets:'My tickets',loading:'Loading tickets…',empty:'No support tickets yet.',resolve:'Mark resolved',
      created:'Support ticket created',resolved:'Ticket marked resolved',open:'OPEN',resolvedLabel:'RESOLVED',
      chat:'💬 Chat with Admin',chatTitle:'Support Admin Chat',chatEmpty:'No chat messages yet. You can send a message to the cooperative admin.',
      chatPlaceholder:'Message the admin…',chatSend:'Send',chatRefresh:'Refresh',chatClose:'Close',adminLabel:'SevaHub Admin',youLabel:'You',
      chatNote:'Sending a new message on a resolved ticket will reopen the ticket.'
    };
  }

  function contentHost(){
    if(typeof state==='undefined')return null;
    return document.getElementById(state.role==='WORKER'?'workerContent':'userContent');
  }

  function installButton(role){
    try{
      const content=document.getElementById(role==='WORKER'?'workerContent':'userContent');
      if(!content)return;
      const tabs=content.closest('main.dashboard')?.querySelector('.tabs');
      if(!tabs||tabs.querySelector('[data-sevahub-support-tab="1"]'))return;
      const c=supportCopy();
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='btn secondary';
      btn.dataset.sevahubSupportTab='1';
      btn.textContent=c.tab;
      btn.addEventListener('click',()=>window.openSupportCenter());
      tabs.appendChild(btn);
    }catch(e){console.warn('Support button unavailable',e)}
  }

  function wrapDashboardRenderer(name,role){
    const original=globalThis[name];
    if(typeof original!=='function'||original.__sevahubSupportWrapped)return;
    const wrapped=function(...args){
      const result=original.apply(this,args);
      installButton(role);
      return result;
    };
    wrapped.__sevahubSupportWrapped=true;
    globalThis[name]=wrapped;
  }

  function demoTickets(){
    try{return JSON.parse(localStorage.getItem(DEMO_KEY)||'[]')}catch(e){return []}
  }
  function saveDemoTickets(rows){try{localStorage.setItem(DEMO_KEY,JSON.stringify(rows))}catch(e){}}

  function categoryLabel(value){
    const found=categoryOptions.find(x=>x[0]===String(value||''));
    return found?found[1]:String(value||'Other');
  }

  function renderTicketList(rows){
    const c=supportCopy();
    const box=document.getElementById('supportTicketList');
    if(!box)return;
    if(!rows.length){box.innerHTML=`<div class="empty">${esc(c.empty)}</div>`;return;}
    box.innerHTML=rows.map(t=>{
      const status=String(t.status||'OPEN').toUpperCase();
      const open=status!=='RESOLVED';
      const date=t.created_at?new Date(t.created_at).toLocaleString():'';
      const messageCount=Number(t.message_count??(Array.isArray(t.chat)?t.chat.length:0));
      return `<div class="support-ticket-card">
        <div class="split support-ticket-head">
          <div><b>#${Number(t.id)} · ${esc(t.subject||'Support ticket')}</b><div class="muted">${esc(categoryLabel(t.category))}${t.booking_id?` · Booking #${Number(t.booking_id)}`:''}${date?` · ${esc(date)}`:''}${messageCount?` · 💬 ${messageCount}`:''}</div></div>
          <span class="pill ${open?'warning':'success'}">${open?esc(c.open):esc(c.resolvedLabel)}</span>
        </div>
        <p>${esc(t.message||'')}</p>
        <div class="support-ticket-actions">
          <button class="btn small" type="button" onclick='openSupportHumanChat(${Number(t.id)},${JSON.stringify(String(t.subject||'Support ticket'))})'>${esc(c.chat)}</button>
          ${open?`<button class="btn secondary small" type="button" onclick="resolveSupportTicket(${Number(t.id)})">${esc(c.resolve)}</button>`:''}
        </div>
      </div>`;
    }).join('');
  }

  window.openSupportCenter=async function(){
    activeSupportChatTicketId=null;activeSupportChatSubject='';
    const host=contentHost();
    if(!host)return;
    const c=supportCopy();
    const options=categoryOptions.map(([v,label])=>`<option value="${v}">${esc(label)}</option>`).join('');
    host.innerHTML=`<div class="card panel support-center-v2">
      <div class="support-hero"><div class="support-icon">🛟</div><div><h2>${esc(c.title)}</h2><p class="muted">${esc(c.intro)}</p></div></div>

      <section class="support-ai-card">
        <div class="support-ai-head"><div class="support-ai-icon">✨</div><div><h3>${esc(c.aiTitle)}</h3><p class="muted">${esc(c.aiIntro)}</p></div></div>
        <div class="support-ai-actions">
          <button class="btn secondary small" type="button" onclick="supportQuickAI('I need help understanding my booking status.')">${esc(c.quickBooking)}</button>
          <button class="btn secondary small" type="button" onclick="supportQuickAI('My payment is not showing correctly. What should I check?')">${esc(c.quickPayment)}</button>
          <button class="btn secondary small" type="button" onclick="supportQuickAI('My location sharing is not working. What should I check?')">${esc(c.quickLocation)}</button>
        </div>
        <div id="supportAiMessages" class="support-ai-chat"><div class="msg ai-msg">${esc(c.aiHello)}</div></div>
        <form class="support-ai-input" onsubmit="askSupportAI(event)">
          <input id="supportAiInput" maxlength="1600" autocomplete="off" placeholder="${esc(c.aiPlaceholder)}" required>
          <button id="supportAiBtn" class="btn small" type="submit">${esc(c.aiAsk)}</button>
        </form>
        <p class="muted support-ai-note">${esc(c.aiNote)}</p>
      </section>

      <div class="support-quick-grid">
        <div class="support-help-card"><b>📋 ${esc(c.q1)}</b><p class="muted">${esc(c.a1)}</p></div>
        <div class="support-help-card"><b>💳 ${esc(c.q2)}</b><p class="muted">${esc(c.a2)}</p></div>
        <div class="support-help-card"><b>🛡️ ${esc(c.q3)}</b><p class="muted">${esc(c.a3)}</p></div>
      </div>
      <div class="support-layout">
        <form class="support-form" onsubmit="submitSupportTicket(event)">
          <h3>${esc(c.newTicket)}</h3>
          <div class="field"><label>${esc(c.category)}</label><select id="supportCategory">${options}</select></div>
          <div class="field"><label>${esc(c.subject)}</label><input id="supportSubject" maxlength="120" required placeholder="e.g. Payment not updated"></div>
          <div class="field"><label>${esc(c.booking)}</label><input id="supportBookingId" type="number" min="1" inputmode="numeric" placeholder="123"></div>
          <div class="field"><label>${esc(c.message)}</label><textarea id="supportMessage" minlength="10" maxlength="2000" required placeholder="Describe what happened and what you need help with."></textarea></div>
          <button id="supportSubmitBtn" class="btn" type="submit">${esc(c.send)}</button>
        </form>
        <section class="support-tickets"><div class="split"><h3>${esc(c.myTickets)}</h3><button class="btn secondary small" type="button" onclick="loadSupportTickets()">↻</button></div><div id="supportTicketList"><div class="empty">${esc(c.loading)}</div></div></section>
      </div>
      <section id="supportHumanChat" class="support-human-chat hidden"></section>
    </div>`;
    await window.loadSupportTickets();
  };

  window.supportQuickAI=function(text){
    const input=document.getElementById('supportAiInput');
    if(!input)return;
    input.value=text;
    input.focus();
  };

  function appendSupportAI(text,mine){
    const body=document.getElementById('supportAiMessages');
    if(!body)return null;
    const div=document.createElement('div');
    div.className='msg '+(mine?'user':'ai-msg');
    div.textContent=String(text||'');
    body.appendChild(div);
    body.scrollTop=body.scrollHeight;
    return div;
  }

  function demoSupportAI(message){
    const q=String(message||'').toLowerCase();
    if(q.includes('payment')||q.includes('upi')||q.includes('card'))return 'First check the booking payment method and current booking/payment status. Do not share any OTP, UPI PIN or card PIN. If the amount was deducted but SevaHub still does not show it correctly, create a Payment support ticket below and attach the booking number.';
    if(q.includes('location')||q.includes('gps'))return 'Check that phone Location permission is allowed and SevaHub Location sharing is ON, then refresh your location. If it still fails, create a Location support ticket with the booking number if the issue is booking-related.';
    if(q.includes('booking')||q.includes('status'))return 'Open My Bookings/Bookings and check the current status first. If a status looks stuck or incorrect, add the booking number below and create a Booking support ticket so it can be reviewed.';
    if(q.includes('bargain')||q.includes('offer')||q.includes('counter'))return 'Check whether the latest offer is still PENDING, ACCEPTED, REJECTED or COUNTERED. If the visible state does not match what happened, create a Bargaining support ticket with the booking number.';
    return 'I can help troubleshoot booking, payment, bargaining, location, account and technical issues. Describe what happened and, if it relates to a booking, add the booking number in the support form below.';
  }

  window.askSupportAI=async function(e){
    e.preventDefault();
    const c=supportCopy();
    const input=document.getElementById('supportAiInput');
    const btn=document.getElementById('supportAiBtn');
    const message=input?.value.trim()||'';
    if(!message)return;
    const bookingRaw=document.getElementById('supportBookingId')?.value.trim()||'';
    const bookingId=bookingRaw?Number(bookingRaw):null;
    appendSupportAI(message,true);
    input.value='';
    const typing=appendSupportAI(c.aiThinking,false);
    if(typing)typing.classList.add('typing');
    try{
      if(btn)btn.disabled=true;
      let answer;
      if(typeof isDemo!=='undefined'&&isDemo){
        await new Promise(r=>setTimeout(r,350));
        answer=demoSupportAI(message);
      }else{
        const r=await api('/support/ai',{method:'POST',body:JSON.stringify({message,bookingId})});
        answer=r.data?.message||'No support answer was returned.';
      }
      if(typing){typing.classList.remove('typing');typing.textContent=answer;}
    }catch(err){
      if(typing){typing.classList.remove('typing');typing.textContent=err.message||'AI support is unavailable right now.';}
    }finally{
      if(btn)btn.disabled=false;
      const body=document.getElementById('supportAiMessages');if(body)body.scrollTop=body.scrollHeight;
      input?.focus();
    }
  };

  window.openSupportHumanChat=async function(id,subject){
    activeSupportChatTicketId=Number(id);activeSupportChatSubject=String(subject||'Support ticket');
    await window.loadSupportHumanChat();
  };

  window.closeSupportHumanChat=function(){
    activeSupportChatTicketId=null;activeSupportChatSubject='';
    const panel=document.getElementById('supportHumanChat');
    if(panel){panel.classList.add('hidden');panel.innerHTML='';}
  };

  window.loadSupportHumanChat=async function(){
    const id=Number(activeSupportChatTicketId);
    const panel=document.getElementById('supportHumanChat');
    if(!panel||!id)return;
    const c=supportCopy();
    panel.classList.remove('hidden');
    panel.innerHTML=`<div class="support-human-head"><div><h3>💬 ${esc(c.chatTitle)} · #${id}</h3><p class="muted">${esc(activeSupportChatSubject)}</p></div><div class="support-human-head-actions"><button class="btn secondary small" type="button" onclick="loadSupportHumanChat()">↻ ${esc(c.chatRefresh)}</button><button class="btn secondary small" type="button" onclick="closeSupportHumanChat()">${esc(c.chatClose)}</button></div></div><div class="empty">${esc(c.loading)}</div>`;
    try{
      let messages=[];
      if(typeof isDemo!=='undefined'&&isDemo){
        const ticket=demoTickets().find(t=>Number(t.id)===id&&Number(t.user_id)===Number(state.user?.id)&&t.role===state.role);
        if(!ticket)throw new Error('Support ticket not found');
        messages=Array.isArray(ticket.chat)?ticket.chat:[];
      }else{
        const r=await api(`/support/${id}/messages`);
        messages=r.data?.messages||[];
      }
      const messageHtml=messages.length?messages.map(m=>{
        const admin=String(m.sender_type||m.senderType||'').toUpperCase()==='ADMIN';
        const when=m.created_at?new Date(m.created_at).toLocaleString():'';
        return `<div class="support-human-msg ${admin?'admin':'member'}"><b>${esc(admin?c.adminLabel:c.youLabel)}</b><div>${esc(m.message||'')}</div>${when?`<small>${esc(when)}</small>`:''}</div>`;
      }).join(''):`<div class="empty">${esc(c.chatEmpty)}</div>`;
      panel.innerHTML=`<div class="support-human-head"><div><h3>💬 ${esc(c.chatTitle)} · #${id}</h3><p class="muted">${esc(activeSupportChatSubject)}</p></div><div class="support-human-head-actions"><button class="btn secondary small" type="button" onclick="loadSupportHumanChat()">↻ ${esc(c.chatRefresh)}</button><button class="btn secondary small" type="button" onclick="closeSupportHumanChat()">${esc(c.chatClose)}</button></div></div><div id="supportHumanMessages" class="support-human-messages">${messageHtml}</div><form class="support-human-input" onsubmit="sendSupportHumanMessage(event)"><input id="supportHumanInput" maxlength="1500" autocomplete="off" placeholder="${esc(c.chatPlaceholder)}" required><button class="btn small" type="submit">${esc(c.chatSend)}</button></form><p class="muted support-human-note">${esc(c.chatNote)}</p>`;
      const body=document.getElementById('supportHumanMessages');if(body)body.scrollTop=body.scrollHeight;
      panel.scrollIntoView({behavior:'smooth',block:'nearest'});
    }catch(e){panel.innerHTML=`<div class="support-human-head"><h3>💬 ${esc(c.chatTitle)}</h3><button class="btn secondary small" type="button" onclick="closeSupportHumanChat()">${esc(c.chatClose)}</button></div><div class="empty">${esc(e.message||'Support chat could not load')}</div>`;}
  };

  window.sendSupportHumanMessage=async function(e){
    e.preventDefault();
    const id=Number(activeSupportChatTicketId);
    const input=document.getElementById('supportHumanInput');
    const message=input?.value.trim()||'';
    if(!id||!message)return;
    const btn=e.target.querySelector('button[type=submit]');
    try{
      if(btn){btn.disabled=true;btn.textContent='…'}
      if(typeof isDemo!=='undefined'&&isDemo){
        const rows=demoTickets();
        const ticket=rows.find(t=>Number(t.id)===id&&Number(t.user_id)===Number(state.user?.id)&&t.role===state.role);
        if(!ticket)throw new Error('Support ticket not found');
        ticket.chat=Array.isArray(ticket.chat)?ticket.chat:[];
        ticket.chat.push({id:Date.now(),sender_type:'MEMBER',message,created_at:new Date().toISOString()});
        ticket.status='OPEN';ticket.updated_at=new Date().toISOString();saveDemoTickets(rows);
      }else{
        await api(`/support/${id}/messages`,{method:'POST',body:JSON.stringify({message})});
      }
      if(input)input.value='';
      await window.loadSupportHumanChat();
      await window.loadSupportTickets();
    }catch(err){toast(err.message||'Could not send support message')}
    finally{if(btn){btn.disabled=false;btn.textContent=supportCopy().chatSend}}
  };

  window.loadSupportTickets=async function(){
    try{
      let rows;
      if(typeof isDemo!=='undefined'&&isDemo){
        rows=demoTickets().filter(t=>Number(t.user_id)===Number(state.user?.id)&&t.role===state.role).sort((a,b)=>Number(b.id)-Number(a.id));
      }else{
        rows=(await api('/support/my')).data||[];
      }
      renderTicketList(rows);
    }catch(e){
      const box=document.getElementById('supportTicketList');
      if(box)box.innerHTML=`<div class="empty">${esc(e.message||'Support tickets could not load')}</div>`;
    }
  };

  window.submitSupportTicket=async function(e){
    e.preventDefault();
    const c=supportCopy();
    const btn=document.getElementById('supportSubmitBtn');
    const category=document.getElementById('supportCategory')?.value||'OTHER';
    const subject=document.getElementById('supportSubject')?.value.trim()||'';
    const bookingRaw=document.getElementById('supportBookingId')?.value.trim()||'';
    const message=document.getElementById('supportMessage')?.value.trim()||'';
    const bookingId=bookingRaw?Number(bookingRaw):null;
    try{
      if(btn){btn.disabled=true;btn.textContent='Sending…'}
      if(typeof isDemo!=='undefined'&&isDemo){
        const rows=demoTickets();
        rows.push({id:Date.now(),user_id:state.user.id,role:state.role,category,subject,message,booking_id:bookingId,status:'OPEN',created_at:new Date().toISOString(),chat:[]});
        saveDemoTickets(rows);
      }else{
        await api('/support',{method:'POST',body:JSON.stringify({category,subject,message,bookingId})});
      }
      toast(c.created);
      e.target.reset();
      await window.loadSupportTickets();
    }catch(err){toast(err.message||'Could not create support ticket')}
    finally{if(btn){btn.disabled=false;btn.textContent=c.send}}
  };

  window.resolveSupportTicket=async function(id){
    const c=supportCopy();
    try{
      if(typeof isDemo!=='undefined'&&isDemo){
        const rows=demoTickets();
        const ticket=rows.find(t=>Number(t.id)===Number(id)&&Number(t.user_id)===Number(state.user?.id)&&t.role===state.role);
        if(!ticket)throw new Error('Support ticket not found');
        ticket.status='RESOLVED';ticket.updated_at=new Date().toISOString();saveDemoTickets(rows);
      }else{
        await api(`/support/${Number(id)}/resolve`,{method:'PUT'});
      }
      toast(c.resolved);
      await window.loadSupportTickets();
    }catch(e){toast(e.message||'Could not update support ticket')}
  };

  wrapDashboardRenderer('renderUser','USER');
  wrapDashboardRenderer('renderWorker','WORKER');
  try{if(typeof state!=='undefined'&&state?.role)installButton(state.role)}catch(e){}
})();
