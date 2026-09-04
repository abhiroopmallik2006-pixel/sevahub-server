/* Worker skill certificate upload + cooperative verification status. */
(function(){
  const originalProfile=globalThis.workerProfile;
  if(typeof originalProfile!=='function'||originalProfile.__sevahubSkillCertificateWrapped)return;
  let busy=false;

  function safe(v=''){
    try{return typeof esc==='function'?esc(v):String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}catch(e){return String(v)}
  }
  function token(){try{return sessionStorage.getItem('sevahub_token')||localStorage.getItem('sevahub_token')||''}catch(e){return ''}}
  function isWorker(){try{return String(state?.role||'').toUpperCase()==='WORKER'}catch(e){return false}}
  function humanBytes(n){const v=Number(n||0);if(v<1024)return `${v} B`;if(v<1024*1024)return `${(v/1024).toFixed(1)} KB`;return `${(v/1024/1024).toFixed(2)} MB`}
  function when(v){if(!v)return '—';try{return new Date(v).toLocaleString()}catch(e){return String(v)}}
  function statusClass(status){const s=String(status||'').toUpperCase();return s==='VERIFIED'?'ok':s==='REJECTED'?'bad':'warn'}
  function statusCopy(status){const s=String(status||'').toUpperCase();return s==='VERIFIED'?'🛡 SKILL VERIFIED':s==='REJECTED'?'✕ REJECTED':'⏳ PENDING REVIEW'}
  function setSubmitStatus(message,type='info'){
    const el=document.getElementById('skillCertSubmitStatus');
    if(!el)return;
    el.className=`skill-cert-submit-status ${type}`;
    el.textContent=String(message||'');
  }

  async function getCertificate(){
    if(typeof api==='function')return (await api('/skill-certificates/me')).data||null;
    const r=await fetch('/api/skill-certificates/me',{headers:{Authorization:'Bearer '+token()},cache:'no-store'});
    const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.message||'Could not load certificate');return data.data||null;
  }

  function render(cert){
    const box=document.getElementById('workerContent');
    if(!box||!box.querySelector('[data-worker-profile-live]'))return;
    document.getElementById('workerSkillCertificatePanel')?.remove();
    const existing=Boolean(cert);
    const status=String(cert?.status||'').toUpperCase();
    const warning=status==='VERIFIED'?'<div class="skill-cert-note">Replacing this verified file will reset the skill certificate to <b>PENDING</b> until the cooperative verifies the new document.</div>':'';
    const rejected=status==='REJECTED'&&cert?.reviewReason?`<div class="skill-cert-reason"><b>Admin reason</b><span>${safe(cert.reviewReason)}</span></div>`:'';
    const details=existing?`<div class="skill-cert-details">
      <div><span>Certificate</span><b>${safe(cert.title||'—')}</b></div>
      <div><span>Issuer</span><b>${safe(cert.issuer||'Not provided')}</b></div>
      <div><span>Service</span><b>${safe(cert.serviceName||'Current service')}</b></div>
      <div><span>File</span><b>${safe(cert.fileName||'certificate')} · ${humanBytes(cert.fileSize)}</b></div>
      <div><span>Uploaded</span><b>${safe(when(cert.uploadedAt))}</b></div>
      <div><span>Reviewed</span><b>${safe(when(cert.reviewedAt))}</b></div>
    </div>`:'<div class="empty skill-cert-empty">No skill certificate uploaded yet.</div>';

    box.insertAdjacentHTML('beforeend',`<section id="workerSkillCertificatePanel" class="card panel skill-certificate-panel">
      <div class="skill-cert-head"><div><h2>🛡 Skill Certificate Verification</h2><p class="muted">Upload proof of your professional skill. The cooperative reviews the document before customers see a Skill Verified badge.</p></div>${existing?`<span class="worker-profile-status ${statusClass(status)}">${safe(statusCopy(status))}</span>`:'<span class="worker-profile-status warn">NOT SUBMITTED</span>'}</div>
      ${details}${rejected}${warning}
      ${existing?'<div class="actions skill-cert-actions"><button class="btn secondary small" type="button" onclick="viewMySkillCertificate()">View certificate</button></div>':''}
      <form id="skillCertificateForm" class="skill-cert-form" onsubmit="submitSkillCertificate(event)">
        <div class="skill-cert-form-grid">
          <label>Certificate title<input id="skillCertTitle" maxlength="160" value="${safe(cert?.title||'')}" placeholder="e.g. Electrician Training Certificate" required></label>
          <label>Issuer / institute<input id="skillCertIssuer" maxlength="160" value="${safe(cert?.issuer||'')}" placeholder="e.g. ITI Delhi"></label>
          <label class="wide">Certificate file<input id="skillCertFile" type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" ${existing?'':'required'}><small>PDF, JPG or PNG · maximum 3 MB</small></label>
        </div>
        <div id="skillCertSubmitStatus" class="skill-cert-submit-status" aria-live="polite"></div>
        <button class="btn" type="submit">${existing?'Replace / Resubmit Certificate':'Submit Certificate for Verification'}</button>
      </form>
    </section>`);
  }

  async function refresh(){
    if(!isWorker()||busy)return;
    const box=document.getElementById('workerContent');
    if(!box?.querySelector('[data-worker-profile-live]'))return;
    try{render(await getCertificate())}catch(err){
      document.getElementById('workerSkillCertificatePanel')?.remove();
      box.insertAdjacentHTML('beforeend',`<section id="workerSkillCertificatePanel" class="card panel skill-certificate-panel"><div class="error">${safe(err.message||'Could not load skill certificate')}</div><button class="btn secondary small" type="button" onclick="refreshWorkerSkillCertificate()">Retry</button></section>`);
    }
  }

  async function submit(event){
    event.preventDefault();if(busy)return;
    const title=document.getElementById('skillCertTitle')?.value?.trim()||'';
    const issuer=document.getElementById('skillCertIssuer')?.value?.trim()||'';
    const input=document.getElementById('skillCertFile');
    const file=input?.files?.[0];
    setSubmitStatus('');

    if(title.length<2){setSubmitStatus('Certificate title must be at least 2 characters.','error');return}
    if(!file){setSubmitStatus('Choose a PDF, JPG or PNG certificate file first.','error');return}
    if(file.size>3*1024*1024){setSubmitStatus('Certificate must be 3 MB or smaller.','error');return}
    if(!['application/pdf','image/jpeg','image/png'].includes(file.type)&&!/[.](pdf|jpe?g|png)$/i.test(file.name)){setSubmitStatus('Only PDF, JPG or PNG files are allowed.','error');return}

    let current=null;try{current=await getCertificate()}catch(e){}
    if(String(current?.status||'').toUpperCase()==='VERIFIED'&&!confirm('Replacing this verified certificate will reset its status to PENDING until Admin verifies the new file. Continue?'))return;

    const button=event.currentTarget.querySelector('button[type="submit"]');
    const old=button?.textContent;busy=true;if(button){button.disabled=true;button.textContent='Uploading…'}
    setSubmitStatus(`Uploading ${file.name}…`,'info');
    try{
      const body=await file.arrayBuffer();
      const headers={
        'Authorization':'Bearer '+token(),
        'Content-Type':'application/octet-stream',
        'X-Certificate-Title':encodeURIComponent(title),
        'X-Certificate-Issuer':encodeURIComponent(issuer),
        'X-Certificate-Filename':encodeURIComponent(file.name)
      };
      const r=await fetch('/api/skill-certificates/me',{method:'POST',headers,body,cache:'no-store'});
      const data=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(data.message||`Certificate upload failed (HTTP ${r.status})`);
      setSubmitStatus('Certificate submitted successfully. Waiting for Admin verification.','success');
      if(typeof toast==='function')toast('Certificate submitted for Admin verification');
      setTimeout(()=>render(data.data||null),350);
    }catch(err){
      const msg=err?.message||'Certificate upload failed';
      setSubmitStatus(msg,'error');
      if(typeof toast==='function')toast(msg);else alert(msg);
    }
    finally{busy=false;if(button&&button.isConnected){button.disabled=false;button.textContent=old||'Submit Certificate'}}
  }

  async function viewMine(){
    try{
      const r=await fetch('/api/skill-certificates/me/file',{headers:{Authorization:'Bearer '+token()},cache:'no-store'});
      if(!r.ok){const data=await r.json().catch(()=>({}));throw new Error(data.message||'Could not open certificate')}
      const blob=await r.blob();const url=URL.createObjectURL(blob);window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000);
    }catch(err){if(typeof toast==='function')toast(err.message);else alert(err.message)}
  }

  const wrapped=async function(...args){const result=await originalProfile.apply(this,args);setTimeout(refresh,0);return result};
  wrapped.__sevahubSkillCertificateWrapped=true;
  globalThis.workerProfile=wrapped;
  globalThis.refreshWorkerSkillCertificate=refresh;
  globalThis.submitSkillCertificate=submit;
  globalThis.viewMySkillCertificate=viewMine;
})();
