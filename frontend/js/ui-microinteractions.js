/* SevaHub lightweight UI micro-interactions.
   Additive only: no booking/auth/payment/AI/support logic is replaced. */
(function(){
  const reduced=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const seen=new WeakSet();
  const statValues=new WeakMap();

  function markReveal(root=document){
    if(reduced())return;
    root.querySelectorAll?.('.dashboard #userContent > *, .dashboard #workerContent > *, .service-card, .worker-card, .offer, .booking-chat, .support-panel, .activity-report-panel').forEach((el,i)=>{
      if(seen.has(el))return;
      seen.add(el);
      el.classList.add('sev-reveal');
      el.style.setProperty('--sev-delay',`${Math.min(i*28,180)}ms`);
      requestAnimationFrame(()=>el.classList.add('sev-reveal-in'));
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
    if(reduced()||!el?.isConnected)return;
    const parsed=parseNumeric(el.textContent);
    if(!parsed||!Number.isFinite(parsed.value))return;
    const previous=statValues.get(el);
    statValues.set(el,parsed.value);
    if(previous===undefined||previous===parsed.value)return;
    const start=performance.now();
    const duration=380;
    const from=Number(previous);
    const to=parsed.value;
    function frame(now){
      if(!el.isConnected)return;
      const p=Math.min(1,(now-start)/duration);
      const eased=1-Math.pow(1-p,3);
      const value=from+(to-from)*eased;
      el.textContent=parsed.prefix+value.toLocaleString('en-IN',{minimumFractionDigits:parsed.decimals,maximumFractionDigits:parsed.decimals})+parsed.suffix;
      if(p<1)requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function syncStats(root=document){
    root.querySelectorAll?.('.stats .stat b').forEach(el=>{
      if(!statValues.has(el)){
        const p=parseNumeric(el.textContent);
        if(p)statValues.set(el,p.value);
      }
    });
  }

  function decorateServiceIcons(root=document){
    root.querySelectorAll?.('.service-icon').forEach(el=>{
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

  document.addEventListener('click',event=>{
    const btn=event.target.closest?.('button,.btn');
    if(btn)addRipple(btn,event);
  },true);

  const observer=new MutationObserver(mutations=>{
    let refreshNeeded=false;
    for(const mutation of mutations){
      if(mutation.type==='characterData'){
        const parent=mutation.target.parentElement;
        if(parent?.matches?.('.stats .stat b'))animateStat(parent);
      }
      if(mutation.type==='childList'){
        if(mutation.target?.matches?.('.stats .stat b'))animateStat(mutation.target);
        refreshNeeded=true;
      }
    }
    if(refreshNeeded)requestAnimationFrame(()=>refresh(document));
  });

  function start(){
    refresh(document);
    observer.observe(document.getElementById('app')||document.body,{subtree:true,childList:true,characterData:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();