/* Robust delegated submit handler for Worker Skill Certificate form.
   Avoids reliance on inline onsubmit attributes and always shows upload state. */
(function(){
  let inflight=false;

  function token(){
    try{return sessionStorage.getItem('sevahub_token')||localStorage.getItem('sevahub_token')||''}catch(e){return ''}
  }

  function status(message,type='info'){
    let el=document.getElementById('skillCertSubmitStatus');
    const form=document.getElementById('skillCertificateForm');
    if(!el&&form){
      el=document.createElement('div');
      el.id='skillCertSubmitStatus';
      el.className='skill-cert-submit-status';
      el.setAttribute('aria-live','polite');
      const button=form.querySelector('button[type="submit"]');
      if(button)form.insertBefore(el,button);else form.appendChild(el);
    }
    if(!el)return;
    el.className=`skill-cert-submit-status ${type}`;
    el.textContent=String(message||'');
    el.style.margin='0 0 10px';
    el.style.fontWeight='700';
    el.style.color=type==='error'?'#ef4444':type==='success'?'#22c55e':'';
  }

  function fail(message){
    status(message,'error');
    if(typeof toast==='function')toast(message);
  }

  async function upload(form){
    if(!form||inflight)return;

    const title=document.getElementById('skillCertTitle')?.value?.trim()||'';
    const issuer=document.getElementById('skillCertIssuer')?.value?.trim()||'';
    const input=document.getElementById('skillCertFile');
    const file=input?.files?.[0];
    const button=form.querySelector('button[type="submit"]');

    if(title.length<2)return fail('Certificate title must be at least 2 characters.');
    if(!file)return fail('Choose a PDF, JPG or PNG certificate file first.');
    if(file.size>3*1024*1024)return fail('Certificate must be 3 MB or smaller.');
    if(!['application/pdf','image/jpeg','image/png'].includes(file.type)&&!/[.](pdf|jpe?g|png)$/i.test(file.name)){
      return fail('Only PDF, JPG or PNG files are allowed.');
    }

    const authToken=token();
    if(!authToken)return fail('Your login session is missing. Please login again.');

    const oldText=button?.textContent||'Submit Certificate for Verification';
    inflight=true;
    if(button){button.disabled=true;button.textContent='Uploading…'}
    status(`Uploading ${file.name}…`,'info');

    try{
      const response=await fetch('/api/skill-certificates/me',{
        method:'POST',
        headers:{
          'Authorization':'Bearer '+authToken,
          'Content-Type':'application/octet-stream',
          'X-Certificate-Title':encodeURIComponent(title),
          'X-Certificate-Issuer':encodeURIComponent(issuer),
          'X-Certificate-Filename':encodeURIComponent(file.name)
        },
        body:file,
        cache:'no-store'
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.message||`Certificate upload failed (HTTP ${response.status})`);

      status('Certificate submitted successfully. Waiting for Admin verification.','success');
      if(typeof toast==='function')toast('Certificate submitted for Admin verification');
      setTimeout(()=>{
        if(typeof refreshWorkerSkillCertificate==='function')refreshWorkerSkillCertificate();
      },400);
    }catch(err){
      fail(err?.message||'Certificate upload failed.');
    }finally{
      inflight=false;
      if(button&&button.isConnected){button.disabled=false;button.textContent=oldText}
    }
  }

  // Capture phase intentionally overrides the older inline submit path.
  document.addEventListener('submit',event=>{
    const form=event.target;
    if(!(form instanceof HTMLFormElement)||form.id!=='skillCertificateForm')return;
    event.preventDefault();
    event.stopImmediatePropagation();
    upload(form);
  },true);

  document.addEventListener('click',event=>{
    const button=event.target?.closest?.('#skillCertificateForm button[type="submit"]');
    if(!button)return;
    const form=button.form||document.getElementById('skillCertificateForm');
    event.preventDefault();
    event.stopImmediatePropagation();
    upload(form);
  },true);
})();
