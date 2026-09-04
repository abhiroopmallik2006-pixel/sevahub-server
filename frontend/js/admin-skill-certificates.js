/* Cooperative Admin: worker skill certificate review. */
(function(){
  const baseRenderShell=globalThis.renderShell;
  const baseOpenSection=globalThis.openSection;
  if(typeof baseRenderShell!=='function'||typeof baseOpenSection!=='function'||baseOpenSection.__sevahubSkillCertificates)return;

  function safe(v=''){try{return typeof esc==='function'?esc(v):String(v)}catch(e){return String(v)}}
  function bytes(n){const v=Number(n||0);if(v<1024)return `${v} B`;if(v<1024*1024)return `${(v/1024).toFixed(1)} KB`;return `${(v/1024/1024).toFixed(2)} MB`}
  function date(v){if(!v)return '—';try{return new Date(v).toLocaleString()}catch(e){return String(v)}}

  function ensureTab(){
    const tabs=document.getElementById('adminTabs');if(!tabs||tabs.querySelector('[data-section="skill-certificates"]'))return;
    const btn=document.createElement('button');btn.className='tab';btn.dataset.section='skill-certificates';btn.textContent='Skill Certificates';btn.onclick=()=>openSection('skill-certificates');
    const workers=tabs.querySelector('[data-section="workers"]');if(workers)workers.after(btn);else tabs.appendChild(btn);
  }

  function certStatus(cert){return typeof pill==='function'?pill(cert.status):`<span>${safe(cert.status)}</span>`}

  function render(rows){
    const list=Array.isArray(rows)?rows:[];
    const pending=list.filter(x=>String(x.status).toUpperCase()==='PENDING').length;
    const html=list.length?list.map(c=>{
      const id=Number(c.id),status=String(c.status||'PENDING').toUpperCase();
      const flags=[c.workerVerificationStatus?`Worker: ${safe(c.workerVerificationStatus)}`:'',c.isBanned?'RESTRICTED':'',c.profileDeletedAt?'PROFILE DELETED':''].filter(Boolean).join(' · ');
      return `<tr>
        <td>#${id}</td>
        <td><b>${safe(c.workerName||'Worker')}</b><br><span class="muted">${safe(c.workerEmail||'')}</span>${flags?`<br><span class="muted">${flags}</span>`:''}</td>
        <td><b>${safe(c.serviceName||'—')}</b><br><span class="muted">${safe(c.title||'—')}${c.issuer?` · ${safe(c.issuer)}`:''}</span></td>
        <td>${safe(c.fileName||'certificate')}<br><span class="muted">${bytes(c.fileSize)} · ${safe(c.mimeType||'')}</span></td>
        <td>${certStatus(c)}${c.reviewReason?`<br><span class="muted admin-cert-reason">${safe(c.reviewReason)}</span>`:''}</td>
        <td><span class="muted">Uploaded ${safe(date(c.uploadedAt))}</span>${c.reviewedAt?`<br><span class="muted">Reviewed ${safe(date(c.reviewedAt))}</span>`:''}</td>
        <td><div class="actions">
          <button class="btn secondary small" type="button" onclick="viewAdminSkillCertificate(${id})">View</button>
          <button class="btn small" type="button" onclick="setAdminSkillCertificateStatus(${id},'VERIFIED')" ${status==='VERIFIED'?'disabled':''}>Verify</button>
          <button class="btn danger small" type="button" onclick="setAdminSkillCertificateStatus(${id},'REJECTED')">Reject</button>
          <button class="btn secondary small" type="button" onclick="setAdminSkillCertificateStatus(${id},'PENDING')" ${status==='PENDING'?'disabled':''}>Pending</button>
        </div></td>
      </tr>`;
    }).join(''):'<tr><td colspan="7"><div class="empty">No worker certificates submitted yet.</div></td></tr>';
    const box=document.getElementById('adminContent');if(!box)return;
    box.innerHTML=`<div class="panel admin-skill-cert-panel"><div class="toolbar"><div><h2>Skill Certificate Verification</h2><p class="muted">Review professional proof before showing the Skill Verified badge to customers.</p></div><div><span class="pill warn">${pending} pending</span> <button class="btn secondary small" onclick="openSection('skill-certificates')">↻ Refresh</button></div></div><div class="table-wrap"><table><thead><tr><th>ID</th><th>Worker</th><th>Service / Certificate</th><th>File</th><th>Status</th><th>Timeline</th><th>Admin action</th></tr></thead><tbody>${html}</tbody></table></div></div>`;
  }

  async function openCertificate(id){
    let popup=null;try{popup=window.open('about:blank','_blank')}catch(e){}
    try{
      const r=await fetch(`/api/admin/skill-certificates/${Number(id)}/file`,{headers:{Authorization:'Bearer '+adminToken}});
      if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.message||'Could not open certificate')}
      const blob=await r.blob(),url=URL.createObjectURL(blob);
      if(popup)popup.location.href=url;else{const a=document.createElement('a');a.href=url;a.target='_blank';a.click()}
      setTimeout(()=>URL.revokeObjectURL(url),60000);
    }catch(err){try{popup?.close()}catch(e){};alert(err.message)}
  }

  async function setStatus(id,status){
    const s=String(status).toUpperCase();let reason='';
    if(s==='REJECTED'){
      const entered=prompt('Reason for rejecting this skill certificate:','Certificate details could not be verified');
      if(entered===null)return;reason=entered.trim();
      if(reason.length<3)return alert('Please enter a rejection reason of at least 3 characters.');
    }else if(s==='VERIFIED'&&!confirm('Verify this skill certificate and show the Skill Verified badge to customers?'))return;
    else if(s==='PENDING'&&!confirm('Reset this certificate to Pending review?'))return;
    try{
      await adminApi(`/skill-certificates/${Number(id)}/status`,{method:'PUT',body:JSON.stringify({status:s,reason})});
      await openSection('skill-certificates');
    }catch(err){alert(err.message)}
  }

  const renderShell=function(...args){const result=baseRenderShell.apply(this,args);ensureTab();return result};
  const openSection=async function(section){
    if(section!=='skill-certificates')return baseOpenSection.apply(this,arguments);
    currentSection=section;ensureTab();setActive(section);
    const box=document.getElementById('adminContent');if(!box)return;
    box.innerHTML='<div class="panel"><div class="empty">Loading certificates…</div></div>';
    try{render((await adminApi('/skill-certificates')).data||[])}catch(err){
      if(/admin session|authentication|required|expired/i.test(err.message)){adminLogout();return}
      box.innerHTML=`<div class="panel"><div class="error">${safe(err.message)}</div></div>`;
    }
  };
  openSection.__sevahubSkillCertificates=true;

  globalThis.renderShell=renderShell;
  globalThis.openSection=openSection;
  globalThis.viewAdminSkillCertificate=openCertificate;
  globalThis.setAdminSkillCertificateStatus=setStatus;
  ensureTab();
})();
