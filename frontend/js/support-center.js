/* SevaHub Support Center for both USER and WORKER dashboards. */
(function(){
  const CATEGORY_LABELS={
    BOOKING:'Booking issue',PAYMENT:'Payment issue',BARGAINING:'Bargaining issue',LOCATION:'Location issue',
    ACCOUNT:'Account / login',SAFETY:'Safety / behaviour',TECHNICAL:'App / technical',OTHER:'Other'
  };
  const CATEGORY_HI={
    BOOKING:'बुकिंग समस्या',PAYMENT:'पेमेंट समस्या',BARGAINING:'मोलभाव समस्या',LOCATION:'लोकेशन समस्या',
    ACCOUNT:'अकाउंट / लॉगिन',SAFETY:'सुरक्षा / व्यवहार',TECHNICAL:'ऐप / तकनीकी',OTHER:'अन्य'
  };

  function isHindi(){try{return localStorage.getItem('sevahub_language_v1')==='hi'}catch(e){return false}}
  function x(s){try{return typeof esc==='function'?esc(s):String(s||'')}catch(e){return String(s||'')}}
  function supportBox(){return document.getElementById(state?.role==='WORKER'?'workerContent':'userContent')}
  function roleAI(){return state?.role==='WORKER'?'workerAI':'userAI'}

  function copy(){
    if(isHindi())return {
      tab:'🛟 सहायता',title:'🛟 SevaHub सहायता केंद्र',lead:'बुकिंग, पेमेंट, मोलभाव, लोकेशन, अकाउंट या ऐप की समस्या के लिए सहायता लें।',
      quick:'जल्दी सहायता',ai:'✨ AI से तुरंत पूछें',newTicket:'नया सहायता अनुरोध',category:'समस्या का प्रकार',booking:'संबंधित बुकिंग',
      noBooking:'कोई बुकिंग नहीं / लागू नहीं',subject:'विषय',subjectPh:'समस्या का छोटा सार',details:'समस्या बताएं',detailsPh:'क्या हुआ, कब हुआ और आपको किस चीज़ में मदद चाहिए?',
      submit:'अनुरोध भेजें',history:'मेरे सहायता अनुरोध',empty:'अभी कोई सहायता अनुरोध नहीं है।',open:'खुला',progress:'काम चल रहा है',resolved:'हल हो गया',
      markResolved:'✓ हल हो गया',faq:'आम सवाल',created:'बनाया गया',ticket:'टिकट',bookingRef:'बुकिंग',sent:'सहायता अनुरोध बन गया',
      aiPrompt:'Mujhe SevaHub support chahiye. Meri problem solve karne me help karo.'
    };
    return {
      tab:'🛟 Support',title:'🛟 SevaHub Support Center',lead:'Get help with bookings, payments, bargaining, location, your account, or the app.',
      quick:'Quick help',ai:'✨ Ask AI now',newTicket:'Create support request',category:'Issue type',booking:'Related booking',
      noBooking:'No booking / not applicable',subject:'Subject',subjectPh:'Short summary of the issue',details:'Describe the issue',detailsPh:'Tell us what happened, when it happened, and what help you need.',
      submit:'Send support request',history:'My support requests',empty:'No support requests yet.',open:'Open',progress:'In progress',resolved:'Resolved',
      markResolved:'✓ Mark resolved',faq:'Common questions',created:'Created',ticket:'Ticket',bookingRef:'Booking',sent:'Support request created',
      aiPrompt:'I need SevaHub support. Help me troubleshoot my issue.'
    };
  }

  function addTabFor(contentId){
    const content=document.getElementById(contentId);
    if(!content)return;
    const dash=content.closest('.dashboard');
    const tabs=dash?.querySelector('.tabs');
    if(!tabs||tabs.querySelector('[data-support-tab]'))return;
    const btn=document.createElement('button');
    btn.type='button';btn.className='btn secondary';btn.dataset.supportTab='1';btn.textContent=copy().tab;
    btn.addEventListener('click',openSupportCenter);
    tabs.appendChild(btn);
  }

  function addTabs(){
    if(typeof state==='undefined'||!state?.user)return;
    if(state.role==='USER')addTabFor('userContent');
    if(state.role==='WORKER')addTabFor('workerContent');
  }

  async function getBookings(){
    try{return (await api('/bookings')).data||[]}catch(e){return []}
  }
  async function getTickets(){
    try{return (await api('/support/my')).data||[]}catch(e){throw e}
  }

  function bookingOptionLabel(b){
    const name=b.service_name||'Service';
    const other=state?.role==='WORKER'?(b.customer_name||'Customer'):(b.worker_user_name||'Worker');
    return `#${b.id} · ${name} · ${other||''} · ${b.status||''}`;
  }

  function statusText(status,c){
    if(status==='RESOLVED')return c.resolved;
    if(status==='IN_PROGRESS')return c.progress;
    return c.open;
  }

  function faqMarkup(c){
    const worker=state?.role==='WORKER';
    const items=isHindi()?
      (worker?[
        ['बुकिंग रिक्वेस्ट नहीं दिख रही?','Bookings टैब refresh करें और Notifications देखें। Assigned booking होने पर ही customer details दिखाई देती हैं।'],
        ['पेमेंट या कमाई की समस्या?','संबंधित Booking ID के साथ Payment issue चुनकर support request भेजें।'],
        ['लोकेशन काम नहीं कर रही?','Settings → Location sharing में permission और sharing status check करें।']
      ]:[
        ['वर्कर या बुकिंग की समस्या?','Booking issue चुनें और संभव हो तो संबंधित Booking ID जोड़ें।'],
        ['पेमेंट की समस्या?','Payment issue में Booking ID और payment method की जानकारी लिखें।'],
        ['लोकेशन काम नहीं कर रही?','Settings → Location sharing में permission और sharing status check करें।']
      ]):
      (worker?[
        ['Booking request not showing?','Refresh Bookings and check Notifications. Customer details appear only for bookings assigned to you.'],
        ['Payment or earnings issue?','Choose Payment issue and attach the related Booking ID.'],
        ['Location not working?','Check Settings → Location sharing, device permission, and sharing status.']
      ]:[
        ['Problem with a worker or booking?','Choose Booking issue and attach the related Booking ID when possible.'],
        ['Payment problem?','Choose Payment issue and include the Booking ID and payment method.'],
        ['Location not working?','Check Settings → Location sharing, device permission, and sharing status.']
      ]);
    return `<div class="support-faq">${items.map(([q,a])=>`<details><summary>${x(q)}</summary><p>${x(a)}</p></details>`).join('')}</div>`;
  }

  function ticketMarkup(t,c){
    const category=isHindi()?(CATEGORY_HI[t.category]||t.category):(CATEGORY_LABELS[t.category]||t.category);
    const status=String(t.status||'OPEN').toUpperCase();
    const date=t.created_at?new Date(t.created_at).toLocaleString('en-IN'):'';
    return `<div class="support-ticket-card">
      <div class="support-ticket-head"><div><b>${c.ticket} #${Number(t.id)}</b><span class="support-category">${x(category)}</span></div><span class="support-status support-status-${status.toLowerCase()}">${x(statusText(status,c))}</span></div>
      <h4>${x(t.subject)}</h4><p>${x(t.message)}</p>
      <div class="support-ticket-meta">${t.booking_id?`${c.bookingRef} #${Number(t.booking_id)} · `:''}${c.created}: ${x(date)}</div>
      ${status!=='RESOLVED'?`<button class="btn secondary small" type="button" onclick="resolveSupportTicket(${Number(t.id)})">${c.markResolved}</button>`:''}
    </div>`;
  }

  async function openSupportCenter(){
    const box=supportBox();if(!box)return;
    const c=copy();
    box.innerHTML=`<div class="card panel support-loading"><h2>${c.title}</h2><p class="muted">Loading support…</p></div>`;
    try{
      const [tickets,bookings]=await Promise.all([getTickets(),getBookings()]);
      const bookingOptions=bookings.map(b=>`<option value="${Number(b.id)}">${x(bookingOptionLabel(b))}</option>`).join('');
      const categoryLabels=isHindi()?CATEGORY_HI:CATEGORY_LABELS;
      box.innerHTML=`<div class="support-center">
        <div class="card panel support-hero"><div><span class="support-kicker">SEVAHUB CARE</span><h2>${c.title}</h2><p class="muted">${c.lead}</p></div><button class="btn secondary" type="button" onclick="openSupportAI()">${c.ai}</button></div>
        <div class="support-layout">
          <div class="card panel">
            <h3>${c.newTicket}</h3>
            <form onsubmit="submitSupportTicket(event)">
              <div class="field"><label>${c.category}</label><select id="supportCategory">${Object.keys(CATEGORY_LABELS).map(k=>`<option value="${k}">${x(categoryLabels[k])}</option>`).join('')}</select></div>
              <div class="field"><label>${c.booking}</label><select id="supportBooking"><option value="">${c.noBooking}</option>${bookingOptions}</select></div>
              <div class="field"><label>${c.subject}</label><input id="supportSubject" maxlength="140" placeholder="${x(c.subjectPh)}" required></div>
              <div class="field"><label>${c.details}</label><textarea id="supportMessage" maxlength="4000" placeholder="${x(c.detailsPh)}" required></textarea></div>
              <button class="btn" id="supportSubmitBtn" type="submit">${c.submit}</button>
            </form>
          </div>
          <div class="card panel"><h3>${c.faq}</h3>${faqMarkup(c)}</div>
        </div>
        <div class="card panel"><h3>${c.history}</h3><div id="supportTicketList">${tickets.length?tickets.map(t=>ticketMarkup(t,c)).join(''):`<div class="empty">${c.empty}</div>`}</div></div>
      </div>`;
      try{localStorage.setItem('sevahub_ui_route_v1',JSON.stringify({view:state.role==='WORKER'?'worker-support':'user-support'}))}catch(e){}
    }catch(err){box.innerHTML=`<div class="card panel"><h2>${c.title}</h2><div class="empty">${x(err.message||'Support is temporarily unavailable')}</div></div>`}
  }
  window.openSupportCenter=openSupportCenter;
  window.userSupport=openSupportCenter;
  window.workerSupport=openSupportCenter;

  window.submitSupportTicket=async function(e){
    e.preventDefault();
    const btn=document.getElementById('supportSubmitBtn');
    const c=copy();
    const payload={
      category:document.getElementById('supportCategory')?.value||'OTHER',
      bookingId:document.getElementById('supportBooking')?.value||null,
      subject:document.getElementById('supportSubject')?.value?.trim()||'',
      message:document.getElementById('supportMessage')?.value?.trim()||''
    };
    try{
      if(btn){btn.disabled=true;btn.textContent=isHindi()?'भेज रहे हैं…':'Sending…'}
      const r=await api('/support',{method:'POST',body:JSON.stringify(payload)});
      toast(`${c.sent} · #${r.data.id}`);
      await openSupportCenter();
    }catch(err){toast(err.message)}finally{if(btn){btn.disabled=false;btn.textContent=c.submit}}
  };

  window.resolveSupportTicket=async function(id){
    try{await api(`/support/${id}/resolve`,{method:'PUT'});toast(isHindi()?'अनुरोध हल हुआ मार्क कर दिया':'Support request marked resolved');await openSupportCenter()}catch(err){toast(err.message)}
  };

  window.openSupportAI=function(){
    const fn=window[roleAI()];
    if(typeof fn!=='function')return toast(isHindi()?'AI अभी उपलब्ध नहीं है':'AI is unavailable right now');
    fn();
    setTimeout(()=>{
      const input=document.getElementById('aiInput');
      if(input){input.value=copy().aiPrompt;input.focus()}
    },40);
  };

  function restoreSupport(){
    if(typeof state==='undefined'||!state?.user)return;
    try{
      const route=JSON.parse(localStorage.getItem('sevahub_ui_route_v1')||'null');
      if((state.role==='USER'&&route?.view==='user-support')||(state.role==='WORKER'&&route?.view==='worker-support')){
        const box=supportBox();if(box&&!box.querySelector('.support-center'))openSupportCenter();
      }
    }catch(e){}
  }

  const observer=new MutationObserver(()=>{addTabs();restoreSupport()});
  observer.observe(document.body,{childList:true,subtree:true});
  setTimeout(()=>{addTabs();restoreSupport()},0);
})();
