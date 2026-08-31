/* Header account icon: replaces the name/role pill and opens complete user/worker details. */
(function(){
  function e(value=''){
    try{return typeof esc==='function'?esc(value):String(value)}catch(_){return String(value)}
  }

  function profileSvg(){
    return `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="24" cy="17" r="8" fill="currentColor"/>
      <path d="M9 41c1.8-8.7 7-13 15-13s13.2 4.3 15 13" fill="currentColor"/>
    </svg>`;
  }

  function profileButton(){
    return `<button class="account-profile-button" type="button" onclick="openAccountProfile()" aria-label="Open account details" title="Account details">${profileSvg()}</button>`;
  }

  function decorateHeader(){
    const actions=document.querySelector('.nav .nav-actions');
    if(!actions)return;
    if(actions.querySelector('.account-profile-button'))return;
    const pill=actions.querySelector(':scope > .pill');
    if(!pill)return;
    pill.insertAdjacentHTML('afterend',profileButton());
    pill.remove();
  }

  function ensureModal(){
    let modal=document.getElementById('accountProfileModal');
    if(modal)return modal;
    modal=document.createElement('div');
    modal.id='accountProfileModal';
    modal.className='account-profile-modal hidden';
    modal.innerHTML=`
      <div class="account-profile-dialog" role="dialog" aria-modal="true" aria-labelledby="accountProfileTitle">
        <div class="account-profile-head">
          <div class="account-profile-avatar">${profileSvg()}</div>
          <div class="account-profile-title"><span>SEVAHUB ACCOUNT</span><h2 id="accountProfileTitle">Profile details</h2></div>
          <button class="account-profile-close" type="button" onclick="closeAccountProfile()" aria-label="Close profile">✕</button>
        </div>
        <div id="accountProfileBody"><div class="account-profile-loading">Loading account details…</div></div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click',ev=>{if(ev.target===modal)closeAccountProfile()});
    return modal;
  }

  function row(label,value){
    if(value===undefined||value===null||value==='')return '';
    return `<div class="account-detail-row"><span>${e(label)}</span><b>${e(value)}</b></div>`;
  }

  function moneyText(value){
    if(value===undefined||value===null||value==='')return '';
    try{return typeof money==='function'?money(value):`₹${Number(value).toLocaleString('en-IN')}`}catch(_){return `₹${value}`}
  }

  function renderDetails(user,worker){
    const body=document.getElementById('accountProfileBody');
    if(!body)return;
    const role=String(user?.role||state?.role||'').toUpperCase();
    let html=`
      <div class="account-profile-summary">
        <b>${e(user?.fullName||user?.full_name||state?.user?.fullName||'SevaHub user')}</b>
        <span>${e(role||'ACCOUNT')}</span>
      </div>
      <section class="account-detail-section">
        <h3>Account</h3>
        ${row('Account ID',user?.id??state?.user?.id)}
        ${row('Full name',user?.fullName||user?.full_name||state?.user?.fullName)}
        ${row('Username',user?.username||state?.user?.username)}
        ${row('Role',role)}
        ${row('Email',user?.email||state?.user?.email)}
        ${row('Phone',user?.phone||state?.user?.phone||'Not provided')}
        ${user?.emailVerified!==undefined||user?.email_verified!==undefined?row('Email verified',(user.emailVerified??user.email_verified)?'Yes':'No'):''}
      </section>`;

    if(role==='WORKER'&&worker){
      html+=`<section class="account-detail-section">
        <h3>Worker profile</h3>
        ${row('Worker ID',worker.id)}
        ${row('Service',worker.service_name||worker.service)}
        ${worker.service_price!==undefined&&worker.service_price!==null?row('Starting price',moneyText(worker.service_price)):''}
        ${row('Experience',worker.experience_years!==undefined&&worker.experience_years!==null?`${worker.experience_years} year${Number(worker.experience_years)===1?'':'s'}`:'')}
        ${row('Service area',worker.service_area||worker.area)}
        ${worker.service_radius!==undefined&&worker.service_radius!==null?row('Service radius',`${worker.service_radius} km`):''}
        ${row('Working hours',worker.working_hours)}
        ${worker.rating!==undefined&&worker.rating!==null?row('Rating',`${Number(worker.rating).toFixed(1)} ★`):''}
        ${row('Reviews',worker.total_reviews??worker.reviews)}
        ${row('Bio',worker.bio)}
        ${row('Introduction',worker.introduction)}
      </section>`;
    }
    body.innerHTML=html;
  }

  async function getDetails(){
    let user={...(state?.user||{}),role:state?.role||state?.user?.role};
    let worker=null;

    if(typeof isDemo!=='undefined'&&isDemo){
      try{
        const data=db();
        const u=(data.users||[]).find(x=>Number(x.id)===Number(state?.user?.id));
        if(u)user={...user,...u,fullName:u.fullName||u.full_name||user.fullName};
        if(String(state?.role).toUpperCase()==='WORKER'){
          const w=(data.workers||[]).find(x=>Number(x.userId??x.user_id)===Number(state?.user?.id));
          if(w)worker=w;
        }
      }catch(_){}
      return {user,worker};
    }

    try{
      const me=await api('/auth/me');
      if(me?.data)user={...user,...me.data,fullName:me.data.fullName||me.data.full_name||user.fullName};
    }catch(_){}

    if(String(user?.role||state?.role).toUpperCase()==='WORKER'){
      try{
        const w=await api('/workers/me');
        worker=w?.data||null;
        if(worker){
          user={...user,
            fullName:worker.full_name||user.fullName,
            username:worker.username||user.username,
            email:worker.email||user.email,
            phone:worker.phone||user.phone
          };
        }
      }catch(_){}
    }
    return {user,worker};
  }

  window.openAccountProfile=async function(){
    if(!state?.user)return;
    const modal=ensureModal();
    modal.classList.remove('hidden');
    renderDetails(state.user,null);
    const details=await getDetails();
    if(!modal.classList.contains('hidden'))renderDetails(details.user,details.worker);
  };

  window.closeAccountProfile=function(){
    document.getElementById('accountProfileModal')?.classList.add('hidden');
  };

  document.addEventListener('keydown',ev=>{if(ev.key==='Escape')closeAccountProfile()});
  const observer=new MutationObserver(decorateHeader);
  observer.observe(document.body,{childList:true,subtree:true});
  decorateHeader();
})();
