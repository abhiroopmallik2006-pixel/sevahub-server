/* SevaHub 3D MacBook tab animation.
   Purely additive: observes dashboard content and never replaces app functions. */
(function(){
  const REDUCED=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  let bodyObserver=null;
  let rafPending=false;

  const copyMap={
    USER:{
      default:['SEVAHUB SERVICE HUB','Your workspace, beautifully organized.','Move between services, bookings, AI help, spending, GEMS and notifications without losing your place.'],
      services:['SEVAHUB SERVICE HUB','Find services in a smoother workspace.','Browse trusted professionals and move from discovery to booking without losing context.'],
      bookings:['SEVAHUB BOOKINGS','Track every booking in one place.','Keep status, bargaining, chat, payment and completion progress together in one focused view.'],
      ai:['SEVAHUB AI','Ask, understand and book with AI.','Use the assistant for service guidance and the booking flow while your dashboard stays organized.'],
      spend:['SEVAHUB ACTIVITY','Understand where your service spending goes.','Review completed services and spending history in a clean, animated workspace.'],
      gems:['SEVAHUB REWARDS','Your GEMS wallet at a glance.','Track earned rewards, history and redemptions without leaving your service workspace.'],
      notifications:['SEVAHUB UPDATES','Stay on top of every service update.','Keep booking, payment, support and worker updates easy to scan.'],
      support:['SEVAHUB SUPPORT','Help is part of the workspace.','Create tickets, chat with support and keep your service journey in one place.'],
      chat:['SEVAHUB CHAT','Keep the conversation connected.','Talk with the assigned professional while staying inside the booking workflow.']
    },
    WORKER:{
      default:['SEVAHUB WORKSPACE','Manage your work with confidence.','Switch between requests, bargains, bookings, earnings and your professional profile in one workspace.'],
      overview:['SEVAHUB WORKSPACE','Your professional workspace at a glance.','See your service, working area and bargaining flow before moving into active jobs.'],
      bargains:['SEVAHUB BARGAINS','Handle offers without losing context.','Review customer offers, counter fairly and keep negotiations tied to each booking.'],
      bookings:['SEVAHUB BOOKINGS','Manage customer jobs in one focused view.','Track accepted work, customer details, chat and completion progress from the same workspace.'],
      earnings:['SEVAHUB EARNINGS','See the value of completed work.','Review completed jobs and earnings history with a clean, focused presentation.'],
      profile:['SEVAHUB PROFILE','Your professional identity, organized.','Keep service details, experience and working area easy to understand and maintain.'],
      ai:['SEVAHUB AI','Use AI as a work assistant.','Get service guidance while keeping requests and bookings close at hand.'],
      support:['SEVAHUB SUPPORT','Support stays inside your workspace.','Raise issues, chat with the cooperative admin and continue managing your work.'],
      chat:['SEVAHUB CHAT','Keep customer communication connected.','Talk with the customer while staying inside the active service workflow.']
    }
  };

  function escText(v=''){
    return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  }

  function detectView(box,role){
    const text=String(box.textContent||'').toLowerCase();
    if(text.includes('support center')||text.includes('सहायता केंद्र')||text.includes('chat with admin'))return 'support';
    if(text.includes('booking chat')||text.includes('chat with worker')||text.includes('chat with customer')||box.querySelector('.booking-chat'))return 'chat';
    if(text.includes('ai assistant')||text.includes('ai service assistant')||box.querySelector('.ai-panel,.worker-ai-panel'))return 'ai';
    if(role==='USER'){
      if(text.includes('spend history')||box.querySelector('.spend-history-marker'))return 'spend';
      if(text.includes('gems')||box.querySelector('.gem-wallet,.gem-block'))return 'gems';
      if(text.includes('notification'))return 'notifications';
      if(text.includes('my bookings')||box.querySelector('.booking-list-marker'))return 'bookings';
      if(text.includes('popular services')||text.includes('professionals'))return 'services';
    }else{
      if(text.includes('earnings history')||box.querySelector('.earn-history-marker'))return 'earnings';
      if(text.includes('customer bargains')||text.includes('counter-offer'))return 'bargains';
      if(text.includes('my professional profile'))return 'profile';
      if(text.includes('bookings'))return 'bookings';
      if(text.includes('my service')||text.includes('working area'))return 'overview';
    }
    return 'default';
  }

  function macbookHTML(role,key){
    const map=copyMap[role]||copyMap.USER;
    const copy=map[key]||map.default;
    const roleLabel=role==='WORKER'?'Worker':'User';
    return `<section class="sevahub-macbook3d-section" data-sevahub-macbook3d="1">
      <div class="sevahub-macbook3d-copy">
        <span class="sevahub-macbook3d-kicker">${escText(copy[0])}</span>
        <h3>${escText(copy[1])}</h3>
        <p>${escText(copy[2])}</p>
      </div>
      <div class="sevahub-macbook3d" data-sevahub-macbook-card="1">
        <div class="sevahub-macbook3d-notch"></div>
        <div class="sevahub-macbook3d-screen">
          <div class="sevahub-macbook3d-screenbar"><b>SEVAHUB</b><span>${roleLabel} workspace</span></div>
          <div class="sevahub-macbook3d-screenbody">
            <div class="sevahub-mac-line lg"></div><div class="sevahub-mac-line"></div><div class="sevahub-mac-line sm"></div>
            <div class="sevahub-mac-grid"><i></i><i></i><i></i></div>
          </div>
        </div>
        <div class="sevahub-macbook3d-base"><span></span></div>
      </div>
    </section>`;
  }

  function enhanceCards(box){
    box.querySelectorAll('.card.panel,.service-card,.worker-card,.offer,.gem-block,.support-ticket-card').forEach(card=>{
      if(card.closest('[data-sevahub-macbook3d]')||card.dataset.sevahubTiltReady==='1')return;
      card.dataset.sevahubTiltReady='1';
      card.classList.add('sevahub-fx-3d-card');
      card.addEventListener('pointermove',event=>{
        if(REDUCED()||window.matchMedia?.('(pointer:coarse)')?.matches)return;
        const rect=card.getBoundingClientRect();
        if(!rect.width||!rect.height)return;
        const x=(event.clientX-rect.left)/rect.width-.5;
        const y=(event.clientY-rect.top)/rect.height-.5;
        card.style.setProperty('--sevahub-rx',`${(-y*7).toFixed(2)}deg`);
        card.style.setProperty('--sevahub-ry',`${(x*9).toFixed(2)}deg`);
      });
      card.addEventListener('pointerleave',()=>{
        card.style.setProperty('--sevahub-rx','0deg');
        card.style.setProperty('--sevahub-ry','0deg');
      });
    });
  }

  function updateMacbooks(){
    if(REDUCED())return;
    document.querySelectorAll('[data-sevahub-macbook3d]').forEach(section=>{
      const card=section.querySelector('[data-sevahub-macbook-card]');
      if(!card)return;
      const rect=section.getBoundingClientRect();
      const progress=Math.min(1,Math.max(0,(innerHeight*.82-rect.top)/Math.max(1,section.offsetHeight*.72)));
      card.style.transform=`perspective(1200px) rotateX(${(18-progress*18).toFixed(2)}deg) translateY(${(40-progress*40).toFixed(1)}px) scale(${(.88+progress*.12).toFixed(3)})`;
      section.style.setProperty('--mac-progress',progress.toFixed(3));
    });
  }

  function enhanceBox(box,role){
    if(!box||!box.isConnected)return;
    const currentKey=detectView(box,role);
    const existing=box.querySelector(':scope > [data-sevahub-macbook3d]');
    if(!existing){
      box.insertAdjacentHTML('afterbegin',macbookHTML(role,currentKey));
    }else if(existing.dataset.viewKey!==currentKey){
      existing.outerHTML=macbookHTML(role,currentKey);
    }
    const live=box.querySelector(':scope > [data-sevahub-macbook3d]');
    if(live)live.dataset.viewKey=currentKey;
    enhanceCards(box);
    updateMacbooks();
  }

  function install(box,role){
    if(!box)return;
    if(box.dataset.sevahubMacbookInstalled==='1'){
      enhanceBox(box,role);
      return;
    }
    box.dataset.sevahubMacbookInstalled='1';
    let scheduled=false;
    const schedule=()=>{
      if(scheduled)return;
      scheduled=true;
      requestAnimationFrame(()=>{scheduled=false;enhanceBox(box,role)});
    };
    const observer=new MutationObserver(schedule);
    observer.observe(box,{childList:true,subtree:true});
    box.__sevahubMacbookObserver=observer;
    enhanceBox(box,role);
  }

  function scan(){
    install(document.getElementById('userContent'),'USER');
    install(document.getElementById('workerContent'),'WORKER');
  }

  function scheduleScan(){
    if(rafPending)return;
    rafPending=true;
    requestAnimationFrame(()=>{rafPending=false;scan();updateMacbooks()});
  }

  window.addEventListener('scroll',()=>requestAnimationFrame(updateMacbooks),{passive:true});
  window.addEventListener('resize',()=>requestAnimationFrame(updateMacbooks),{passive:true});

  bodyObserver=new MutationObserver(scheduleScan);
  bodyObserver.observe(document.body,{childList:true,subtree:true});
  scan();
})();