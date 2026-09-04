/* SevaHub motion smoother.
   Keeps every existing animation; it only interpolates the scroll-driven CSS variables
   written by dashboard-motion.js so fast wheel/touchpad scrolling feels less jerky. */
(function(){
  const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const states=new Map();
  let raf=0;
  let targetRaf=0;
  let lastTime=0;
  let scanRaf=0;

  const configs={
    hero:{
      selector:'[data-dashboard-scroll]',
      vars:[
        ['--sev-hero-angle','deg'],
        ['--sev-hero-scale',''],
        ['--sev-hero-title-y','px']
      ]
    },
    lid:{
      selector:'[data-sevahub-macbook3d]',
      vars:[
        ['--sev-lid-angle','deg'],
        ['--sev-lid-scale',''],
        ['--sev-lid-rise','px']
      ]
    }
  };

  function parseValue(raw){
    const n=parseFloat(String(raw||''));
    return Number.isFinite(n)?n:null;
  }

  function readTargets(el,vars){
    const out={};
    for(const [name,unit] of vars){
      const n=parseValue(el.style.getPropertyValue(name));
      if(n!==null)out[name]={value:n,unit};
    }
    return out;
  }

  function ensureState(el,type){
    let state=states.get(el);
    if(state)return state;
    const vars=configs[type].vars;
    const target=readTargets(el,vars);
    const current={};
    Object.entries(target).forEach(([name,v])=>current[name]={...v});
    state={el,type,vars,current,target,active:false};
    states.set(el,state);
    return state;
  }

  function discover(){
    Object.entries(configs).forEach(([type,cfg])=>{
      document.querySelectorAll(cfg.selector).forEach(el=>ensureState(el,type));
    });
  }

  function refreshTargets(){
    discover();
    states.forEach((state,el)=>{
      if(!el.isConnected){states.delete(el);return}
      const next=readTargets(el,state.vars);
      if(!Object.keys(next).length)return;
      state.target=next;
      if(!Object.keys(state.current).length){
        state.current={};
        Object.entries(next).forEach(([name,v])=>state.current[name]={...v});
      }
      state.active=true;
      el.classList.add('sev-motion-smoothing');
    });
  }

  function frame(now){
    raf=0;
    if(document.hidden)return;
    if(reduce?.matches){
      states.forEach(state=>{
        state.active=false;
        state.el.classList.remove('sev-motion-smoothing');
      });
      return;
    }

    const dt=lastTime?Math.min(40,Math.max(8,now-lastTime)):16.7;
    lastTime=now;
    // Time-based easing: roughly 75 ms response without changing the final positions.
    const alpha=1-Math.exp(-dt/75);
    let keepGoing=false;

    states.forEach((state,el)=>{
      if(!el.isConnected){states.delete(el);return}
      if(!state.active)return;
      let moving=false;
      Object.entries(state.target).forEach(([name,target])=>{
        const cur=state.current[name]||{...target};
        const delta=target.value-cur.value;
        const threshold=name.includes('scale')?0.0005:0.04;
        if(Math.abs(delta)>threshold){
          cur.value+=delta*alpha;
          moving=true;
        }else{
          cur.value=target.value;
        }
        cur.unit=target.unit;
        state.current[name]=cur;
        el.style.setProperty(name,`${cur.value}${cur.unit}`);
      });
      if(moving){keepGoing=true}
      else{
        state.active=false;
        el.classList.remove('sev-motion-smoothing');
      }
    });

    if(keepGoing)raf=requestAnimationFrame(frame);
  }

  function schedule(){
    if(targetRaf||document.hidden)return;
    // dashboard-motion.js is loaded first, so its RAF is queued before this one.
    // Read that freshly-written target once per frame, then interpolate toward it.
    targetRaf=requestAnimationFrame(()=>{
      targetRaf=0;
      refreshTargets();
      if(!raf){lastTime=0;raf=requestAnimationFrame(frame)}
    });
  }

  function queueScan(){
    if(scanRaf)return;
    scanRaf=requestAnimationFrame(()=>{scanRaf=0;discover()});
  }

  document.addEventListener('scroll',schedule,{capture:true,passive:true});
  window.addEventListener('resize',schedule,{passive:true});
  window.addEventListener('orientationchange',schedule,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});
  reduce?.addEventListener?.('change',schedule);

  const root=document.getElementById('app')||document.body;
  new MutationObserver(queueScan).observe(root,{childList:true,subtree:true});

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{discover();schedule()},{once:true});
  else{discover();schedule()}
})();
