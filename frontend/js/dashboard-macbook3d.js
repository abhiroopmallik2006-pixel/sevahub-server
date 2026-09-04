/* SevaHub lightweight interactive MacBook preview.
   The MacBook never moves or clones the real dashboard DOM. Real tab content stays below it. */
(function(){
  const installed={USER:null,WORKER:null};
  let appScanRaf=0;

  const copyMap={
    USER:{
      default:['SEVAHUB SERVICE HUB','Your workspace, beautifully organized.','Move between services, bookings, AI help, spending, GEMS and notifications without losing your place.'],
      services:['SEVAHUB SERVICE HUB','Find services in a smoother workspace.','Browse trusted professionals and move from discovery to booking without losing context.'],
      bookings:['SEVAHUB BOOKINGS','Track every booking in one place.','Keep status, bargaining, chat, payment and completion progress together in one focused view.'],
      ai:['SEVAHUB AI','Ask, understand and book with AI.','Use the assistant for service guidance and booking help while your dashboard stays organized.'],
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

  const previewMap={
    USER:{
      default:[['🧰','Services','Browse help'],['📅','Bookings','Track progress'],['✨','AI & GEMS','Smart tools']],
      services:[['🧰','Services','Browse options'],['✅','Trusted pros','Verified help'],['💬','Fair deals','Bargain safely']],
      bookings:[['📅','Status','Track jobs'],['💬','Chat','Stay connected'],['💳','Payment','Pay securely']],
      ai:[['✨','AI help','Ask anything'],['🔎','Discover','Find service'],['📅','Book','Continue below']],
      spend:[['₹','Spending','View history'],['🧾','Receipts','Track payments'],['📊','Activity','See totals']],
      gems:[['💎','GEMS','Reward wallet'],['🎁','Rewards','View benefits'],['📜','History','Track activity']],
      notifications:[['🔔','Updates','Latest alerts'],['📅','Bookings','Status changes'],['🛟','Support','Ticket updates']],
      support:[['🛟','Support','Create ticket'],['💬','Chat','Talk to admin'],['📜','History','Track issues']],
      chat:[['💬','Messages','Stay connected'],['📅','Booking','Keep context'],['✅','Progress','Complete work']]
    },
    WORKER:{
      default:[['🧰','Requests','New work'],['📅','Bookings','Manage jobs'],['₹','Earnings','Track income']],
      overview:[['🧰','Service','Your work'],['📍','Area','Working zone'],['💬','Bargains','Fair offers']],
      bargains:[['💬','Offers','Review deals'],['↔️','Counter','Negotiate'],['📅','Booking','Keep context']],
      bookings:[['📅','Jobs','Manage work'],['💬','Customer chat','Stay connected'],['✅','Completion','Finish safely']],
      earnings:[['₹','Earnings','Completed work'],['🧾','History','Payment record'],['📊','Activity','See totals']],
      profile:[['👤','Profile','Professional info'],['🛡️','Protection','Welfare & insurance'],['✅','Trust','Verification']],
      ai:[['✨','AI help','Work assistant'],['🧰','Service','Guidance'],['📅','Jobs','Plan work']],
      support:[['🛟','Support','Raise issue'],['💬','Admin chat','Get help'],['📜','History','Track tickets']],
      chat:[['💬','Messages','Customer chat'],['📅','Booking','Keep context'],['✅','Progress','Complete job']]
    }
  };

  function esc(v=''){
    return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[c]));
  }

  function sourceText(box){
    return Array.from(box?.children||[])
      .filter(node=>!node.matches?.('[data-sevahub-macbook3d]'))
      .map(node=>node.textContent||'')
      .join(' ')
      .toLowerCase();
  }

  function detectView(box,role){
    const text=sourceText(box);
    if(text.includes('support center')||text.includes('सहायता केंद्र')||text.includes('chat with admin'))return 'support';
    if(text.includes('booking chat')||text.includes('chat with worker')||text.includes('chat with customer')||box.querySelector(':scope > .booking-chat'))return 'chat';
    if(text.includes('ai assistant')||text.includes('ai service assistant')||box.querySelector(':scope > .ai-panel,:scope > .worker-ai-panel'))return 'ai';
    if(role==='USER'){
      if(text.includes('spend history')||box.querySelector(':scope > .spend-history-marker'))return 'spend';
      if(text.includes('gems')||box.querySelector(':scope > .gem-wallet,:scope > .gem-block'))return 'gems';
      if(text.includes('notification'))return 'notifications';
      if(text.includes('my bookings')||box.querySelector(':scope > .booking-list-marker'))return 'bookings';
      if(text.includes('popular services')||text.includes('professionals'))return 'services';
    }else{
      if(text.includes('earnings history')||box.querySelector(':scope > .earn-history-marker'))return 'earnings';
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
        <span class="sevahub-macbook3d-kicker" data-mac-copy-kicker>${esc(copy[0])}</span>
        <h3 data-mac-copy-title>${esc(copy[1])}</h3>
        <p data-mac-copy-desc>${esc(copy[2])}</p>
      </div>
      <div class="sevahub-macbook3d" data-sevahub-macbook-card="1">
        <div class="sevahub-macbook3d-notch"></div>
        <div class="sevahub-macbook3d-screen">
          <div class="sevahub-macbook3d-screenbar"><b>SEVAHUB</b><span>${role==='WORKER'?'Worker':'User'} workspace</span></div>
          <div class="sevahub-macbook3d-screenbody" data-mac-preview-screen></div>
        </div>
        <div class="sevahub-macbook3d-base"><span></span></div>
      </div>
    </section>`;
  }

  function previewHTML(role,key){
    const roleMap=previewMap[role]||previewMap.USER;
    const tiles=roleMap[key]||roleMap.default;
    const title=(copyMap[role]?.[key]||copyMap[role]?.default||copyMap.USER.default)[1];
    return `<div class="sevahub-macbook-preview">
      <div class="sevahub-macbook-preview-top">
        <div class="sevahub-macbook-preview-copy">
          <span class="sevahub-macbook-preview-pill">⚡ Lightweight preview</span>
          <h4>${esc(title)}</h4>
          <p>Quick overview here. Full interactive content stays right below the MacBook.</p>
        </div>
        <span class="sevahub-macbook-preview-status">LIVE TAB</span>
      </div>
      <div class="sevahub-macbook-preview-grid">
        ${tiles.map(tile=>`<div class="sevahub-macbook-preview-card"><span>${esc(tile[0])}</span><b>${esc(tile[1])}</b><small>${esc(tile[2])}</small></div>`).join('')}
      </div>
      <div class="sevahub-macbook-preview-note">The real dashboard is rendered once only, below this preview, for smoother scrolling and tab switching.</div>
      <div class="sevahub-macbook-preview-actions">
        <button type="button" class="sevahub-macbook-preview-btn" data-mac-action="open">Open full view ↓</button>
        <button type="button" class="sevahub-macbook-preview-btn secondary" data-mac-action="focus">Focus first action</button>
      </div>
    </div>`;
  }

  function realChildren(box){
    return Array.from(box?.children||[]).filter(node=>!node.matches?.('[data-sevahub-macbook3d]'));
  }

  function openFullView(box){
    const first=realChildren(box)[0];
    if(first?.scrollIntoView)first.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function focusFirstAction(box){
    const selector='button:not([disabled]),a[href],input:not([type="hidden"]):not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    let target=null;
    for(const root of realChildren(box)){
      if(root.matches?.(selector)){target=root;break}
      target=Array.from(root.querySelectorAll?.(selector)||[]).find(el=>el.getClientRects().length>0)||null;
      if(target)break;
    }
    if(!target){openFullView(box);return}
    target.scrollIntoView?.({behavior:'smooth',block:'center'});
    setTimeout(()=>{try{target.focus({preventScroll:true})}catch(e){try{target.focus()}catch(_){} }},260);
  }

  function wireSection(section,box){
    if(!section||section.dataset.macPreviewWired==='1')return;
    section.dataset.macPreviewWired='1';
    section.addEventListener('click',event=>{
      const action=event.target.closest?.('[data-mac-action]');
      if(!action||!section.contains(action))return;
      if(action.dataset.macAction==='open')openFullView(box);
      else if(action.dataset.macAction==='focus')focusFirstAction(box);
    });
  }

  function renderPreview(box,section,role,key){
    const copy=copyMap[role]?.[key]||copyMap[role]?.default||copyMap.USER.default;
    section.dataset.viewKey=key;
    const kicker=section.querySelector('[data-mac-copy-kicker]');
    const title=section.querySelector('[data-mac-copy-title]');
    const desc=section.querySelector('[data-mac-copy-desc]');
    if(kicker)kicker.textContent=copy[0];
    if(title)title.textContent=copy[1];
    if(desc)desc.textContent=copy[2];
    const screen=section.querySelector('[data-mac-preview-screen]');
    if(screen)screen.innerHTML=previewHTML(role,key);
    wireSection(section,box);
  }

  function enhance(box,role){
    if(!box||!box.isConnected)return;
    const key=detectView(box,role);
    let section=box.querySelector(':scope > [data-sevahub-macbook3d]');
    if(!section){
      box.insertAdjacentHTML('afterbegin',macbookHTML(role,key));
      section=box.querySelector(':scope > [data-sevahub-macbook3d]');
    }
    if(section)renderPreview(box,section,role,key);
  }

  function install(box,role){
    const old=installed[role];
    if(old?.box===box){enhance(box,role);return}
    old?.observer?.disconnect();
    installed[role]=null;
    if(!box)return;

    let pending=false;
    const observer=new MutationObserver(mutations=>{
      const relevant=mutations.some(m=>m.target===box&&[...m.addedNodes,...m.removedNodes].some(node=>{
        return !(node.nodeType===1&&node.matches?.('[data-sevahub-macbook3d]'));
      }));
      if(!relevant||pending)return;
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
