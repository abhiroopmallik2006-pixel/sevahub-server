/* SevaHub lightweight UI micro-interactions.
   Additive only: no booking/auth/payment/AI/support logic is replaced. */
(function(){
  const reducedMedia=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const reduced=()=>Boolean(reducedMedia?.matches);
  const seen=new WeakSet();
  const statValues=new WeakMap();
  const animatingStats=new WeakSet();
  const pendingRoots=new Set();
  let refreshRaf=0;

  const revealSelector='.dashboard #userContent > *, .dashboard #workerContent > *, .service-card, .worker-card, .offer, .booking-chat, .support-panel, .activity-report-panel';

  function eachMatch(root,selector,callback){
    let index=0;
    if(root?.nodeType===1&&root.matches?.(selector))callback(root,index++);
    root?.querySelectorAll?.(selector).forEach(el=>callback(el,index++));
  }

  function markReveal(root=document){
    if(reduced())return;
    eachMatch(root,revealSelector,(el,i)=>{
      if(seen.has(el))return;
      seen.add(el);
      el.classList.add('sev-reveal');
      el.style.setProperty('--sev-delay',`${Math.min(i*28,180)}ms`);
      requestAnimationFrame(()=>{if(el.isConnected)el.classList.add('sev-reveal-in')});
    });
  }

  function addRipple(button,event){
    if(reduced()||!button?.isConnected)return;
    const rect=button.getBoundingClientRect();
    const dot=document.createElement('span');
    dot.className='sev-ripple';
    const size=Math.max(rect.width,rect.height)*1.1;
    const x=(event?.clientX||rect.left+rect.width/2)-rect.left-size/2;
    const y=(event?.clientY||rect.top+rect.height/2)-rect.top-size/2;
    dot.style.width=dot.style.height=`${size}px`;
    dot.style.left=`${x}px`;
    dot.style.top=`${y}px`;
    button.appendChild(dot);
    dot.addEventListener('animationend',()=>dot.remove(),{once:true});
  }

  function parseNumeric(text){
    const clean=String(text||'').replace(/,/g,'');
    const m=clean.match(/^([^0-9-]*)(-?\d+(?:\.\d+)?)(.*)$/);
    if(!m)return null;
    return {prefix:m[1],value:Number(m[2]),suffix:m[3],decimals:(m[2].split('.')[1]||'').length};
  }

  function animateStat(el){
    if(reduced()||!el?.isConnected||animatingStats.has(el))return;
    const parsed=parseNumeric(el.textContent);
    if(!parsed||!Number.isFinite(parsed.value))return;
    const previous=statValues.get(el);
    if(previous===undefined){statValues.set(el,parsed.value);return;}
    if(previous===parsed.value)return;

    const start=performance.now();
    const duration=320;
    const from=Number(previous);
    const to=parsed.value;
    animatingStats.add(el);

    function frame(now){
      if(!el.isConnected){animatingStats.delete(el);return;}
      const p=Math.min(1,(now-start)/duration);
      const eased=1-Math.pow(1-p,3);
      const value=from+(to-from)*eased;
      el.textContent=parsed.prefix+value.toLocaleString('en-IN',{minimumFractionDigits:parsed.decimals,maximumFractionDigits:parsed.decimals})+parsed.suffix;
      if(p<1){requestAnimationFrame(frame);return;}
      statValues.set(el,to);
      requestAnimationFrame(()=>animatingStats.delete(el));
    }
    requestAnimationFrame(frame);
  }

  function syncStats(root=document){
    eachMatch(root,'.stats .stat b',el=>{
      if(animatingStats.has(el)||statValues.has(el))return;
      const p=parseNumeric(el.textContent);
      if(p)statValues.set(el,p.value);
    });
  }

  function decorateServiceIcons(root=document){
    eachMatch(root,'.service-icon',el=>{
      if(el.dataset.sevGraphic==='1')return;
      el.dataset.sevGraphic='1';
      el.classList.add('sev-service-icon');
    });
  }

  function refresh(root=document){
    markReveal(root);
    syncStats(root);
    decorateServiceIcons(root);
  }

  function queueRefresh(root){
    if(!root)return;
    if(root.nodeType===3)root=root.parentElement;
    if(!root)return;
    if(pendingRoots.size>=18){
      pendingRoots.clear();
      pendingRoots.add(document.getElementById('app')||document);
    }else{
      pendingRoots.add(root);
    }
    if(refreshRaf)return;
    refreshRaf=requestAnimationFrame(()=>{
      refreshRaf=0;
      const roots=[...pendingRoots];
      pendingRoots.clear();
      roots.forEach(item=>{if(item===document||item.isConnected)refresh(item)});
    });
  }

  document.addEventListener('click',event=>{
    const btn=event.target.closest?.('button,.btn');
    if(btn)addRipple(btn,event);
  },true);

  const observer=new MutationObserver(mutations=>{
    for(const mutation of mutations){
      if(mutation.type==='characterData'){
        const parent=mutation.target.parentElement;
        if(parent?.matches?.('.stats .stat b')&&!animatingStats.has(parent))animateStat(parent);
        continue;
      }
      if(mutation.type!=='childList')continue;
      if(mutation.target?.matches?.('.stats .stat b')&&!animatingStats.has(mutation.target))animateStat(mutation.target);
      mutation.addedNodes.forEach(node=>{
        if(node.nodeType!==1)return;
        if(node.classList?.contains('sev-ripple'))return;
        queueRefresh(node);
      });
    }
  });

  function start(){
    refresh(document);
    observer.observe(document.getElementById('app')||document.body,{subtree:true,childList:true,characterData:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
