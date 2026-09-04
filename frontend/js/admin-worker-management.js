/* Admin-only worker deletion controls.
   Adds profile removal and permanent database erase actions to the existing Workers table. */
(function(){
  const baseRenderWorkers=window.renderWorkers;
  if(typeof baseRenderWorkers!=='function')return;

  function makeButton(label,className,onClick){
    const button=document.createElement('button');
    button.type='button';
    button.className=className;
    button.textContent=label;
    button.addEventListener('click',onClick);
    return button;
  }

  function deletedNote(worker){
    const box=document.createElement('div');
    box.style.marginTop='6px';
    const badge=document.createElement('span');
    badge.className='pill bad';
    badge.textContent='PROFILE DELETED';
    box.appendChild(badge);
    if(worker.profile_deleted_reason){
      const reason=document.createElement('div');
      reason.className='muted';
      reason.style.marginTop='4px';
      reason.style.maxWidth='220px';
      reason.textContent=String(worker.profile_deleted_reason);
      box.appendChild(reason);
    }
    return box;
  }

  function decorateWorkers(rows){
    const table=document.querySelector('#adminContent table');
    const body=table?.querySelector('tbody');
    if(!body)return;
    const trList=Array.from(body.querySelectorAll(':scope > tr'));

    rows.forEach((worker,index)=>{
      const tr=trList[index];
      if(!tr)return;
      const cells=tr.children;
      const statusCell=cells[4];
      const actionCell=cells[cells.length-1];
      const actions=actionCell?.querySelector('.actions')||actionCell;
      if(!actions)return;

      const deleted=Boolean(worker.profile_deleted_at);
      if(deleted&&statusCell){
        statusCell.appendChild(deletedNote(worker));
        actions.querySelectorAll('button').forEach(btn=>{
          btn.disabled=true;
          btn.title='Verification cannot be changed after the professional profile is deleted.';
        });
      }

      if(!deleted){
        actions.appendChild(makeButton('Delete Profile','btn secondary small',()=>deleteWorkerProfile(worker)));
      }
      actions.appendChild(makeButton('Erase Worker','btn danger small',()=>eraseWorkerPermanently(worker)));
    });
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
      await adminApi(`/workers/${id}/profile`,{
        method:'DELETE',
        body:JSON.stringify({reason:clean})
      });
      alert('Worker profile deleted. Account and historical records were preserved.');
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
      await adminApi(`/workers/${id}`,{
        method:'DELETE',
        body:JSON.stringify({reason:clean,confirmText:required})
      });
      alert('Worker account and linked database records were permanently erased.');
      await openSection('workers');
    }catch(err){alert(err.message)}
  }

  window.renderWorkers=function(rows){
    const safeRows=Array.isArray(rows)?rows:[];
    baseRenderWorkers(safeRows);
    decorateWorkers(safeRows);
  };
})();
