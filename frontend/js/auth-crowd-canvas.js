/* SevaHub walking crowd canvas.
   Vanilla JS adaptation of the supplied CrowdCanvas concept.
   No React, GSAP or sprite-sheet dependency; decorative auth-page layer only. */
(function(){
  const reduced=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const coarse=()=>window.matchMedia?.('(pointer: coarse)')?.matches;
  const rand=(min,max)=>min+Math.random()*(max-min);
  const pick=list=>list[Math.floor(Math.random()*list.length)];

  const skins=['#5f3a28','#81513b','#a86d4e','#c98a68','#e0ad8d','#f0c9ab'];
  const clothes=['#9b4a16','#b75a1b','#d6852f','#31556f','#4d6b5f','#704b62','#8a6b36'];
  const accents=['#2d3f4f','#684326','#efe1cd','#c65b2e','#476d62'];

  let active=null;
  let mountScheduled=false;

  function createWalker(width,height,index){
    const depth=rand(.72,1.12);
    return {
      x:rand(0,width),
      ground:height-rand(18,Math.min(115,height*.33)),
      dir:Math.random()>.5?1:-1,
      speed:rand(12,28)*depth,
      scale:depth,
      phase:rand(0,Math.PI*2),
      step:rand(2.2,3.5),
      skin:pick(skins),
      shirt:pick(clothes),
      trouser:pick(accents),
      hair:pick(['#2d211d','#4b3327','#6b4a34','#1f1f1f']),
      bag:index%5===0,
      tool:index%7===0
    };
  }

  function pathRoundRect(ctx,x,y,w,h,r){
    r=Math.min(r,w/2,h/2);
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r);
    ctx.closePath();
  }

  function drawPerson(ctx,p,time){
    const walk=Math.sin(time*.001*p.step+p.phase);
    const bob=Math.abs(Math.sin(time*.001*p.step*2+p.phase))*2.2;
    const armSwing=walk*6;
    const legSwing=walk*5;

    ctx.save();
    ctx.translate(p.x,p.ground-bob);
    ctx.scale(p.dir*p.scale,p.scale);

    ctx.globalAlpha=.14;
    ctx.fillStyle='#5a321e';
    ctx.beginPath();
    ctx.ellipse(0,3,14,4,0,0,Math.PI*2);
    ctx.fill();
    ctx.globalAlpha=1;

    ctx.lineCap='round';
    ctx.lineWidth=4;
    ctx.strokeStyle=p.trouser;
    ctx.beginPath();
    ctx.moveTo(-4,-20);
    ctx.lineTo(-5+legSwing*.45,-2);
    ctx.moveTo(4,-20);
    ctx.lineTo(5-legSwing*.45,-2);
    ctx.stroke();

    ctx.lineWidth=3;
    ctx.strokeStyle='#3d2d25';
    ctx.beginPath();
    ctx.moveTo(-7+legSwing*.45,-1);
    ctx.lineTo(-2+legSwing*.45,-1);
    ctx.moveTo(3-legSwing*.45,-1);
    ctx.lineTo(8-legSwing*.45,-1);
    ctx.stroke();

    ctx.fillStyle=p.shirt;
    pathRoundRect(ctx,-10,-49,20,30,6);
    ctx.fill();

    ctx.strokeStyle=p.skin;
    ctx.lineWidth=4;
    ctx.beginPath();
    ctx.moveTo(-9,-43);
    ctx.lineTo(-14,-28+armSwing*.45);
    ctx.moveTo(9,-43);
    ctx.lineTo(14,-28-armSwing*.45);
    ctx.stroke();

    if(p.bag){
      ctx.strokeStyle='#6b4931';
      ctx.lineWidth=2;
      ctx.beginPath();
      ctx.moveTo(8,-45);
      ctx.lineTo(13,-24);
      ctx.stroke();
      ctx.fillStyle='#8a5b32';
      pathRoundRect(ctx,8,-29,11,13,2);
      ctx.fill();
    }

    if(p.tool){
      ctx.strokeStyle='#49545c';
      ctx.lineWidth=2.5;
      ctx.beginPath();
      ctx.moveTo(-14,-30+armSwing*.45);
      ctx.lineTo(-19,-18+armSwing*.45);
      ctx.stroke();
      ctx.fillStyle='#596771';
      ctx.fillRect(-22,-19+armSwing*.45,7,3);
    }

    ctx.fillStyle=p.skin;
    ctx.beginPath();
    ctx.arc(0,-59,8,0,Math.PI*2);
    ctx.fill();

    ctx.fillStyle=p.hair;
    ctx.beginPath();
    ctx.arc(0,-61,8,Math.PI,Math.PI*2);
    ctx.lineTo(8,-59);
    ctx.lineTo(-8,-59);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function build(panel){
    const canvas=document.createElement('canvas');
    canvas.className='sev-auth-crowd-canvas';
    canvas.setAttribute('aria-hidden','true');
    panel.insertBefore(canvas,panel.firstChild);

    const ctx=canvas.getContext('2d');
    if(!ctx){canvas.remove();return null;}

    let people=[];
    let raf=0;
    let last=performance.now();
    let cssWidth=0;
    let cssHeight=0;

    function resize(){
      const rect=canvas.getBoundingClientRect();
      cssWidth=Math.max(1,Math.round(rect.width));
      cssHeight=Math.max(1,Math.round(rect.height));
      const dpr=Math.min(2,window.devicePixelRatio||1);
      canvas.width=Math.max(1,Math.round(cssWidth*dpr));
      canvas.height=Math.max(1,Math.round(cssHeight*dpr));
      ctx.setTransform(dpr,0,0,dpr,0,0);
      const count=coarse()?12:Math.max(16,Math.min(28,Math.round(cssWidth/42)));
      people=Array.from({length:count},(_,i)=>createWalker(cssWidth,cssHeight,i));
      people.sort((a,b)=>a.ground-b.ground);
      draw(performance.now(),0);
    }

    function draw(now,dt){
      ctx.clearRect(0,0,cssWidth,cssHeight);
      people.forEach(p=>{
        if(dt){
          p.x+=p.speed*p.dir*dt;
          const margin=38*p.scale;
          if(p.dir>0&&p.x>cssWidth+margin)p.x=-margin;
          if(p.dir<0&&p.x<-margin)p.x=cssWidth+margin;
        }
        drawPerson(ctx,p,now);
      });
    }

    function frame(now){
      if(!canvas.isConnected)return;
      const dt=Math.min(.04,Math.max(0,(now-last)/1000));
      last=now;
      draw(now,dt);
      raf=requestAnimationFrame(frame);
    }

    const ro=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;
    ro?.observe(canvas);
    resize();
    if(!reduced())raf=requestAnimationFrame(frame);

    return {
      panel,
      canvas,
      destroy(){
        if(raf)cancelAnimationFrame(raf);
        ro?.disconnect();
        canvas.remove();
      }
    };
  }

  function mount(){
    mountScheduled=false;
    const panel=document.querySelector('.auth-visual-panel');
    if(active&&(!active.panel.isConnected||active.panel!==panel)){
      active.destroy();
      active=null;
    }
    if(!panel||panel.querySelector('.sev-auth-crowd-canvas'))return;
    active=build(panel);
  }

  function scheduleMount(){
    if(mountScheduled)return;
    mountScheduled=true;
    requestAnimationFrame(mount);
  }

  const observer=new MutationObserver(scheduleMount);
  observer.observe(document.getElementById('app')||document.body,{childList:true,subtree:true});
  window.addEventListener('resize',scheduleMount,{passive:true});
  scheduleMount();
})();
