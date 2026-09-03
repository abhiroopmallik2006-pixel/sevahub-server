/* SevaHub dashboard background selector.
   Additive only: does not replace renderers, routes, booking, AI, support or payment logic. */
(function(){
  const KEY='sevahub_dashboard_background';
  const TYPES=new Set(['vortex','wavy','stars','grid']);
  const coarse=()=>window.matchMedia?.('(pointer: coarse)')?.matches;
  const reduced=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const isDark=()=>document.body.classList.contains('dark');
  const rand=(a,b)=>a+Math.random()*(b-a);
  const FRAME_MS=1000/30;

  let layer=null;
  let controls=null;
  let raf=0;
  let resizeHandler=null;
  let scanScheduled=false;
  let appliedType=null;

  const copy={
    en:{toggle:'🎨 Change Background',vortex:'Vortex Background',wavy:'Wavy Background',stars:'Shooting Stars + Stars',grid:'Grid + Dot Background'},
    hi:{toggle:'🎨 बैकग्राउंड बदलें',vortex:'वॉर्टेक्स बैकग्राउंड',wavy:'वेवी बैकग्राउंड',stars:'शूटिंग स्टार्स + तारे',grid:'ग्रिड + डॉट बैकग्राउंड'}
  };

  function lang(){
    try{return localStorage.getItem('sevahub_language_v1')==='hi'?'hi':'en'}catch(e){return 'en'}
  }

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
    if(resizeHandler){window.removeEventListener('resize',resizeHandler);resizeHandler=null}
  }

  function canvasFor(root){
    const canvas=document.createElement('canvas');
    canvas.className='sev-dashboard-bg-canvas';
    root.appendChild(canvas);
    const ctx=canvas.getContext('2d',{alpha:true});
    if(!ctx)return null;

    const resize=()=>{
      const dpr=Math.min(coarse()?1:1.25,window.devicePixelRatio||1);
      const width=Math.max(1,window.innerWidth);
      const height=Math.max(1,window.innerHeight);
      canvas.width=Math.round(width*dpr);
      canvas.height=Math.round(height*dpr);
      canvas.style.width=width+'px';
      canvas.style.height=height+'px';
      ctx.setTransform(dpr,0,0,dpr,0,0);
    };
    resize();
    resizeHandler=resize;
    window.addEventListener('resize',resize,{passive:true});
    return {canvas,ctx};
  }

  function runVortex(root){
    const pack=canvasFor(root);if(!pack)return;
    const {ctx}=pack;
    const count=coarse()?54:92;
    let particles=[];
    let lastFrame=0;

    const reset=()=>{
      const span=Math.max(innerWidth,innerHeight)*.58;
      particles=Array.from({length:count},()=>({z:rand(.2,1),a:rand(0,Math.PI*2),r:rand(22,span),speed:rand(.0015,.0042)}));
    };
    reset();

    const paint=()=>{
      const dark=isDark();
      const w=innerWidth,h=innerHeight,cx=w/2,cy=h/2,span=Math.max(w,h)*.58;
      ctx.clearRect(0,0,w,h);
      ctx.fillStyle=dark?'rgba(4,8,8,.12)':'rgba(255,239,225,.16)';
      ctx.fillRect(0,0,w,h);
      particles.forEach(p=>{
        if(!reduced()){p.a+=p.speed*1.8;p.r-=.28}
        if(p.r<8){p.r=span;p.a=rand(0,Math.PI*2)}
        const x=cx+Math.cos(p.a)*p.r;
        const y=cy+Math.sin(p.a)*p.r*.52;
        const size=1+p.z*2.5;
        ctx.fillStyle=dark
          ?`hsla(${110+p.z*45},90%,${55+p.z*20}%,${.17+p.z*.48})`
          :`hsla(${18+p.z*24},96%,${57+p.z*16}%,${.22+p.z*.34})`;
        ctx.beginPath();ctx.arc(x,y,size,0,Math.PI*2);ctx.fill();
      });
    };

    const loop=(ts)=>{
      if(document.hidden)return;
      if(!lastFrame||ts-lastFrame>=FRAME_MS){lastFrame=ts;paint()}
      if(!reduced())raf=requestAnimationFrame(loop);
    };
    paint();
    if(!reduced())raf=requestAnimationFrame(loop);
  }

  function runWavy(root){
    const pack=canvasFor(root);if(!pack)return;
    const {ctx}=pack;
    const waves=Array.from({length:6},(_,i)=>({amp:18+i*6,phase:i*1.3,speed:.007+i*.001,y:.25+i*.11}));
    let lastFrame=0;

    const paint=()=>{
      const dark=isDark();
      const w=innerWidth,h=innerHeight;
      ctx.clearRect(0,0,w,h);
      waves.forEach((wave,i)=>{
        ctx.beginPath();
        for(let x=0;x<=w;x+=12){
          const y=h*wave.y+Math.sin(x*.008+wave.phase)*wave.amp+Math.sin(x*.002+wave.phase*1.7)*wave.amp*.35;
          if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
        }
        ctx.lineTo(w,h);ctx.lineTo(0,h);ctx.closePath();
        ctx.fillStyle=dark
          ?`hsla(${22+i*9},85%,${48+i*5}%,${.045+i*.012})`
          :`hsla(${18+i*8},92%,${62+i*4}%,${.075+i*.015})`;
        ctx.fill();
        if(!reduced())wave.phase+=wave.speed*1.9;
      });
    };

    const loop=(ts)=>{
      if(document.hidden)return;
      if(!lastFrame||ts-lastFrame>=FRAME_MS){lastFrame=ts;paint()}
      if(!reduced())raf=requestAnimationFrame(loop);
    };
    paint();
    if(!reduced())raf=requestAnimationFrame(loop);
  }

  function runStars(root){
    const starfall=document.createElement('div');
    starfall.className='sev-starfall';
    starfall.setAttribute('aria-hidden','true');
    const count=coarse()?16:26;
    starfall.innerHTML=Array.from({length:count},(_,index)=>{
      const x=Math.round(rand(2,96));
      const drift=Math.round(rand(12,25));
      const delay=(index*.42).toFixed(1);
      const duration=rand(4.6,6.8).toFixed(1);
      return `<span class="sev-falling-star" style="--star-x:${x};--star-drift:${drift};--star-delay:${delay}s;--star-duration:${duration}s"></span>`;
    }).join('');
    root.appendChild(starfall);
  }

  function apply(type){
    if(!layer)return;
    type=TYPES.has(type)?type:'grid';
    stopAnimation();
    layer.className=`sev-dashboard-bg-layer sev-dashboard-bg-${type}`;
    layer.innerHTML='';
    appliedType=type;
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
    const c=copy[lang()];
    const current=savedType();
    const toggle=controls.querySelector('[data-sev-bg-toggle]');
    if(toggle)toggle.textContent=c.toggle;
    controls.querySelectorAll('[data-sev-bg-option]').forEach(btn=>{
      const type=btn.dataset.sevBgOption;
      btn.classList.toggle('active',type===current);
      btn.setAttribute('aria-pressed',String(type===current));
      const text=btn.querySelector('[data-sev-bg-label]');if(text)text.textContent=c[type];
      const check=btn.querySelector('[data-sev-bg-check]');if(check)check.textContent=type===current?'✓':'';
    });
  }

  function createControls(){
    const c=copy[lang()];
    const root=document.createElement('div');
    root.className='sev-dashboard-bg-controls';
    root.dataset.noTranslate='true';
    root.innerHTML=`<button type="button" class="sev-dashboard-bg-toggle" data-sev-bg-toggle aria-expanded="false">${c.toggle}</button><div class="sev-dashboard-bg-menu" data-sev-bg-menu>${Array.from(TYPES).map(type=>`<button type="button" class="sev-dashboard-bg-option" data-sev-bg-option="${type}" aria-pressed="false"><span class="sev-bg-option-preview sev-bg-${type}"></span><span data-sev-bg-label>${c[type]}</span><b data-sev-bg-check></b></button>`).join('')}</div>`;
    root.querySelector('[data-sev-bg-toggle]')?.addEventListener('click',()=>{
      const menu=root.querySelector('[data-sev-bg-menu]');
      const open=menu?.classList.toggle('open');
      root.querySelector('[data-sev-bg-toggle]')?.setAttribute('aria-expanded',String(Boolean(open)));
    });
    root.querySelectorAll('[data-sev-bg-option]').forEach(btn=>btn.addEventListener('click',()=>select(btn.dataset.sevBgOption)));
    return root;
  }

  function mount(){
    if(!document.querySelector('main.dashboard'))return unmount();
    document.body.classList.add('sev-dashboard-bg-active');
    const current=savedType();
    const firstMount=!layer;
    if(!layer){layer=document.createElement('div');layer.setAttribute('aria-hidden','true');document.body.appendChild(layer)}
    if(!controls){controls=createControls();document.body.appendChild(controls)}
    if(firstMount||appliedType!==current)apply(current);else updateControl();
  }

  function unmount(){
    stopAnimation();
    layer?.remove();layer=null;
    controls?.remove();controls=null;
    appliedType=null;
    document.body.classList.remove('sev-dashboard-bg-active');
  }

  function scan(){
    if(scanScheduled)return;
    scanScheduled=true;
    requestAnimationFrame(()=>{scanScheduled=false;document.querySelector('main.dashboard')?mount():unmount()});
  }

  function mutationAffectsDashboard(mutation,root){
    if(mutation.target===root)return true;
    const nodes=[...mutation.addedNodes,...mutation.removedNodes];
    return nodes.some(node=>node.nodeType===1&&(node.matches?.('main.dashboard')||node.querySelector?.('main.dashboard')));
  }

  document.addEventListener('click',event=>{
    if(!controls||controls.contains(event.target))return;
    controls.querySelector('[data-sev-bg-menu]')?.classList.remove('open');
    controls.querySelector('[data-sev-bg-toggle]')?.setAttribute('aria-expanded','false');
  });
  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape'||!controls)return;
    controls.querySelector('[data-sev-bg-menu]')?.classList.remove('open');
    controls.querySelector('[data-sev-bg-toggle]')?.setAttribute('aria-expanded','false');
  });
  window.addEventListener('sevahub-language-changed',updateControl);
  document.addEventListener('visibilitychange',()=>{
    if(!layer)return;
    if(document.hidden)stopAnimation();
    else if(['vortex','wavy'].includes(appliedType))apply(appliedType);
  });

  const root=document.getElementById('app')||document.body;
  const observer=new MutationObserver(mutations=>{
    if(mutations.some(m=>mutationAffectsDashboard(m,root)))scan();
  });
  observer.observe(root,{childList:true,subtree:true});
  scan();
})();
