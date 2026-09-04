/* Admin-only worker deletion controls.
   Robustly decorates the Workers table even if another admin script rerenders it later. */
(function(){
  let latestRows=[];
  let decorateTimer=0;
  let refreshing=false;

  function byId(rows){
    const map=new Map();
    (rows||[]).forEach(row=>map.set(Number(row.id),row));
    return map;
  }

  function workerIdFromRow(tr){
    const text=String(tr?.children?.[0]?.textContent||'');
    const match=text.match(/#?(\d+)/);
    return match?Number(match[1]):0;
  }

  function workerNameFromRow(tr,id){
    const text=String(tr?.children?.[1]?.querySelector('b')?.textContent||'').trim();
    return text||`Worker #${id}`;
  }

  function makeButton(label,className,onClick){
    const button=document.createElement('button');
    button.type='button';
    button.className=className;
    button.textContent=label;
    button.addEventListener('click',onClick);
    return button;
  }

  function addDeletedNote(statusCell,worker){
    if(!statusCell||statusCell.querySelector('[data-profile-deleted-note]'))return;
    const box=document.createElement('div');
    box.dataset.profileDeletedNote='1';
    box.style.marginTop='6px';
    const badge=document.createElement('span');
    badge.className='pill bad';
    badge.textContent='PROFILE DELETED';
    box.appendChild(badge);
    if(worker?.profile_deleted_reason){
      const reason=document.createElement('div');
      reason.className='muted';
      reason.style.marginTop='4px';
      reason.style.maxWidth='220px';
      reason.textContent=String(worker.profile_deleted_reason);
      box.appendChild(reason);
    }
    statusCell.appendChild(box);
  }

  async function deleteWorkerProfile(worker){
    const id=Number(worker.id);
    const name=String(worker.full_name||`Worker #${id}`);
    const reason=prompt(`Reason for deleting ${name}'s professional profile:`,'Profile removed by cooperative admin');
    if(reason===null)return;
    const clean=reason.trim();
    if(clean.length<3)return alert('Please enter a reason of at least 3 characters.');
    const ok=confirm(`Delete ${name}'s WORKER PROFILE?\n\nTheir login account and previous booking/payment history will remain, but the professional profile will disappear from service listings and cannot be edited by the worker.`);
    if(!ok)return;
    try{
      await adminApi(`/workers/${id}/profile`,{method:'DELETE',body:JSON.stringify({reason:clean})});
      alert('Worker profile deleted. Account and historical records were preserved.');
      latestRows=[];
      await openSection('workers');
    }catch(err){alert(err.message)}
  }

  async function eraseWorkerPermanently(worker){
    const id=Number(worker.id);
    const name=String(worker.full_name||`Worker #${id}`);
    const reason=prompt(`Reason for permanently erasing ${name}:`,'Permanent removal by cooperative admin');
    if(reason===null)return;
    const clean=reason.trim();
    if(clean.length<3)return alert('Please enter a reason of at least 3 characters.');
    const first=confirm(`PERMANENT ERASE WARNING\n\nThis will delete ${name}'s Worker account and worker-linked database records, including bookings, chats, reviews and payment records connected through those bookings.\n\nThis cannot be undone. Continue?`);
    if(!first)return;
    const required=`DELETE WORKER ${id}`;
    const typed=prompt(`Final confirmation. Type exactly:\n${required}`,'');
    if(typed===null)return;
    if(typed.trim()!==required)return alert('Confirmation text did not match. Nothing was deleted.');
    try{
      await adminApi(`/workers/${id}`,{method:'DELETE',body:JSON.stringify({reason:clean,confirmText:required})});
      alert('Worker account and linked database records were permanently erased.');
      latestRows=[];
      await openSection('workers');
    }catch(err){alert(err.message)}
  }

  function decorate(rows){
    if(typeof currentSection!=='undefined'&&currentSection!=='workers')return;
    const table=document.querySelector('#adminContent table');
    if(!table)return;
    const map=byId(rows);
    table.querySelectorAll('tbody > tr').forEach(tr=>{
      const id=workerIdFromRow(tr);
      if(!id)return;
      const actionCell=tr.children[tr.children.length-1];
      const actions=actionCell?.querySelector('.actions')||actionCell;
      if(!actions||actions.querySelector('[data-worker-delete-controls]'))return;
      const worker=map.get(id)||{id,full_name:workerNameFromRow(tr,id)};
      const deleted=Boolean(worker.profile_deleted_at);
      if(deleted){
        addDeletedNote(tr.children[4],worker);
        actions.querySelectorAll('button').forEach(btn=>{
          btn.disabled=true;
          btn.title='Verification cannot be changed after the professional profile is deleted.';
        });
      }
      const holder=document.createElement('span');
      holder.dataset.workerDeleteControls='1';
      holder.style.display='contents';
      if(!deleted)holder.appendChild(makeButton('Delete Profile','btn secondary small',()=>deleteWorkerProfile(worker)));
      holder.appendChild(makeButton('Erase Worker','btn danger small',()=>eraseWorkerPermanently(worker)));
      actions.appendChild(holder);
    });
  }

  async function ensureDecorated(){
    if(typeof currentSection!=='undefined'&&currentSection!=='workers')return;
    const table=document.querySelector('#adminContent table');
    if(!table)return;
    if(latestRows.length){decorate(latestRows);return}
    if(refreshing||typeof adminApi!=='function')return;
    refreshing=true;
    try{
      const response=await adminApi('/workers');
      latestRows=Array.isArray(response?.data)?response.data:[];
      decorate(latestRows);
    }catch(e){}finally{refreshing=false}
  }

  function scheduleDecorate(){
    clearTimeout(decorateTimer);
    decorateTimer=setTimeout(ensureDecorated,0);
  }

  const baseRenderWorkers=window.renderWorkers;
  if(typeof baseRenderWorkers==='function'){
    window.renderWorkers=function(rows){
      latestRows=Array.isArray(rows)?rows:[];
      const result=baseRenderWorkers(latestRows);
      scheduleDecorate();
      return result;
    };
  }

  const root=document.getElementById('adminApp')||document.body;
  const observer=new MutationObserver(()=>scheduleDecorate());
  observer.observe(root,{childList:true,subtree:true});
  window.addEventListener('focus',scheduleDecorate);
  setTimeout(scheduleDecorate,50);
})();
