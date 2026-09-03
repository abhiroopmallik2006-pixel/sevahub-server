/* Worker professional profile editor.
   Lightweight: no polling/observers; loads only when Profile is opened. */
(function(){
  const fallbackProfile=globalThis.workerProfile;
  if(typeof fallbackProfile!=='function'||fallbackProfile.__sevahubProfileEditor)return;
  let loading=false;

  const copy={
    en:{title:'My professional profile',edit:'Edit Profile',cancel:'Cancel',save:'Save Changes',saving:'Saving…',name:'Name',email:'Email',phone:'Phone',service:'Service',price:'Starting price',experience:'Experience',area:'Working area',radius:'Service radius',hours:'Working hours',bio:'Bio',intro:'Introduction',verification:'Verification',rating:'Rating',reviews:'Reviews',years:'years',km:'km',saved:'Profile updated successfully',loading:'Loading professional profile…',retry:'Retry'},
    hi:{title:'मेरी प्रोफेशनल प्रोफ़ाइल',edit:'प्रोफ़ाइल एडिट करें',cancel:'रद्द करें',save:'बदलाव सेव करें',saving:'सेव हो रहा है…',name:'नाम',email:'ईमेल',phone:'फ़ोन',service:'सेवा',price:'शुरुआती कीमत',experience:'अनुभव',area:'काम का क्षेत्र',radius:'सेवा दूरी',hours:'काम के घंटे',bio:'बायो',intro:'परिचय',verification:'वेरिफिकेशन',rating:'रेटिंग',reviews:'रिव्यू',years:'साल',km:'किमी',saved:'प्रोफ़ाइल सफलतापूर्वक अपडेट हुई',loading:'प्रोफेशनल प्रोफ़ाइल लोड हो रही है…',retry:'फिर कोशिश करें'}
  };

  function lang(){try{return localStorage.getItem('sevahub_language_v1')==='hi'?'hi':'en'}catch(e){return 'en'}}
  function safe(v=''){try{return typeof esc==='function'?esc(v):String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}catch(e){return String(v)}}
  function moneyValue(v){try{return typeof money==='function'?money(v):`₹${Number(v||0).toLocaleString('en-IN')}`}catch(e){return `₹${Number(v||0)}`}}
  async function profileApi(path,options={}){
    if(typeof api==='function')return api(path,options);
    const token=sessionStorage.getItem('sevahub_token')||localStorage.getItem('sevahub_token');
    options.headers={'Content-Type':'application/json',...(options.headers||{})};
    if(token)options.headers.Authorization='Bearer '+token;
    const r=await fetch('/api'+path,options);
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(data.message||'Request failed');
    return data;
  }

  function renderProfile(data){
    const box=document.getElementById('workerContent');
    if(!box)return;
    const c=copy[lang()];
    const verification=String(data.verification_status||'PENDING').toUpperCase();
    const verificationClass=verification==='VERIFIED'?'ok':verification==='REJECTED'?'bad':'warn';
    box.innerHTML=`
      <section class="card panel worker-profile-live" data-worker-profile-live="1">
        <div class="worker-profile-head">
          <div><h2>${c.title}</h2><p class="muted">${safe(data.introduction||data.bio||'Keep your professional details accurate so customers and the cooperative can understand your services.')}</p></div>
          <button type="button" class="btn small" onclick="toggleWorkerProfileEdit(true)">${c.edit}</button>
        </div>
        <div class="worker-profile-detail-grid">
          <div><span>${c.name}</span><b>${safe(data.full_name||'—')}</b></div>
          <div><span>${c.email}</span><b>${safe(data.email||'—')}</b></div>
          <div><span>${c.phone}</span><b>${safe(data.phone||'—')}</b></div>
          <div><span>${c.service}</span><b>${safe(data.service_name||'Not set')}</b></div>
          <div><span>${c.price}</span><b>${moneyValue(data.service_price||0)}</b></div>
          <div><span>${c.experience}</span><b>${Number(data.experience_years||0)} ${c.years}</b></div>
          <div><span>${c.area}</span><b>${safe(data.service_area||'—')}</b></div>
          <div><span>${c.radius}</span><b>${Number(data.service_radius||0)} ${c.km}</b></div>
          <div><span>${c.hours}</span><b>${safe(data.working_hours||'—')}</b></div>
          <div><span>${c.verification}</span><b><span class="worker-profile-status ${verificationClass}">${safe(verification)}</span></b></div>
          <div><span>${c.rating}</span><b>${Number(data.rating||0).toFixed(1)} / 5</b></div>
          <div><span>${c.reviews}</span><b>${Number(data.total_reviews||0)}</b></div>
        </div>
        ${data.bio?`<div class="worker-profile-text"><span>${c.bio}</span><p>${safe(data.bio)}</p></div>`:''}
        ${data.introduction?`<div class="worker-profile-text"><span>${c.intro}</span><p>${safe(data.introduction)}</p></div>`:''}

        <form id="workerProfileEditForm" class="worker-profile-edit-form hidden" onsubmit="saveWorkerProfile(event)">
          <div class="worker-profile-form-grid">
            <label>${c.name}<input id="wpName" maxlength="100" value="${safe(data.full_name||'')}" required></label>
            <label>${c.phone}<input id="wpPhone" maxlength="30" value="${safe(data.phone||'')}"></label>
            <label>${c.price} (₹)<input id="wpPrice" type="number" min="1" max="1000000" step="1" value="${Number(data.service_price||0)}" required></label>
            <label>${c.experience}<input id="wpExperience" type="number" min="0" max="60" step="1" value="${Number(data.experience_years||0)}" required></label>
            <label>${c.area}<input id="wpArea" maxlength="255" value="${safe(data.service_area||'')}" required></label>
            <label>${c.radius} (${c.km})<input id="wpRadius" type="number" min="1" max="100" step="1" value="${Number(data.service_radius||10)}" required></label>
            <label class="wide">${c.hours}<input id="wpHours" maxlength="100" value="${safe(data.working_hours||'09:00 - 18:00')}" placeholder="09:00 - 18:00" required></label>
            <label class="wide">${c.bio}<textarea id="wpBio" maxlength="1200" rows="3">${safe(data.bio||'')}</textarea></label>
            <label class="wide">${c.intro}<textarea id="wpIntro" maxlength="1200" rows="3">${safe(data.introduction||'')}</textarea></label>
          </div>
          <div class="actions"><button class="btn" type="submit">${c.save}</button><button class="btn secondary" type="button" onclick="toggleWorkerProfileEdit(false)">${c.cancel}</button></div>
        </form>
      </section>`;
    if(typeof refreshWorkerWelfare==='function')refreshWorkerWelfare();
  }

  async function workerProfile(){
    if(location.protocol==='file:')return fallbackProfile.apply(this,arguments);
    const box=document.getElementById('workerContent');
    if(!box||loading)return;
    const c=copy[lang()];
    loading=true;
    box.innerHTML=`<div class="card panel"><div class="empty">${c.loading}</div></div>`;
    try{
      const result=await profileApi('/workers/me');
      if(!result.data)throw new Error('Worker profile not found');
      renderProfile(result.data);
    }catch(err){
      box.innerHTML=`<div class="card panel"><div class="error">${safe(err.message||'Could not load profile')}</div><button class="btn secondary small" type="button" onclick="workerProfile()">${c.retry}</button></div>`;
    }finally{loading=false}
  }

  function toggleWorkerProfileEdit(open){
    document.getElementById('workerProfileEditForm')?.classList.toggle('hidden',!open);
    if(open)document.getElementById('wpName')?.focus();
  }

  async function saveWorkerProfile(event){
    event.preventDefault();
    const c=copy[lang()];
    const button=event.currentTarget.querySelector('button[type="submit"]');
    const oldText=button?.textContent;
    if(button){button.disabled=true;button.textContent=c.saving}
    const payload={
      fullName:document.getElementById('wpName')?.value?.trim()||'',
      phone:document.getElementById('wpPhone')?.value?.trim()||'',
      price:Number(document.getElementById('wpPrice')?.value||0),
      experienceYears:Number(document.getElementById('wpExperience')?.value||0),
      serviceArea:document.getElementById('wpArea')?.value?.trim()||'',
      serviceRadius:Number(document.getElementById('wpRadius')?.value||0),
      workingHours:document.getElementById('wpHours')?.value?.trim()||'',
      bio:document.getElementById('wpBio')?.value?.trim()||'',
      introduction:document.getElementById('wpIntro')?.value?.trim()||''
    };
    try{
      const result=await profileApi('/workers/me',{method:'PUT',body:JSON.stringify(payload)});
      if(typeof state!=='undefined'&&state?.user&&result.data?.full_name)state.user.fullName=result.data.full_name;
      if(typeof toast==='function')toast(c.saved);
      renderProfile(result.data||{});
    }catch(err){if(typeof toast==='function')toast(err.message);else alert(err.message)}
    finally{if(button){button.disabled=false;button.textContent=oldText||c.save}}
  }

  workerProfile.__sevahubProfileEditor=true;
  globalThis.workerProfile=workerProfile;
  globalThis.toggleWorkerProfileEdit=toggleWorkerProfileEdit;
  globalThis.saveWorkerProfile=saveWorkerProfile;
})();
