/* SevaHub lightweight dashboard motion controller, adapted from the uploaded Project_SevaHub ZIP.
   Scroll motion targets visual preview shells only: no mirrored/live dashboard DOM is transformed. */
(function(){
  const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const finePointer=window.matchMedia?.('(hover: hover) and (pointer: fine) and (min-width: 761px)');
  const scrollSections=new Set();
  const visibleSections=new Set();
  const seenHeadings=new WeakSet();
  const pendingRoots=new Set();
  let scanRaf=0;
  let scrollRaf=0;
  let pointerRaf=0;
  let activeCard=null;
  let activeRect=null;
  let latestPoint=null;

  const cardSelector='.service-card,.worker-card,.layout-grid-card';
  const headingSelector=[
    '.dashboard-scroll-title h2',
    '.dashboard-layout-grid-head h2',
    '.sevahub-macbook3d-copy h3',
    '#userContent > .card.panel > h2',
    '#workerContent > .card.panel > h2',
    '#userContent > .panel > h2',
    '#workerContent > .panel > h2',
    '.instant-readiness-home h2'
  ].join(',');

  function reduced(){return Boolean(reduce?.matches)}
  function desktopScrollMotion(){return !reduced()&&window.innerWidth>760}
  function desktopTilt(){return desktopScrollMotion()&&Boolean(finePointer?.matches)}
  function inDashboard(el){return Boolean(el?.closest?.('main.dashboard'))}

  function each(root,selector,fn){
    if(root?.nodeType!==1&&root!==document)return;
    if(root.matches?.(selector))fn(root);
    root.querySelectorAll?.(selector).forEach(fn);
  }

  function animateHeading(el){
    if(seenHeadings.has(el))return;
    seenHeadings.add(el);
    if(reduced()||!el.animate)return;
    const mobile=window.innerWidth<=760;
    el.animate([
      {opacity:0,transform:'translateY(12px)',filter:mobile?'none':'blur(6px)'},
      {opacity:1,transform:'translateY(0)',filter:'blur(0px)'}
    ],{
      duration:mobile?420:760,
      delay:mobile?20:100,
      easing:'cubic-bezier(.2,.65,.3,1)',
      fill:'backwards'
    });
  }

  const headingObserver=typeof IntersectionObserver==='function'
    ?new IntersectionObserver(entries=>{
      for(const entry of entries){
        if(!entry.isIntersecting)continue;
        headingObserver.unobserve(entry.target);
        animateHeading(entry.target);
      }
    },{threshold:.14,rootMargin:'0px 0px -5% 0px'})
    :null;

  function registerHeading(el){
    if(seenHeadings.has(el)||!inDashboard(el))return;
    if(reduced()){seenHeadings.add(el);return}
    if(headingObserver)headingObserver.observe(el);else animateHeading(el);
  }

  function neutralize(section){
    if(section.hasAttribute('data-dashboard-scroll')){
      section.style.setProperty('--sev-hero-angle','0deg');
      section.style.setProperty('--sev-hero-scale','1');
      section.style.setProperty('--sev-hero-title-y','0px');
      return;
    }
    section.style.setProperty('--sev-mac-angle','0deg');
    section.style.setProperty('--sev-mac-scale','1');
    section.style.setProperty('--sev-mac-rise','0px');
    section.style.setProperty('--sev-mac-copy-y','0px');
    section.style.setProperty('--sev-mac-copy-opacity','1');
    section.style.setProperty('--sev-mac-base-scale','1');
  }

  function registerScrollSection(section){
    if(!inDashboard(section)||scrollSections.has(section))return;
    scrollSections.add(section);
    neutralize(section);
    scrollObserver?.observe(section);
    if(!scrollObserver)visibleSections.add(section);
    scheduleScroll();
  }

  const scrollObserver=typeof IntersectionObserver==='function'
    ?new IntersectionObserver(entries=>{
      for(const entry of entries){
        if(entry.isIntersecting)visibleSections.add(entry.target);
        else visibleSections.delete(entry.target);
      }
      scheduleScroll();
    },{rootMargin:'140px 0px 140px 0px',threshold:0})
    :null;

  function updateScroll(){
    scrollRaf=0;
    if(document.hidden)return;
    const sections=[...visibleSections].filter(el=>el.isConnected);
    if(!desktopScrollMotion()){
      sections.forEach(neutralize);
      return;
    }

    const reads=sections.map(section=>[section,section.getBoundingClientRect()]);
    for(const [section,rect] of reads){
      if(section.hasAttribute('data-dashboard-scroll')){
        const progress=Math.max(0,Math.min(1,(90-rect.top)/Math.max(1,rect.height*.62)));
        const angle=18*(1-progress);
        const scale=.92+.08*progress;
        const titleY=-58*progress;
        section.style.setProperty('--sev-hero-angle',`${angle.toFixed(2)}deg`);
        section.style.setProperty('--sev-hero-scale',scale.toFixed(4));
        section.style.setProperty('--sev-hero-title-y',`${titleY.toFixed(1)}px`);
        continue;
      }

      const range=Math.max(1,Math.min(rect.height,window.innerHeight)*.88);
      const progress=Math.max(0,Math.min(1,(window.innerHeight-rect.top)/range));
      const angle=-36*(1-progress);
      const scale=.90+.10*progress;
      const rise=16*(1-progress);
      const copyY=18*(1-progress);
      const copyOpacity=.58+.42*progress;
      const baseScale=.94+.06*progress;
      section.style.setProperty('--sev-mac-angle',`${angle.toFixed(2)}deg`);
      section.style.setProperty('--sev-mac-scale',scale.toFixed(4));
      section.style.setProperty('--sev-mac-rise',`${rise.toFixed(1)}px`);
      section.style.setProperty('--sev-mac-copy-y',`${copyY.toFixed(1)}px`);
      section.style.setProperty('--sev-mac-copy-opacity',copyOpacity.toFixed(3));
      section.style.setProperty('--sev-mac-base-scale',baseScale.toFixed(4));
    }
  }

  function scheduleScroll(){
    if(!scrollRaf&&!document.hidden)scrollRaf=requestAnimationFrame(updateScroll);
  }

  function registerCard(card){
    if(inDashboard(card))card.classList.add('sev-motion-card');
  }

  function scan(root){
    each(root,headingSelector,registerHeading);
    each(root,'[data-dashboard-scroll],[data-sevahub-macbook3d]',registerScrollSection);
    each(root,cardSelector,registerCard);
  }

  function cleanDetached(){
    scrollSections.forEach(section=>{
      if(section.isConnected)return;
      scrollObserver?.unobserve(section);
      scrollSections.delete(section);
      visibleSections.delete(section);
    });
    if(activeCard&&!activeCard.isConnected)resetCard();
  }

  function queue(root){
    if(root?.nodeType===1)pendingRoots.add(root);
    if(scanRaf)return;
    scanRaf=requestAnimationFrame(()=>{
      scanRaf=0;
      cleanDetached();
      const roots=[...pendingRoots];
      pendingRoots.clear();
      if(!roots.length){scan(document.getElementById('app')||document);scheduleScroll();return}
      roots.forEach(item=>{if(item.isConnected)scan(item)});
      scheduleScroll();
    });
  }

  function resetCard(){
    if(pointerRaf)cancelAnimationFrame(pointerRaf);
    pointerRaf=0;
    if(activeCard){
      activeCard.classList.remove('sev-motion-active');
      activeCard.style.removeProperty('--sev-card-x');
      activeCard.style.removeProperty('--sev-card-y');
    }
    activeCard=null;activeRect=null;latestPoint=null;
  }

  document.addEventListener('pointermove',event=>{
    if(!desktopTilt()||event.pointerType==='touch')return;
    const card=event.target.closest?.('.sev-motion-card');
    if(!card||!inDashboard(card)){resetCard();return}
    if(card!==activeCard){
      resetCard();
      activeCard=card;
      activeRect=card.getBoundingClientRect();
      card.classList.add('sev-motion-active');
    }
    latestPoint={x:event.clientX,y:event.clientY};
    if(pointerRaf)return;
    pointerRaf=requestAnimationFrame(()=>{
      pointerRaf=0;
      if(!activeCard?.isConnected||!activeRect?.width||!activeRect?.height||!latestPoint){resetCard();return}
      const x=Math.max(-.5,Math.min(.5,(latestPoint.x-activeRect.left)/activeRect.width-.5));
      const y=Math.max(-.5,Math.min(.5,(latestPoint.y-activeRect.top)/activeRect.height-.5));
      activeCard.style.setProperty('--sev-card-x',`${(-y*10).toFixed(2)}deg`);
      activeCard.style.setProperty('--sev-card-y',`${(x*10).toFixed(2)}deg`);
    });
  },{passive:true});

  document.addEventListener('pointerout',event=>{
    if(activeCard&&!activeCard.contains(event.relatedTarget))resetCard();
  },{passive:true});
  document.addEventListener('pointercancel',resetCard,{passive:true});
  document.addEventListener('scroll',()=>{resetCard();scheduleScroll()},{capture:true,passive:true});
  window.addEventListener('blur',resetCard);
  window.addEventListener('resize',()=>{resetCard();scrollSections.forEach(neutralize);scheduleScroll()},{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleScroll()});
  reduce?.addEventListener?.('change',()=>{resetCard();scrollSections.forEach(neutralize);scheduleScroll()});
  finePointer?.addEventListener?.('change',resetCard);

  function start(){
    const app=document.getElementById('app')||document.body;
    scan(app);
    new MutationObserver(mutations=>{
      for(const mutation of mutations){
        mutation.addedNodes.forEach(node=>{
          if(node.nodeType===1&&!node.classList?.contains('sev-ripple'))queue(node);
        });
        if(mutation.removedNodes.length)queue(null);
      }
    }).observe(app,{childList:true,subtree:true});
    scheduleScroll();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
