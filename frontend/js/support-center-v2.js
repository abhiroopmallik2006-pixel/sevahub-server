/* SevaHub Support Center v2
   Stable by design: no MutationObserver, no polling and no background API calls.
   Tickets load only when the user explicitly opens Support. */
(function(){
  const DEMO_KEY='sevahub_support_tickets_v2';
  const categoryOptions=[
    ['BOOKING','Booking'],['PAYMENT','Payment'],['BARGAINING','Bargaining'],['LOCATION','Location'],
    ['ACCOUNT','Account'],['SAFETY','Safety'],['TECHNICAL','Technical'],['OTHER','Other']
  ];

  function hi(){
    try{return localStorage.getItem('sevahub_language_v1')==='hi'}catch(e){return false}
  }

  function supportCopy(){
    return hi()?{
      tab:'🛟 सहायता',title:'🛟 सहायता केंद्र',intro:'Booking, payment, bargaining, location, account या technical issue के लिए ticket बनाएँ।',
      quick:'जल्दी मदद',q1:'Booking issue',a1:'Booking number जोड़ें ताकि issue जल्दी identify हो सके।',
      q2:'Payment issue',a2:'Payment ID/UPI PIN जैसी sensitive details message में न लिखें।',
      q3:'Safety issue',a3:'Safety category चुनें और जरूरी जानकारी short और clear रखें।',
      newTicket:'नया support ticket',category:'Category',subject:'Subject',booking:'Booking # (optional)',message:'Issue details',send:'Ticket भेजें',
      myTickets:'मेरे tickets',loading:'Tickets load हो रहे हैं…',empty:'अभी कोई support ticket नहीं है।',resolve:'Resolved mark करें',
      created:'Support ticket बन गया',resolved:'Ticket resolved mark हो गया',open:'OPEN',resolvedLabel:'RESOLVED'
    }:{
      tab:'🛟 Support',title:'🛟 Support Center',intro:'Create a ticket for booking, payment, bargaining, location, account or technical issues.',
      quick:'Quick help',q1:'Booking issue',a1:'Add the booking number so the issue can be identified quickly.',
      q2:'Payment issue',a2:'Do not include sensitive details such as UPI PINs or passwords.',
      q3:'Safety issue',a3:'Choose the Safety category and keep the important details clear and concise.',
      newTicket:'New support ticket',category:'Category',subject:'Subject',booking:'Booking # (optional)',message:'Issue details',send:'Submit ticket',
      myTickets:'My tickets',loading:'Loading tickets…',empty:'No support tickets yet.',resolve:'Mark resolved',
      created:'Support ticket created',resolved:'Ticket marked resolved',open:'OPEN',resolvedLabel:'RESOLVED'
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
      return `<div class="support-ticket-card">
        <div class="split support-ticket-head">
          <div><b>#${Number(t.id)} · ${esc(t.subject||'Support ticket')}</b><div class="muted">${esc(categoryLabel(t.category))}${t.booking_id?` · Booking #${Number(t.booking_id)}`:''}${date?` · ${esc(date)}`:''}</div></div>
          <span class="pill ${open?'warning':'success'}">${open?esc(c.open):esc(c.resolvedLabel)}</span>
        </div>
        <p>${esc(t.message||'')}</p>
        ${open?`<button class="btn secondary small" type="button" onclick="resolveSupportTicket(${Number(t.id)})">${esc(c.resolve)}</button>`:''}
      </div>`;
    }).join('');
  }

  window.openSupportCenter=async function(){
    const host=contentHost();
    if(!host)return;
    const c=supportCopy();
    const options=categoryOptions.map(([v,label])=>`<option value="${v}">${esc(label)}</option>`).join('');
    host.innerHTML=`<div class="card panel support-center-v2">
      <div class="support-hero"><div class="support-icon">🛟</div><div><h2>${esc(c.title)}</h2><p class="muted">${esc(c.intro)}</p></div></div>
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
    </div>`;
    await window.loadSupportTickets();
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
        rows.push({id:Date.now(),user_id:state.user.id,role:state.role,category,subject,message,booking_id:bookingId,status:'OPEN',created_at:new Date().toISOString()});
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
