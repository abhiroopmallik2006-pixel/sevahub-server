/* SevaHub dashboard compatibility layer.
   Keeps the live MacBook view intact while restoring a full-size interactive mirror below it,
   and trims deprecated photo background choices from the selector. */
(function(){
  const PHOTO_TYPES=new Set(['ivory','peach','silver','neon']);
  const BG_KEY='sevahub_dashboard_background';
  const mirrors={USER:null,WORKER:null};
  const observers={USER:null,WORKER:null};
  let scanRaf=0;

  function trimBackgroundOptions(){
    let saved='';
    try{saved=localStorage.getItem(BG_KEY)||''}catch(e){}

    const controls=document.querySelector('.sev-dashboard-bg-controls');
    if(!controls)return;

    if(PHOTO_TYPES.has(saved)){
      const grid=controls.querySelector('[data-sev-bg-option="grid"]');
      if(grid){
        grid.click();
      }else{
        try{localStorage.setItem(BG_KEY,'grid')}catch(e){}
      }
    }

    controls.querySelectorAll('[data-sev-bg-option]').forEach(btn=>{
      if(PHOTO_TYPES.has(btn.dataset.sevBgOption))btn.remove();
    });
  }

  function stripMacClasses(root){
    const all=[root,...root.querySelectorAll('*')];
    all.forEach(el=>{
      el.classList?.remove('sevahub-macbook-services-panel','sevahub-macbook-overview-grid');
    });
  }

  function mapMirrorTree(originalRoot,cloneRoot,targets,role){
    const originals=[originalRoot,...originalRoot.querySelectorAll('*')];
    const clones=[cloneRoot,...cloneRoot.querySelectorAll('*')];
    const total=Math.min(originals.length,clones.length);
    const idMap=new Map();

    for(let i=0;i<total;i++){
      const original=originals[i];
      const clone=clones[i];
      const index=targets.length;
      targets.push(original);
      clone.dataset.sevahubMirrorIndex=String(index);

      if(clone.id){
        const oldId=clone.id;
        const newId=`sevahub-mirror-${role.toLowerCase()}-${index}`;
        idMap.set(oldId,newId);
        clone.id=newId;
      }

      Array.from(clone.attributes||[]).forEach(attr=>{
        if(/^on/i.test(attr.name))clone.removeAttribute(attr.name);
      });

      if(original instanceof HTMLInputElement&&clone instanceof HTMLInputElement){
        clone.value=original.value;
        clone.checked=original.checked;
      }else if(original instanceof HTMLTextAreaElement&&clone instanceof HTMLTextAreaElement){
        clone.value=original.value;
      }else if(original instanceof HTMLSelectElement&&clone instanceof HTMLSelectElement){
        clone.selectedIndex=original.selectedIndex;
      }
    }

    clones.forEach(clone=>{
      ['for','form','aria-controls','aria-describedby','aria-labelledby','list'].forEach(attr=>{
        const value=clone.getAttribute?.(attr);
        if(!value)return;
        const mapped=value.split(/\s+/).map(id=>idMap.get(id)||id).join(' ');
        clone.setAttribute(attr,mapped);
      });
    });
  }

  function mirrorTarget(wrapper,event){
    const el=event.target?.closest?.('[data-sevahub-mirror-index]');
    if(!el||!wrapper.contains(el))return null;
    const index=Number(el.dataset.sevahubMirrorIndex);
    return Number.isInteger(index)?wrapper.__sevahubMirrorTargets?.[index]||null:null;
  }

  function wireMirror(wrapper){
    wrapper.addEventListener('click',event=>{
      const original=mirrorTarget(wrapper,event);
      if(!original||!original.isConnected)return;
      event.preventDefault();
      event.stopPropagation();
      try{original.click()}catch(e){
        original.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));
      }
    },true);

    wrapper.addEventListener('input',event=>{
      const original=mirrorTarget(wrapper,event);
      if(!original||!original.isConnected)return;
      event.stopPropagation();
      const source=event.target;
      if('value' in source&&'value' in original)original.value=source.value;
      if('checked' in source&&'checked' in original)original.checked=source.checked;
      original.dispatchEvent(new Event('input',{bubbles:true}));
    },true);

    wrapper.addEventListener('change',event=>{
      const original=mirrorTarget(wrapper,event);
      if(!original||!original.isConnected)return;
      event.stopPropagation();
      const source=event.target;
      if('value' in source&&'value' in original)original.value=source.value;
      if('checked' in source&&'checked' in original)original.checked=source.checked;
      if(source instanceof HTMLSelectElement&&original instanceof HTMLSelectElement)original.selectedIndex=source.selectedIndex;
      original.dispatchEvent(new Event('change',{bubbles:true}));
    },true);

    wrapper.addEventListener('submit',event=>{
      event.preventDefault();
      event.stopPropagation();
      const original=mirrorTarget(wrapper,event);
      if(original instanceof HTMLFormElement&&original.isConnected){
        if(typeof original.requestSubmit==='function')original.requestSubmit();
        else original.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
      }
    },true);
  }

  function renderMirror(box,role){
    const live=box?.querySelector(':scope > [data-sevahub-macbook3d] .sevahub-macbook-live-content');
    const current=mirrors[role];
    if(!box||!box.isConnected||!live){
      current?.remove();
      mirrors[role]=null;
      return;
    }

    const wrapper=document.createElement('div');
    wrapper.className='sevahub-macbook-below-content';
    wrapper.dataset.sevahubMacbookBelow=role;
    const targets=[];

    Array.from(live.children).forEach(originalRoot=>{
      const cloneRoot=originalRoot.cloneNode(true);
      stripMacClasses(cloneRoot);
      mapMirrorTree(originalRoot,cloneRoot,targets,role);
      wrapper.appendChild(cloneRoot);
    });

    wrapper.__sevahubMirrorTargets=targets;
    wireMirror(wrapper);

    current?.remove();
    box.insertAdjacentElement('afterend',wrapper);
    mirrors[role]=wrapper;
  }

  function observeBox(box,role){
    const existing=observers[role];
    if(existing?.box===box)return;
    existing?.observer?.disconnect();
    observers[role]=null;
    if(!box)return renderMirror(null,role);

    let pending=false;
    const refresh=()=>{
      if(pending)return;
      pending=true;
      requestAnimationFrame(()=>{pending=false;renderMirror(box,role)});
    };
    const observer=new MutationObserver(mutations=>{
      if(mutations.some(m=>{
        const target=m.target?.nodeType===1?m.target:m.target?.parentElement;
        return Boolean(target?.closest?.('[data-sevahub-macbook3d]'));
      }))refresh();
    });
    observer.observe(box,{subtree:true,childList:true,characterData:true,attributes:true});
    observers[role]={box,observer};
    refresh();
  }

  function scan(){
    trimBackgroundOptions();
    observeBox(document.getElementById('userContent'),'USER');
    observeBox(document.getElementById('workerContent'),'WORKER');
  }

  function scheduleScan(){
    if(scanRaf)return;
    scanRaf=requestAnimationFrame(()=>{scanRaf=0;scan()});
  }

  const app=document.getElementById('app')||document.body;
  const appObserver=new MutationObserver(scheduleScan);
  appObserver.observe(app,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',scheduleScan,{once:true});
  scheduleScan();
})();
