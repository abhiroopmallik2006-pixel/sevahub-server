/* Worker Welfare & Insurance.
   Lightweight: runs only when Worker Profile is opened or an action is submitted. */
(function(){
  const originalProfile=globalThis.workerProfile;
  if(typeof originalProfile!=='function'||originalProfile.__sevahubWelfareWrapped)return;

  let lastData=null;
  let loading=false;

  const copy={
    en:{
      title:'🛡️ Welfare & Insurance',
      intro:'Cooperative welfare enrollment and worker-submitted insurance records.',
      welfare:'Cooperative Welfare',
      welfareText:'Request enrollment in the SevaHub cooperative welfare program.',
      member:'Member ID',
      benefits:'Program support categories',
      request:'Request Welfare Enrollment',
      requestAgain:'Request Again',
      pending:'Your request is waiting for cooperative review.',
      active:'Your cooperative welfare membership is active.',
      notEnrolled:'Not enrolled yet.',
      insurance:'Insurance Record',
      insuranceText:'Add an existing insurance policy for cooperative review. SevaHub does not create or issue insurance policies.',
      provider:'Provider name',
      policy:'Policy number',
      coverage:'Coverage type',
      expiry:'Valid until',
      submit:'Submit for Review',
      resubmit:'Update & Re-submit',
      reviewNote:'Review note',
      removedByAdmin:'Removed by cooperative',
      disclaimer:'Insurance details are submitted by the worker and reviewed by the cooperative. This is not direct insurer/API validation.',
      loading:'Loading welfare & insurance…',
      retry:'Retry',
      serverOnly:'Welfare & Insurance is available when SevaHub is connected to the backend server.',
      submitted:'Submitted for cooperative review.',
      welfareSent:'Welfare request submitted.',
      status:'Status'
    },
    hi:{
      title:'🛡️ कल्याण और बीमा',
      intro:'सहकारी कल्याण नामांकन और वर्कर द्वारा जमा किए गए बीमा रिकॉर्ड।',
      welfare:'सहकारी कल्याण',
      welfareText:'SevaHub सहकारी कल्याण कार्यक्रम में नामांकन के लिए अनुरोध करें।',
      member:'सदस्य आईडी',
      benefits:'कार्यक्रम सहायता श्रेणियाँ',
      request:'कल्याण नामांकन का अनुरोध करें',
      requestAgain:'दोबारा अनुरोध करें',
      pending:'आपका अनुरोध सहकारी समीक्षा के लिए लंबित है।',
      active:'आपकी सहकारी कल्याण सदस्यता सक्रिय है।',
      notEnrolled:'अभी नामांकित नहीं हैं।',
      insurance:'बीमा रिकॉर्ड',
      insuranceText:'सहकारी समीक्षा के लिए अपनी मौजूदा बीमा पॉलिसी जोड़ें। SevaHub कोई बीमा पॉलिसी जारी नहीं करता।',
      provider:'प्रदाता का नाम',
      policy:'पॉलिसी नंबर',
      coverage:'कवरेज प्रकार',
      expiry:'मान्य तिथि तक',
      submit:'समीक्षा के लिए भेजें',
      resubmit:'अपडेट करके दोबारा भेजें',
      reviewNote:'समीक्षा नोट',
      removedByAdmin:'सहकारी द्वारा हटाया गया',
      disclaimer:'बीमा विवरण वर्कर द्वारा जमा किए जाते हैं और सहकारी द्वारा समीक्षा की जाती है। यह सीधे बीमा कंपनी/API की पुष्टि नहीं है।',
      loading:'कल्याण और बीमा लोड हो रहा है…',
      retry:'फिर कोशिश करें',
      serverOnly:'कल्याण और बीमा सुविधा backend server से जुड़े SevaHub में उपलब्ध है।',
      submitted:'सहकारी समीक्षा के लिए भेज दिया गया।',
      welfareSent:'कल्याण अनुरोध भेज दिया गया।',
      status:'स्थिति'
    }
  };

  const statusLabels={
    en:{NOT_ENROLLED:'Not Enrolled',PENDING:'Pending Review',ACTIVE:'Active',REJECTED:'Rejected',VERIFIED:'Cooperative Verified',EXPIRED:'Expired',REMOVED:'Removed by Admin'},
    hi:{NOT_ENROLLED:'नामांकित नहीं',PENDING:'समीक्षा लंबित',ACTIVE:'सक्रिय',REJECTED:'अस्वीकृत',VERIFIED:'सहकारी द्वारा सत्यापित',EXPIRED:'समाप्त',REMOVED:'एडमिन द्वारा हटाया गया'}
  };
  const coverageLabels={
    en:{ACCIDENT:'Accident Cover',HEALTH:'Health Cover',HOSPITALIZATION:'Hospitalization',DISABILITY:'Disability Cover',LIFE:'Life Cover',OTHER:'Other'},
    hi:{ACCIDENT:'दुर्घटना कवर',HEALTH:'स्वास्थ्य कवर',HOSPITALIZATION:'अस्पताल कवर',DISABILITY:'दिव्यांगता कवर',LIFE:'जीवन कवर',OTHER:'अन्य'}
  };
  const benefitLabels={
    en:{ACCIDENT_ASSISTANCE:'Accident assistance',MEDICAL_SUPPORT:'Medical support',EMERGENCY_ASSISTANCE:'Emergency financial assistance',COOPERATIVE_SUPPORT:'Cooperative worker support'},
    hi:{ACCIDENT_ASSISTANCE:'दुर्घटना सहायता',MEDICAL_SUPPORT:'चिकित्सा सहायता',EMERGENCY_ASSISTANCE:'आपातकालीन वित्तीय सहायता',COOPERATIVE_SUPPORT:'सहकारी वर्कर सहायता'}
  };

  function lang(){
    try{return localStorage.getItem('sevahub_language_v1')==='hi'?'hi':'en'}catch(e){return 'en'}
  }
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
    const cls=['ACTIVE','VERIFIED'].includes(s)?'ok':['REJECTED','EXPIRED','REMOVED'].includes(s)?'bad':s==='PENDING'?'warn':'neutral';
    return `<span class="welfare-status ${cls}">${safe(statusLabels[lang()][s]||s)}</span>`;
  }
  async function welfareApi(path,options={}){
    if(typeof api==='function')return api(path,options);
    const token=sessionStorage.getItem('sevahub_token')||localStorage.getItem('sevahub_token');
    options.headers={'Content-Type':'application/json',...(options.headers||{})};
    if(token)options.headers.Authorization='Bearer '+token;
    const response=await fetch('/api'+path,options);
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.message||'Request failed');
    return data;
  }

  function ensurePanel(){
    const box=document.getElementById('workerContent');
    if(!box)return null;
    let panel=document.getElementById('workerWelfarePanel');
    if(panel)return panel;
    panel=document.createElement('section');
    panel.id='workerWelfarePanel';
    panel.className='card panel worker-welfare-panel';
    panel.innerHTML=`<div class="empty">${safe(copy[lang()].loading)}</div>`;
    box.appendChild(panel);
    return panel;
  }

  function render(data){
    lastData=data;
    const panel=ensurePanel();
    if(!panel)return;
    const c=copy[lang()];
    const welfare=data?.welfare||{};
    const insurance=data?.insurance||{};
    const welfareStatus=String(welfare.status||'NOT_ENROLLED').toUpperCase();
    const insuranceStatus=String(insurance.status||'NOT_ENROLLED').toUpperCase();
    const benefits=Array.isArray(welfare.benefits)?welfare.benefits:[];
    const canRequest=welfareStatus==='NOT_ENROLLED'||welfareStatus==='REJECTED';
    const welfareMessage=welfareStatus==='ACTIVE'?c.active:welfareStatus==='PENDING'?c.pending:c.notEnrolled;
    const coverage=coverageLabels[lang()];

    panel.innerHTML=`
      <div class="worker-welfare-head">
        <div><h2>${c.title}</h2><p class="muted">${c.intro}</p></div>
      </div>
      <div class="worker-welfare-grid">
        <article class="worker-welfare-card">
          <div class="worker-welfare-card-head"><h3>${c.welfare}</h3>${statusPill(welfareStatus)}</div>
          <p class="muted">${c.welfareText}</p>
          <p>${safe(welfareMessage)}</p>
          ${welfare.memberId?`<div class="welfare-member"><span>${c.member}</span><b>${safe(welfare.memberId)}</b></div>`:''}
          <div class="welfare-benefits"><b>${c.benefits}</b><ul>${benefits.map(item=>`<li>✓ ${safe(benefitLabels[lang()][item.key]||item.label||item.key)}</li>`).join('')}</ul></div>
          ${welfareStatus==='REJECTED'&&welfare.reviewNote?`<div class="welfare-review-note"><b>${c.reviewNote}:</b> ${safe(welfare.reviewNote)}</div>`:''}
          ${canRequest?`<button type="button" class="btn small" onclick="requestWorkerWelfare(this)">${welfareStatus==='REJECTED'?c.requestAgain:c.request}</button>`:''}
        </article>

        <article class="worker-welfare-card">
          <div class="worker-welfare-card-head"><h3>${c.insurance}</h3>${statusPill(insuranceStatus)}</div>
          <p class="muted">${c.insuranceText}</p>
          ${insuranceStatus==='REJECTED'&&insurance.reviewNote?`<div class="welfare-review-note"><b>${c.reviewNote}:</b> ${safe(insurance.reviewNote)}</div>`:''}
          ${insuranceStatus==='REMOVED'&&insurance.removalReason?`<div class="welfare-review-note"><b>${c.removedByAdmin}:</b> ${safe(insurance.removalReason)}</div>`:''}
          <form class="worker-insurance-form" onsubmit="submitWorkerInsurance(event)">
            <label>${c.provider}<input id="workerInsuranceProvider" maxlength="120" value="${safe(insurance.providerName||'')}" required></label>
            <label>${c.policy}<input id="workerInsurancePolicy" maxlength="120" value="${safe(insurance.policyNumber||'')}" required></label>
            <label>${c.coverage}<select id="workerInsuranceCoverage" required><option value="">—</option>${Object.entries(coverage).map(([key,label])=>`<option value="${key}" ${insurance.coverageType===key?'selected':''}>${safe(label)}</option>`).join('')}</select></label>
            <label>${c.expiry}<input id="workerInsuranceExpiry" type="date" value="${safe(insurance.validUntil||'')}" required></label>
            <button class="btn small" type="submit">${insurance.providerName?c.resubmit:c.submit}</button>
          </form>
          ${insurance.validUntil?`<div class="worker-insurance-current"><span>${c.status}</span><b>${safe(statusLabels[lang()][insuranceStatus]||insuranceStatus)}</b><span>${c.expiry}</span><b>${safe(formatDate(insurance.validUntil))}</b></div>`:''}
          <p class="welfare-disclaimer">${c.disclaimer}</p>
        </article>
      </div>`;
  }

  async function refreshWorkerWelfare(){
    const panel=ensurePanel();
    if(!panel||loading)return;
    const c=copy[lang()];
    if(location.protocol==='file:'){
      panel.innerHTML=`<h2>${c.title}</h2><div class="empty">${safe(c.serverOnly)}</div>`;
      return;
    }
    loading=true;
    try{
      const result=await welfareApi('/welfare/me');
      render(result.data||{});
    }catch(err){
      panel.innerHTML=`<h2>${c.title}</h2><div class="error">${safe(err.message||'Could not load welfare information')}</div><button class="btn secondary small" type="button" onclick="refreshWorkerWelfare()">${c.retry}</button>`;
    }finally{loading=false}
  }

  async function requestWorkerWelfare(button){
    if(button)button.disabled=true;
    try{
      await welfareApi('/welfare/request',{method:'POST'});
      if(typeof toast==='function')toast(copy[lang()].welfareSent);
      await refreshWorkerWelfare();
    }catch(err){if(typeof toast==='function')toast(err.message);else alert(err.message)}
    finally{if(button)button.disabled=false}
  }

  async function submitWorkerInsurance(event){
    event.preventDefault();
    const form=event.currentTarget;
    const button=form.querySelector('button[type="submit"]');
    if(button)button.disabled=true;
    const payload={
      providerName:document.getElementById('workerInsuranceProvider')?.value?.trim()||'',
      policyNumber:document.getElementById('workerInsurancePolicy')?.value?.trim()||'',
      coverageType:document.getElementById('workerInsuranceCoverage')?.value||'',
      validUntil:document.getElementById('workerInsuranceExpiry')?.value||''
    };
    try{
      await welfareApi('/welfare/insurance',{method:'PUT',body:JSON.stringify(payload)});
      if(typeof toast==='function')toast(copy[lang()].submitted);
      await refreshWorkerWelfare();
    }catch(err){if(typeof toast==='function')toast(err.message);else alert(err.message)}
    finally{if(button)button.disabled=false}
  }

  const wrapped=function(){
    const result=originalProfile.apply(this,arguments);
    lastData=null;
    ensurePanel();
    refreshWorkerWelfare();
    return result;
  };
  wrapped.__sevahubWelfareWrapped=true;
  globalThis.workerProfile=wrapped;
  globalThis.refreshWorkerWelfare=refreshWorkerWelfare;
  globalThis.requestWorkerWelfare=requestWorkerWelfare;
  globalThis.submitWorkerInsurance=submitWorkerInsurance;

  window.addEventListener('sevahub-language-changed',()=>{
    if(!document.getElementById('workerWelfarePanel'))return;
    if(lastData)render(lastData);else refreshWorkerWelfare();
  });
})();
