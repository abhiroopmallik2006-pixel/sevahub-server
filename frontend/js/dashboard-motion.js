/* SevaHub lightweight motion controller, adapted from the uploaded Project_SevaHub ZIP.
   No live DOM mirroring, no continuous scroll animation, and no touch-device 3D tilt. */
(function(){
  const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const finePointer=window.matchMedia?.('(hover: hover) and (pointer: fine) and (min-width: 761px)');
  const seenHeadings=new WeakSet();
  const seenMacs=new WeakSet();
  const pendingRoots=new Set();
  let scanRaf=0;
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
  function desktopMotion(){return !reduced()&&Boolean(finePointer?.matches)}
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
      {opacity:0,transform:'translateY(12px)',filter:mobile?'none':'blur(3px)'},
      {opacity:1,transform:'translateY(0)',filter:'blur(0px)'}
    ],{
      duration:mobile?420:560,
      delay:mobile?20:70,
      easing:'cubic-bezier(.2,.72,.25,1)',
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

  function animateMac(section){
    if(seenMacs.has(section))return;
    seenMacs.add(section);
    if(reduced())return;
    const screen=section.querySelector('.sevahub-macbook3d-screen');
    const base=section.querySelector('.sevahub-macbook3d-base');
    const copy=section.querySelector('.sevahub-macbook3d-copy');
    if(screen?.animate)screen.animate([
      {opacity:.55,transform:'translateY(14px) scale(.985)'},
      {opacity:1,transform:'translateY(0) scale(1)'}
    ],{duration:560,easing:'cubic-bezier(.2,.72,.25,1)',fill:'backwards'});
    if(base?.animate)base.animate([
      {opacity:.45,transform:'translateY(8px) scaleX(.96)'},
      {opacity:1,transform:'translateY(0) scaleX(1)'}
    ],{duration:500,delay:80,easing:'ease-out',fill:'backwards'});
    if(copy?.animate)copy.animate([
      {opacity:0,transform:'translateY(10px)'},
      {opacity:1,transform:'translateY(0)'}
    ],{duration:480,delay:100,easing:'ease-out',fill:'backwards'});
  }

  const macObserver=typeof IntersectionObserver==='function'
    ?new IntersectionObserver(entries=>{
      for(const entry of entries){
        if(!entry.isIntersecting)continue;
        macObserver.unobserve(entry.target);
        animateMac(entry.target);
      }
    },{threshold:.18})
    :null;

  function registerMac(section){
    if(seenMacs.has(section)||!inDashboard(section))return;
    if(reduced()){seenMacs.add(section);return}
    if(macObserver)macObserver.observe(section);else animateMac(section);
  }

  function registerCard(card){
    if(!inDashboard(card))return;
    card.classList.add('sev-motion-card');
  }

  function scan(root){
    each(root,headingSelector,registerHeading);
    each(root,'[data-sevahub-macbook3d]',registerMac);
    each(root,cardSelector,registerCard);
  }

  function queue(root){
    if(root?.nodeType===1)pendingRoots.add(root);
    if(scanRaf)return;
    scanRaf=requestAnimationFrame(()=>{
      scanRaf=0;
      const roots=[...pendingRoots];
      pendingRoots.clear();
      if(!roots.length){scan(document.getElementById('app')||document);return}
      roots.forEach(item=>{if(item.isConnected)scan(item)});
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
    if(!desktopMotion()||event.pointerType==='touch')return;
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
      activeCard.style.setProperty('--sev-card-x',`${-y*7}deg`);
      activeCard.style.setProperty('--sev-card-y',`${x*7}deg`);
    });
  },{passive:true});

  document.addEventListener('pointerout',event=>{
    if(activeCard&&!activeCard.contains(event.relatedTarget))resetCard();
  },{passive:true});
  document.addEventListener('pointercancel',resetCard,{passive:true});
  document.addEventListener('scroll',resetCard,{capture:true,passive:true});
  window.addEventListener('blur',resetCard);
  window.addEventListener('resize',resetCard,{passive:true});
  reduce?.addEventListener?.('change',()=>{resetCard();queue(document.getElementById('app')||document.body)});
  finePointer?.addEventListener?.('change',resetCard);

  function start(){
    const app=document.getElementById('app')||document.body;
    scan(app);
    new MutationObserver(mutations=>{
      for(const mutation of mutations){
        mutation.addedNodes.forEach(node=>{
          if(node.nodeType===1&&!node.classList?.contains('sev-ripple'))queue(node);
        });
      }
    }).observe(app,{childList:true,subtree:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
