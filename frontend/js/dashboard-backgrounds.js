/* SevaHub dashboard background selector - performance focused. */
(function(){
  const KEY='sevahub_dashboard_background';
  const TYPES=new Set(['vortex','wavy','stars','grid']);
  const coarse=()=>window.matchMedia?.('(pointer: coarse)')?.matches;
  const reduced=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const dark=()=>document.body.classList.contains('dark');
  const rand=(a,b)=>a+Math.random()*(b-a);
  const FRAME_MS=coarse()?66:50;

  let layer=null;
  let controls=null;
  let raf=0;
  let frameTimer=0;
  let resizeHandler=null;
  let scanScheduled=false;
  let appliedType=null;
  let scrolling=false;
  let scrollTimer=0;

  const copy={
    en:{toggle:'🎨 Change Background',vortex:'Vortex Background',wavy:'Wavy Background',stars:'Shooting Stars + Stars',grid:'Grid + Dot Background'},
    hi:{toggle:'🎨 बैकग्राउंड बदलें',vortex:'वॉर्टेक्स बैकग्राउंड',wavy:'वेवी बैकग्राउंड',stars:'शूटिंग स्टार्स + तारे',grid:'ग्रिड + डॉट बैकग्राउंड'}
  };

  function lang(){try{return localStorage.getItem('sevahub_language_v1')==='hi'?'hi':'en'}catch(e){return 'en'}}
  function savedType(){
    try{
      const value=localStorage.getItem(KEY)||'grid';
      if(TYPES.has(value))return value;
      localStorage.setItem(KEY,'grid');
      return 'grid';
    }catch(e){return 'grid'}
  }

  function stopAnimation(){
    if(raf){cancelAnimationFrame(raf);raf=0}
    if(frameTimer){clearTimeout(frameTimer);frameTimer=0}
    if(resizeHandler){window.removeEventListener('resize',resizeHandler);resizeHandler=null}
  }

  function scheduleFrame(fn){
    if(reduced()||document.hidden)return;
    frameTimer=setTimeout(()=>{frameTimer=0;raf=requestAnimationFrame(fn)},FRAME_MS);
  }

  function canvasFor(root){
    const canvas=document.createElement('canvas');
    canvas.className='sev-dashboard-bg-canvas';
    root.appendChild(canvas);
    const ctx=canvas.getContext('2d',{alpha:true});
    if(!ctx)return null;
    let resizeTimer=0;
    const resizeNow=()=>{
      const width=Math.max(1,innerWidth),height=Math.max(1,innerHeight),dpr=1;
      canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
      canvas.style.width=width+'px';canvas.style.height=height+'px';
      ctx.setTransform(dpr,0,0,dpr,0,0);
    };
    resizeNow();
    resizeHandler=()=>{
      if(resizeTimer)clearTimeout(resizeTimer);
      resizeTimer=setTimeout(resizeNow,120);
    };
    window.addEventListener('resize',resizeHandler,{passive:true});
    return {ctx};
  }

  function runVortex(root){
    const pack=canvasFor(root);if(!pack)return;
    const {ctx}=pack;
    const count=coarse()?30:54;
    let particles=[];
    const reset=()=>{
      const span=Math.max(innerWidth,innerHeight)*.58;
      particles=Array.from({length:count},()=>({z:rand(.2,1),a:rand(0,Math.PI*2),r:rand(22,span),speed:rand(.002,.0048)}));
    };
    reset();
    const paint=()=>{
      if(!scrolling){
        const isDark=dark();
        const w=innerWidth,h=innerHeight,cx=w/2,cy=h/2,span=Math.max(w,h)*.58;
        ctx.clearRect(0,0,w,h);
        ctx.fillStyle=isDark?'rgba(4,8,8,.12)':'rgba(255,239,225,.14)';ctx.fillRect(0,0,w,h);
        particles.forEach(p=>{
          p.a+=p.speed*2.25;p.r-=.38;
          if(p.r<8){p.r=span;p.a=rand(0,Math.PI*2)}
          const x=cx+Math.cos(p.a)*p.r,y=cy+Math.sin(p.a)*p.r*.52,size=1+p.z*2.4;
          ctx.fillStyle=isDark?`hsla(${110+p.z*45},90%,${55+p.z*20}%,${.17+p.z*.48})`:`hsla(${18+p.z*24},96%,${57+p.z*16}%,${.22+p.z*.34})`;
          ctx.beginPath();ctx.arc(x,y,size,0,Math.PI*2);ctx.fill();
        });
      }
      scheduleFrame(paint);
    };
    paint();
  }

  function runWavy(root){
    const pack=canvasFor(root);if(!pack)return;
    const {ctx}=pack;
    const waves=Array.from({length:5},(_,i)=>({amp:18+i*7,phase:i*1.35,speed:.008+i*.0012,y:.27+i*.12}));
    const paint=()=>{
      if(!scrolling){
        const isDark=dark(),w=innerWidth,h=innerHeight;
        ctx.clearRect(0,0,w,h);
        waves.forEach((wave,i)=>{
          ctx.beginPath();
          for(let x=0;x<=w;x+=18){
            const y=h*wave.y+Math.sin(x*.008+wave.phase)*wave.amp+Math.sin(x*.002+wave.phase*1.7)*wave.amp*.35;
            x===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
          }
          ctx.lineTo(w,h);ctx.lineTo(0,h);ctx.closePath();
          ctx.fillStyle=isDark?`hsla(${22+i*9},85%,${48+i*5}%,${.05+i*.014})`:`hsla(${18+i*8},92%,${62+i*4}%,${.08+i*.017})`;
          ctx.fill();wave.phase+=wave.speed*2.4;
        });
      }
      scheduleFrame(paint);
    };
    paint();
  }

  function runStars(root){
    const starfall=document.createElement('div');
    starfall.className='sev-starfall';
    starfall.setAttribute('aria-hidden','true');
    const count=coarse()?10:16;
    starfall.innerHTML=Array.from({length:count},(_,index)=>{
      const x=Math.round(rand(2,96)),drift=Math.round(rand(12,25)),delay=(index*.55).toFixed(1),duration=rand(5.2,7.5).toFixed(1);
      return `<span class="sev-falling-star" style="--star-x:${x};--star-drift:${drift};--star-delay:${delay}s;--star-duration:${duration}s"></span>`;
    }).join('');
    root.appendChild(starfall);
  }

  function apply(type){
    if(!layer)return;
    type=TYPES.has(type)?type:'grid';
    stopAnimation();
    layer.className=`sev-dashboard-bg-layer sev-dashboard-bg-${type}`;layer.innerHTML='';appliedType=type;
    if(type==='grid')layer.innerHTML='<div class="sev-dashboard-bg-grid-lines"></div><div class="sev-dashboard-bg-grid-fade"></div><div class="sev-dashboard-bg-dots"></div>';
    else if(type==='vortex')runVortex(layer);
    else if(type==='wavy')runWavy(layer);
    else if(type==='stars')runStars(layer);
    updateControl();
  }

  function select(type){
    if(!TYPES.has(type))return;
    try{localStorage.setItem(KEY,type)}catch(e){}
    apply(type);
    controls?.querySelector('[data-sev-bg-menu]')?.classList.remove('open');
    controls?.querySelector('[data-sev-bg-toggle]')?.setAttribute('aria-expanded','false');
  }

  function updateControl(){
    if(!controls)return;
    const c=copy[lang()],current=savedType();
    const toggle=controls.querySelector('[data-sev-bg-toggle]');if(toggle)toggle.textContent=c.toggle;
    controls.querySelectorAll('[data-sev-bg-option]').forEach(btn=>{
      const type=btn.dataset.sevBgOption;btn.classList.toggle('active',type===current);btn.setAttribute('aria-pressed',String(type===current));
      const text=btn.querySelector('[data-sev-bg-label]');if(text)text.textContent=c[type];
      const check=btn.querySelector('[data-sev-bg-check]');if(check)check.textContent=type===current?'✓':'';
    });
  }

  function createControls(){
    const c=copy[lang()],root=document.createElement('div');
    root.className='sev-dashboard-bg-controls';root.dataset.noTranslate='true';
    root.innerHTML=`<button type="button" class="sev-dashboard-bg-toggle" data-sev-bg-toggle aria-expanded="false">${c.toggle}</button><div class="sev-dashboard-bg-menu" data-sev-bg-menu>${Array.from(TYPES).map(type=>`<button type="button" class="sev-dashboard-bg-option" data-sev-bg-option="${type}" aria-pressed="false"><span class="sev-bg-option-preview sev-bg-${type}"></span><span data-sev-bg-label>${c[type]}</span><b data-sev-bg-check></b></button>`).join('')}</div>`;
    root.querySelector('[data-sev-bg-toggle]')?.addEventListener('click',()=>{
      const menu=root.querySelector('[data-sev-bg-menu]'),open=menu?.classList.toggle('open');root.querySelector('[data-sev-bg-toggle]')?.setAttribute('aria-expanded',String(Boolean(open)));
    });
    root.querySelectorAll('[data-sev-bg-option]').forEach(btn=>btn.addEventListener('click',()=>select(btn.dataset.sevBgOption)));
    return root;
  }

  function mount(){
    if(!document.querySelector('main.dashboard'))return unmount();
    document.body.classList.add('sev-dashboard-bg-active');
    const current=savedType(),first=!layer;
    if(!layer){layer=document.createElement('div');layer.setAttribute('aria-hidden','true');document.body.appendChild(layer)}
    if(!controls){controls=createControls();document.body.appendChild(controls)}
    if(first||appliedType!==current)apply(current);else updateControl();
  }

  function unmount(){
    stopAnimation();layer?.remove();layer=null;controls?.remove();controls=null;appliedType=null;document.body.classList.remove('sev-dashboard-bg-active');
  }

  function scan(){
    if(scanScheduled)return;scanScheduled=true;
    requestAnimationFrame(()=>{scanScheduled=false;document.querySelector('main.dashboard')?mount():unmount()});
  }

  function mutationAffectsDashboard(mutation,root){
    if(mutation.target===root)return true;
    return [...mutation.addedNodes,...mutation.removedNodes].some(node=>node.nodeType===1&&(node.matches?.('main.dashboard')||node.querySelector?.('main.dashboard')));
  }

  window.addEventListener('scroll',()=>{
    scrolling=true;
    if(scrollTimer)clearTimeout(scrollTimer);
    scrollTimer=setTimeout(()=>{scrolling=false},140);
  },{passive:true});
  document.addEventListener('click',event=>{
    if(!controls||controls.contains(event.target))return;
    controls.querySelector('[data-sev-bg-menu]')?.classList.remove('open');controls.querySelector('[data-sev-bg-toggle]')?.setAttribute('aria-expanded','false');
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&controls){controls.querySelector('[data-sev-bg-menu]')?.classList.remove('open');controls.querySelector('[data-sev-bg-toggle]')?.setAttribute('aria-expanded','false')}});
  window.addEventListener('sevahub-language-changed',updateControl);
  document.addEventListener('visibilitychange',()=>{if(!layer)return;if(document.hidden)stopAnimation();else if(['vortex','wavy'].includes(appliedType))apply(appliedType)});

  const root=document.getElementById('app')||document.body;
  const observer=new MutationObserver(mutations=>{if(mutations.some(m=>mutationAffectsDashboard(m,root)))scan()});
  observer.observe(root,{childList:true,subtree:true});
  scan();
})();