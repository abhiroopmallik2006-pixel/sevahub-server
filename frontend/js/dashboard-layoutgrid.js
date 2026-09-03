/* SevaHub interior dashboard visual layer.
   Keeps the hero and service grid, but avoids continuous scroll animation work. */
(function(){
  let previewObserver=null;

  const userCards=[
    {id:1,serviceId:1,title:'Home Cleaning',desc:'Find trusted professionals for cleaning, deep cleaning and everyday household help.',className:'wide',thumb:'https://images.unsplash.com/photo-1581578731548-c64695cc6952?q=65&w=900&auto=format&fit=crop'},
    {id:2,serviceId:3,title:'Electrician',desc:'Book verified help for switches, wiring, fans, lights and other electrical work.',className:'',thumb:'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?q=65&w=900&auto=format&fit=crop'},
    {id:3,serviceId:2,title:'Plumber',desc:'Get help with leaks, taps, pipes, fittings and urgent plumbing needs.',className:'',thumb:'https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?q=65&w=900&auto=format&fit=crop'},
    {id:4,serviceId:5,title:'Appliance Repair',desc:'Connect with professionals for practical appliance repair and maintenance.',className:'wide',thumb:'https://images.unsplash.com/photo-1621905252507-b35492cc74b4?q=65&w=900&auto=format&fit=crop'}
  ];

  const workerCards=[
    {id:1,serviceId:1,title:'Home Cleaning',desc:'Take cleaning requests, review customer details and manage each job smoothly.',className:'wide',thumb:'https://images.unsplash.com/photo-1581578731548-c64695cc6952?q=65&w=900&auto=format&fit=crop'},
    {id:2,serviceId:3,title:'Electrician Services',desc:'Handle electrical repair and installation requests from nearby customers.',className:'',thumb:'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?q=65&w=900&auto=format&fit=crop'},
    {id:3,serviceId:2,title:'Plumbing Services',desc:'Find plumbing jobs, respond to requests and keep your schedule organized.',className:'',thumb:'https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?q=65&w=900&auto=format&fit=crop'},
    {id:4,serviceId:5,title:'Appliance Repair',desc:'Grow your service requests with transparent pricing and customer bargains.',className:'wide',thumb:'https://images.unsplash.com/photo-1621905252507-b35492cc74b4?q=65&w=900&auto=format&fit=crop'}
  ];

  function esc(value=''){
    if(typeof globalThis.esc==='function')return globalThis.esc(value);
    return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  }

  function firstName(){
    try{return esc(String(state?.user?.fullName||'there').split(' ')[0]||'there')}catch(e){return 'there'}
  }

  function heroHtml(role){
    const worker=role==='WORKER';
    return `<section class="dashboard-scroll-hero" data-dashboard-scroll data-interior-animation="1">
      <div class="dashboard-scroll-title">
        <span class="dashboard-scroll-kicker">SEVAHUB ${worker?'WORKER':'USER'} EXPERIENCE</span>
        <h2>${worker?'Manage your work with confidence.':'Everything you need, right at your fingertips.'}</h2>
        <p>${worker?'Track requests, bargains and earnings from one workspace.':'Find trusted professionals, manage bookings and negotiate fair prices.'}</p>
      </div>
      <div class="dashboard-scroll-stage">
        <div class="dashboard-scroll-glow"></div>
        <div class="dashboard-scroll-card" data-scroll-card>
          <div class="dashboard-scroll-browserbar"><span></span><span></span><span></span><b>app.sevahub.local</b><em>${worker?'Worker Dashboard':'User Dashboard'}</em></div>
          <div class="dashboard-scroll-preview">
            <div class="dashboard-preview-top"><strong>SEVAHUB</strong><small>Good day, ${firstName()} 👋</small><i>${worker?'🧰':'👤'}</i></div>
            <div class="dashboard-preview-heading">${worker?'Your work, organized in one place.':'Your services, bookings & bargains — simplified.'}</div>
            <div class="dashboard-preview-grid">
              <div><small>${worker?'REQUESTS':'ACTIVE BOOKINGS'}</small><b data-preview-stat="0">—</b></div>
              <div><small>${worker?'RATING':'💎 GEMS'}</small><b data-preview-stat="1">—</b></div>
              <div><small>${worker?'EARNINGS':'PENDING BARGAINS'}</small><b data-preview-stat="2">—</b></div>
              <div><small>${worker?'BARGAINS':'COMPLETED'}</small><b data-preview-stat="3">—</b></div>
            </div>
            <div class="dashboard-preview-action"><span>${worker?'🛠️ New service request':'✨ Recommended services'}</span><b>Explore →</b></div>
          </div>
        </div>
      </div>
      <div class="dashboard-scroll-hint"><span>↓</span> Scroll to explore</div>
    </section>`;
  }

  function gridHtml(role){
    const worker=role==='WORKER';
    const cards=worker?workerCards:userCards;
    return `<section class="dashboard-layout-grid" data-layout-grid data-interior-animation="1">
      <div class="dashboard-layout-grid-head">
        <span class="dashboard-scroll-kicker">${worker?'POPULAR WORK CATEGORIES':'POPULAR SERVICES'}</span>
        <h2>${worker?'Choose the work you want to grow.':'Find the right professional for your home.'}</h2>
        <p>${worker?'Explore service categories and jump into your current requests.':'Explore popular household services with a visual, easy-to-browse experience.'}</p>
      </div>
      <div class="layout-grid-cards">
        ${cards.map(card=>`<article class="layout-grid-card ${card.className}" data-grid-card="${card.id}" data-service-id="${card.serviceId}" tabindex="0" style="background-image:url('${card.thumb}')">
          <div class="layout-grid-overlay"></div>
          <div class="layout-grid-content">
            <span class="layout-grid-number">0${card.id}</span>
            <h3>${esc(card.title)}</h3>
            <p>${esc(card.desc)}</p>
            <button type="button" class="btn small layout-grid-action" data-layout-action="1">${worker?'View requests':'Explore service'} →</button>
          </div>
        </article>`).join('')}
      </div>
    </section>`;
  }

  function cleanupPreview(){
    try{previewObserver?.disconnect()}catch(e){}
    previewObserver=null;
  }

  function setupPreviewSync(dashboard){
    const source=dashboard.querySelector('.stats');
    if(!source)return;
    const sync=()=>{
      const values=[...source.querySelectorAll('.stat b')].map(el=>String(el.textContent||'—').trim()||'—');
      dashboard.querySelectorAll('[data-preview-stat]').forEach((el,i)=>{el.textContent=values[i]||'—'});
    };
    sync();
    try{
      previewObserver=new MutationObserver(sync);
      previewObserver.observe(source,{subtree:true,childList:true,characterData:true});
    }catch(e){}
    setTimeout(sync,350);
  }

  function scrollToContent(role){
    setTimeout(()=>document.getElementById(role==='WORKER'?'workerContent':'userContent')?.scrollIntoView({behavior:'smooth',block:'start'}),80);
  }

  function activateGrid(role,dashboard){
    dashboard.querySelectorAll('[data-grid-card]').forEach(card=>{
      const toggle=()=>card.classList.toggle('is-active');
      card.addEventListener('click',event=>{if(!event.target.closest('[data-layout-action]'))toggle()});
      card.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();toggle()}});
      card.querySelector('[data-layout-action]')?.addEventListener('click',event=>{
        event.stopPropagation();
        const serviceId=Number(card.dataset.serviceId);
        try{
          if(role==='WORKER'){
            if(typeof globalThis.workerBookings==='function')globalThis.workerBookings();
          }else if(Number.isInteger(serviceId)&&serviceId>0&&typeof globalThis.showWorkers==='function'){
            globalThis.showWorkers(serviceId);
          }else if(typeof globalThis.userServices==='function')globalThis.userServices();
          scrollToContent(role);
        }catch(e){console.warn('Layout grid action unavailable',e)}
      });
    });
  }

  function enhance(role){
    cleanupPreview();
    const dashboard=document.querySelector('main.dashboard');
    if(!dashboard||dashboard.dataset.layoutgridEnhanced==='1')return;
    dashboard.dataset.layoutgridEnhanced='1';

    const shell=document.createElement('div');
    shell.innerHTML=heroHtml(role)+gridHtml(role);
    const nodes=[...shell.children];

    if(role==='USER'){
      const heading=[...dashboard.children].find(el=>el.classList?.contains('split'))||dashboard.firstElementChild;
      heading?.classList?.add('dashboard-user-heading');
      nodes.forEach(node=>dashboard.insertBefore(node,heading||dashboard.firstChild));
    }else{
      const firstHeading=[...dashboard.children].find(el=>el.tagName==='H1');
      const intro=firstHeading?.nextElementSibling?.tagName==='P'?firstHeading.nextElementSibling:null;
      const wrap=document.createElement('div');
      wrap.className='dashboard-worker-heading';
      if(firstHeading){dashboard.insertBefore(wrap,firstHeading);wrap.appendChild(firstHeading);if(intro)wrap.appendChild(intro)}
      const anchor=wrap.isConnected?wrap:dashboard.firstChild;
      nodes.forEach(node=>dashboard.insertBefore(node,anchor));
    }

    activateGrid(role,dashboard);
    setupPreviewSync(dashboard);
  }

  function wrapRenderer(name,role){
    const original=globalThis[name];
    if(typeof original!=='function'||original.__sevahubLayoutGridWrapped)return;
    const wrapped=function(...args){
      const result=original.apply(this,args);
      try{enhance(role)}catch(e){console.warn('Interior visual skipped',e)}
      return result;
    };
    wrapped.__sevahubLayoutGridWrapped=true;
    globalThis[name]=wrapped;
  }

  wrapRenderer('renderUser','USER');
  wrapRenderer('renderWorker','WORKER');
  try{if(typeof state!=='undefined'&&state?.user&&state?.role)enhance(state.role)}catch(e){}
})();