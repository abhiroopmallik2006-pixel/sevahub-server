/* SevaHub live MacBook workspace.
   Keeps the active dashboard content inside the MacBook, but avoids continuous scroll/pointer animation work. */
(function(){
  const installed={USER:null,WORKER:null};
  let appScanRaf=0;

  const copyMap={
    USER:{
      default:['SEVAHUB SERVICE HUB','Your workspace, beautifully organized.','Move between services, bookings, AI help, spending, GEMS and notifications without losing your place.'],
      services:['SEVAHUB SERVICE HUB','Find services in a smoother workspace.','Browse trusted professionals and move from discovery to booking without losing context.'],
      bookings:['SEVAHUB BOOKINGS','Track every booking in one place.','Keep status, bargaining, chat, payment and completion progress together in one focused view.'],
      ai:['SEVAHUB AI','Ask, understand and book with AI.','Use the assistant for service guidance and the booking flow while your dashboard stays organized.'],
      spend:['SEVAHUB ACTIVITY','Understand where your service spending goes.','Review completed services and spending history in a clean workspace.'],
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
      earnings:['SEVAHUB EARNINGS','See the value of completed work.','Review completed jobs and earnings history with a clean presentation.'],
      profile:['SEVAHUB PROFILE','Your professional identity, organized.','Keep service details, experience and working area easy to understand and maintain.'],
      ai:['SEVAHUB AI','Use AI as a work assistant.','Get service guidance while keeping requests and bookings close at hand.'],
      support:['SEVAHUB SUPPORT','Support stays inside your workspace.','Raise issues, chat with the cooperative admin and continue managing your work.'],
      chat:['SEVAHUB CHAT','Keep customer communication connected.','Talk with the customer while staying inside the active service workflow.']
    }
  };

  function esc(v=''){
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
    return `<section class="sevahub-macbook3d-section" data-sevahub-macbook3d="1" data-view-key="${esc(key)}">
      <div class="sevahub-macbook3d-copy">
        <span class="sevahub-macbook3d-kicker">${esc(copy[0])}</span>
        <h3>${esc(copy[1])}</h3>
        <p>${esc(copy[2])}</p>
      </div>
      <div class="sevahub-macbook3d" data-sevahub-macbook-card="1">
        <div class="sevahub-macbook3d-notch"></div>
        <div class="sevahub-macbook3d-screen">
          <div class="sevahub-macbook3d-screenbar"><b>SEVAHUB</b><span>${role==='WORKER'?'Worker':'User'} workspace</span></div>
          <div class="sevahub-macbook3d-screenbody"></div>
        </div>
        <div class="sevahub-macbook3d-base"><span></span></div>
      </div>
    </section>`;
  }

  function mountContent(box,section,role,key){
    const screen=section?.querySelector('.sevahub-macbook3d-screenbody');
    if(!screen)return;
    const nodes=Array.from(box.children).filter(node=>node!==section);
    if(!nodes.length)return;
    const live=document.createElement('div');
    live.className=`sevahub-macbook-live-content sevahub-macbook-live-${role.toLowerCase()} sevahub-macbook-live-${key}`;
    nodes.forEach(node=>live.appendChild(node));
    screen.replaceChildren(live);
    screen.classList.add('sevahub-macbook-scrollable');
    if(role==='WORKER'&&key==='overview')live.querySelector('.grid.grid-3')?.classList.add('sevahub-macbook-overview-grid');
    if(role==='USER'&&key==='services')live.querySelector('.card.panel')?.classList.add('sevahub-macbook-services-panel');
  }

  function enhance(box,role){
    if(!box||!box.isConnected)return;
    if(box.querySelector(':scope > [data-sevahub-macbook3d]'))return;
    const key=detectView(box,role);
    box.insertAdjacentHTML('afterbegin',macbookHTML(role,key));
    mountContent(box,box.querySelector(':scope > [data-sevahub-macbook3d]'),role,key);
  }

  function install(box,role){
    const old=installed[role];
    if(old?.box===box){
      enhance(box,role);
      return;
    }
    old?.observer?.disconnect();
    installed[role]=null;
    if(!box)return;

    let pending=false;
    const observer=new MutationObserver(()=>{
      if(box.querySelector(':scope > [data-sevahub-macbook3d]')||pending)return;
      pending=true;
      requestAnimationFrame(()=>{pending=false;enhance(box,role)});
    });
    observer.observe(box,{childList:true});
    installed[role]={box,observer};
    enhance(box,role);
  }

  function scan(){
    install(document.getElementById('userContent'),'USER');
    install(document.getElementById('workerContent'),'WORKER');
  }

  function scheduleScan(){
    if(appScanRaf)return;
    appScanRaf=requestAnimationFrame(()=>{appScanRaf=0;scan()});
  }

  const app=document.getElementById('app')||document.body;
  const appObserver=new MutationObserver(mutations=>{
    const relevant=mutations.some(m=>[...m.addedNodes,...m.removedNodes].some(node=>node.nodeType===1&&(
      node.matches?.('main.dashboard,#userContent,#workerContent')||node.querySelector?.('main.dashboard,#userContent,#workerContent')
    )));
    if(relevant)scheduleScan();
  });
  appObserver.observe(app,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',scheduleScan,{once:true});
  scheduleScan();
})();