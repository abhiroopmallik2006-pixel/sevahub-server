/* Cooperative Admin Welfare & Insurance.
   Lightweight: no polling; data loads only when this tab is opened or an action is taken. */
(function(){
  const SECTION='welfare';
  let cachedWorkers=[];

  function safe(v=''){
    try{return typeof esc==='function'?esc(v):String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}catch(e){return String(v)}
  }
  function formatDate(value){
    const s=String(value||'').slice(0,10);
    const m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m?`${m[3]}/${m[2]}/${m[1]}`:(s||'—');
  }
  function statusPill(status){
    const s=String(status||'NOT_ENROLLED').toUpperCase();
    const cls=['ACTIVE','VERIFIED'].includes(s)?'ok':['REJECTED','EXPIRED'].includes(s)?'bad':s==='PENDING'?'warn':'neutral';
    return `<span class="pill ${cls}">${safe(s.replace(/_/g,' '))}</span>`;
  }
  function coverageLabel(value){
    return ({ACCIDENT:'Accident Cover',HEALTH:'Health Cover',HOSPITALIZATION:'Hospitalization',DISABILITY:'Disability Cover',LIFE:'Life Cover',OTHER:'Other'})[String(value||'').toUpperCase()]||String(value||'—');
  }
  function money(value){return `₹${Number(value||0).toLocaleString('en-IN')}`}

  function ensureTab(){
    const tabs=document.getElementById('adminTabs');
    if(!tabs||tabs.querySelector(`[data-section="${SECTION}"]`))return;
    const button=document.createElement('button');
    button.type='button';
    button.className='tab';
    button.dataset.section=SECTION;
    button.textContent='🛡️ Welfare & Insurance';
    button.addEventListener('click',openAdminWelfare);
    const workers=tabs.querySelector('[data-section="workers"]');
    if(workers)workers.after(button);else tabs.appendChild(button);
  }

  async function openAdminWelfare(){
    try{currentSection=SECTION}catch(e){}
    document.querySelectorAll('.tab').forEach(btn=>btn.classList.toggle('active',btn.dataset.section===SECTION));
    const box=document.getElementById('adminContent');
    if(!box)return;
    box.innerHTML='<div class="panel"><div class="empty">Loading welfare & insurance records…</div></div>';
    try{
      const result=await adminApi('/welfare');
      renderAdminWelfare(result.data||{});
    }catch(err){
      if(/admin session|authentication|required|expired/i.test(String(err.message||''))){if(typeof adminLogout==='function')adminLogout();return}
      box.innerHTML=`<div class="panel"><div class="error">${safe(err.message||'Could not load welfare records')}</div></div>`;
    }
  }

  function actionButtons(row,type){
    const workerId=Number(row.workerId);
    const record=type==='welfare'?(row.welfare||{}):(row.insurance||{});
    const s=String(record.status||'NOT_ENROLLED').toUpperCase();
    const view=`<button class="btn secondary small" type="button" onclick="viewAdminWorkerProfile(${workerId})">View Profile</button>`;
    if(type==='welfare'&&s==='PENDING')return `<div class="actions">${view}<button class="btn small" onclick="reviewAdminWelfare(${workerId},'ACTIVE')">Approve</button><button class="btn danger small" onclick="reviewAdminWelfare(${workerId},'REJECTED')">Reject</button></div>`;
    if(type==='insurance'&&s==='PENDING')return `<div class="actions">${view}<button class="btn small" onclick="reviewAdminInsurance(${workerId},'VERIFIED')">Mark reviewed</button><button class="btn danger small" onclick="reviewAdminInsurance(${workerId},'REJECTED')">Reject</button></div>`;
    return `<div class="actions">${view}</div>`;
  }

  function renderAdminWelfare(data){
    const box=document.getElementById('adminContent');
    if(!box)return;
    const summary=data.summary||{};
    const workers=Array.isArray(data.workers)?data.workers:[];
    cachedWorkers=workers;

    const welfareRows=workers.map(row=>{
      const w=row.welfare||{};
      const s=String(w.status||'NOT_ENROLLED').toUpperCase();
      return `<tr><td>#${Number(row.workerId)}</td><td><b>${safe(row.fullName)}</b><br><span class="muted">${safe(row.email||'')}</span></td><td>${safe(row.services||'Not set')}</td><td>${statusPill(s)}</td><td>${w.memberId?safe(w.memberId):'—'}</td><td>${w.requestedAt?formatDate(w.requestedAt):'—'}</td><td>${w.reviewNote?safe(w.reviewNote):'—'}</td><td>${actionButtons(row,'welfare')}</td></tr>`;
    }).join('')||'<tr><td colspan="8"><div class="empty">No workers found.</div></td></tr>';

    const insuranceRows=workers.map(row=>{
      const i=row.insurance||{};
      const s=String(i.status||'NOT_ENROLLED').toUpperCase();
      return `<tr><td>#${Number(row.workerId)}</td><td><b>${safe(row.fullName)}</b></td><td>${safe(i.providerName||'—')}</td><td>${safe(i.policyNumber||'—')}</td><td>${safe(coverageLabel(i.coverageType))}</td><td>${i.validUntil?formatDate(i.validUntil):'—'}</td><td>${statusPill(s)}</td><td>${i.reviewNote?safe(i.reviewNote):'—'}</td><td>${actionButtons(row,'insurance')}</td></tr>`;
    }).join('')||'<tr><td colspan="9"><div class="empty">No workers found.</div></td></tr>';

    box.innerHTML=`
      <section class="panel admin-welfare-hero">
        <div><span class="admin-welfare-kicker">WORKER PROTECTION RECORDS</span><h2>🛡️ Welfare & Insurance</h2><p class="muted">Manage SevaHub cooperative welfare enrollment and review insurance records submitted by workers.</p></div>
        <button class="btn secondary small" type="button" onclick="openAdminWelfare()">↻ Refresh</button>
      </section>
      <div class="stats admin-welfare-stats">
        <div class="stat"><span>Total workers</span><b>${Number(summary.totalWorkers||0)}</b></div>
        <div class="stat"><span>Welfare active</span><b>${Number(summary.welfareActive||0)}</b></div>
        <div class="stat"><span>Welfare pending</span><b>${Number(summary.welfarePending||0)}</b></div>
        <div class="stat"><span>Insurance reviewed</span><b>${Number(summary.insuranceVerified||0)}</b></div>
        <div class="stat"><span>Insurance pending</span><b>${Number(summary.insurancePending||0)}</b></div>
        <div class="stat"><span>Insurance expired</span><b>${Number(summary.insuranceExpired||0)}</b></div>
      </div>
      <section class="panel">
        <div class="toolbar"><div><span class="admin-welfare-kicker">COOPERATIVE WELFARE</span><h2>Enrollment requests</h2></div></div>
        <div class="table-wrap"><table><thead><tr><th>Worker</th><th>Account</th><th>Services</th><th>Status</th><th>Member ID</th><th>Requested</th><th>Review note</th><th>Action</th></tr></thead><tbody>${welfareRows}</tbody></table></div>
      </section>
      <section class="panel admin-welfare-section-gap">
        <div class="toolbar"><div><span class="admin-welfare-kicker">INSURANCE RECORDS</span><h2>Worker-submitted policies</h2></div></div>
        <div class="admin-welfare-disclaimer">Cooperative review only: SevaHub does not issue insurance and this screen does not claim direct insurer/API validation.</div>
        <div class="table-wrap"><table><thead><tr><th>Worker</th><th>Name</th><th>Provider</th><th>Policy</th><th>Coverage</th><th>Valid until</th><th>Status</th><th>Review note</th><th>Action</th></tr></thead><tbody>${insuranceRows}</tbody></table></div>
      </section>`;
  }

  function viewAdminWorkerProfile(workerId){
    const row=cachedWorkers.find(x=>Number(x.workerId)===Number(workerId));
    if(!row)return alert('Worker profile is not available. Refresh the Welfare tab.');
    closeAdminWorkerProfile();
    const p=row.profile||{},w=row.welfare||{},i=row.insurance||{};
    const modal=document.createElement('div');
    modal.id='adminWorkerProfileModal';
    modal.className='admin-modal';
    modal.innerHTML=`<div class="admin-chat-card admin-worker-profile-card">
      <div class="admin-chat-head"><div><span class="admin-welfare-kicker">WORKER PROFILE</span><h2>${safe(row.fullName||'Worker')} · #${Number(row.workerId)}</h2><p class="muted">${safe(row.email||'')}${row.phone?` · ${safe(row.phone)}`:''}</p></div><button class="btn secondary small" type="button" onclick="closeAdminWorkerProfile()">Close</button></div>
      <div class="admin-worker-profile-grid">
        <div><span>Verification</span><b>${statusPill(p.verificationStatus)}</b></div>
        <div><span>Primary service</span><b>${safe(p.primaryService||row.services||'Not set')}</b></div>
        <div><span>Starting price</span><b>${money(p.startingPrice)}</b></div>
        <div><span>Experience</span><b>${Number(p.experienceYears||0)} years</b></div>
        <div><span>Working area</span><b>${safe(p.serviceArea||'—')}</b></div>
        <div><span>Service radius</span><b>${Number(p.serviceRadius||0)} km</b></div>
        <div><span>Working hours</span><b>${safe(p.workingHours||'—')}</b></div>
        <div><span>Rating</span><b>${Number(p.rating||0).toFixed(1)} / 5 · ${Number(p.totalReviews||0)} reviews</b></div>
      </div>
      ${p.bio?`<div class="admin-worker-profile-text"><span>Bio</span><p>${safe(p.bio)}</p></div>`:''}
      ${p.introduction?`<div class="admin-worker-profile-text"><span>Introduction</span><p>${safe(p.introduction)}</p></div>`:''}
      <div class="admin-worker-profile-split">
        <section><h3>🛡️ Welfare</h3><p>Status: ${statusPill(w.status)}</p><p><b>Member ID:</b> ${safe(w.memberId||'—')}</p><p><b>Requested:</b> ${w.requestedAt?formatDate(w.requestedAt):'—'}</p>${w.reviewNote?`<p><b>Review note:</b> ${safe(w.reviewNote)}</p>`:''}</section>
        <section><h3>Insurance record</h3><p>Status: ${statusPill(i.status)}</p><p><b>Provider:</b> ${safe(i.providerName||'—')}</p><p><b>Policy:</b> ${safe(i.policyNumber||'—')}</p><p><b>Coverage:</b> ${safe(coverageLabel(i.coverageType))}</p><p><b>Valid until:</b> ${i.validUntil?formatDate(i.validUntil):'—'}</p>${i.reviewNote?`<p><b>Review note:</b> ${safe(i.reviewNote)}</p>`:''}</section>
      </div>
    </div>`;
    modal.addEventListener('click',event=>{if(event.target===modal)closeAdminWorkerProfile()});
    document.body.appendChild(modal);
  }

  function closeAdminWorkerProfile(){document.getElementById('adminWorkerProfileModal')?.remove()}

  async function reviewAdminWelfare(workerId,status){
    const note=status==='REJECTED'?(prompt('Optional rejection note for the worker:')||''):'';
    try{
      await adminApi(`/welfare/workers/${workerId}/welfare`,{method:'PUT',body:JSON.stringify({status,note})});
      await openAdminWelfare();
    }catch(err){alert(err.message)}
  }

  async function reviewAdminInsurance(workerId,status){
    const note=status==='REJECTED'?(prompt('Optional rejection note for the worker:')||''):'';
    try{
      await adminApi(`/welfare/workers/${workerId}/insurance`,{method:'PUT',body:JSON.stringify({status,note})});
      await openAdminWelfare();
    }catch(err){alert(err.message)}
  }

  globalThis.openAdminWelfare=openAdminWelfare;
  globalThis.reviewAdminWelfare=reviewAdminWelfare;
  globalThis.reviewAdminInsurance=reviewAdminInsurance;
  globalThis.viewAdminWorkerProfile=viewAdminWorkerProfile;
  globalThis.closeAdminWorkerProfile=closeAdminWorkerProfile;

  const root=document.getElementById('adminApp');
  if(root){
    const observer=new MutationObserver(ensureTab);
    observer.observe(root,{childList:true});
  }
  ensureTab();
})();
