/* Cooperative Admin: Demand Forecasting + Workforce Intelligence.
   Additive only. Existing cooperative-admin.js sections remain untouched. */
(function(){
  const SECTION='intelligence';

  function safe(v=''){
    try{return typeof esc==='function'?esc(v):String(v)}catch(e){return String(v)}
  }
  function number(v){return Number(v||0).toLocaleString('en-IN')}
  function trendText(t){
    const direction=String(t?.direction||'STABLE');
    const pct=Number(t?.percent||0);
    const arrow=direction==='RISING'?'↑':direction==='FALLING'?'↓':'→';
    return `${arrow} ${Math.abs(pct)}% ${direction.toLowerCase()}`;
  }
  function statusPill(status){
    const s=String(status||'BALANCED').toUpperCase();
    const cls=s==='SHORTAGE'?'bad':s==='TIGHT'?'warn':'ok';
    return `<span class="pill ${cls}">${safe(s)}</span>`;
  }
  function confidencePill(value){
    const s=String(value||'LOW').toUpperCase();
    const cls=s==='HIGH'?'ok':s==='MEDIUM'?'warn':'bad';
    return `<span class="pill ${cls}">${safe(s)}</span>`;
  }
  function aiLines(value){
    const lines=String(value||'')
      .split(/\n+/)
      .map(x=>x.replace(/^\s*(?:[-*•]|\d+[.)])\s*/,'').trim())
      .filter(Boolean)
      .slice(0,5);
    return lines.length?lines.map(line=>`<li>${safe(line)}</li>`).join(''):'<li>No recommendation available yet.</li>';
  }

  function ensureTab(){
    const tabs=document.getElementById('adminTabs');
    if(!tabs||tabs.querySelector(`[data-section="${SECTION}"]`))return;
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='tab';
    btn.dataset.section=SECTION;
    btn.textContent='🧠 AI Intelligence';
    btn.addEventListener('click',openAdminIntelligence);
    const bookings=tabs.querySelector('[data-section="bookings"]');
    if(bookings)bookings.after(btn);else tabs.appendChild(btn);
  }

  async function openAdminIntelligence(){
    try{currentSection=SECTION}catch(e){}
    document.querySelectorAll('.tab').forEach(btn=>btn.classList.toggle('active',btn.dataset.section===SECTION));
    const box=document.getElementById('adminContent');
    if(!box)return;
    box.innerHTML='<div class="panel"><div class="empty">Analyzing demand and workforce…</div></div>';
    try{
      const result=await adminApi('/intelligence');
      renderIntelligence(result.data||{});
    }catch(err){
      if(/admin session|authentication|required|expired/i.test(String(err.message||''))){
        if(typeof adminLogout==='function')adminLogout();
        return;
      }
      box.innerHTML=`<div class="panel"><div class="error">${safe(err.message||'Could not load intelligence')}</div></div>`;
    }
  }
  window.openAdminIntelligence=openAdminIntelligence;

  function renderIntelligence(data){
    const box=document.getElementById('adminContent');
    if(!box)return;
    const summary=data.summary||{};
    const services=Array.isArray(data.services)?data.services:[];
    const areas=Array.isArray(data.areas)?data.areas:[];
    const peak=data.peak||{};
    const maxForecast=Math.max(1,...services.map(x=>Number(x.forecastNext7||0)));
    const modelMode=String(data.ai?.mode||'DATA_ENGINE');
    const modelLabel=modelMode==='AI_MODEL'?'Configured AI model + predictive data':'Predictive data engine';

    const serviceRows=services.length?services.map(row=>{
      const forecast=Number(row.forecastNext7||0);
      const width=Math.max(forecast?5:0,Math.round(forecast/maxForecast*100));
      return `<tr>
        <td><b>${safe(row.serviceName)}</b><div class="intel-meter"><i style="width:${width}%"></i></div></td>
        <td>${number(row.bookingsLast7)}</td>
        <td>${number(row.bookingsPrevious7)}</td>
        <td><b>${number(forecast)}</b><br><span class="muted intel-mini">${safe(trendText(row.trend))}</span></td>
        <td>${confidencePill(row.confidence)}</td>
        <td>${number(row.verifiedWorkers)}</td>
        <td>${number(row.availableWorkers)}</td>
        <td>${number(row.recommendedWorkers)}</td>
        <td>${row.shortage?`<b class="intel-gap bad-text">-${number(row.shortage)}</b>`:`<span class="intel-gap ok-text">+${number(row.surplus||0)}</span>`}</td>
        <td>${statusPill(row.workforceStatus)}</td>
      </tr>`;
    }).join(''):'<tr><td colspan="10"><div class="empty">No service history is available yet.</div></td></tr>';

    const areaCards=areas.length?areas.map((area,index)=>`<div class="intel-area-card">
      <div class="intel-rank">#${index+1}</div>
      <div><b>${safe(area.area)}</b><span>${number(area.bookings)} bookings</span><small>Top service: ${safe(area.topService||'Mixed')}</small></div>
    </div>`).join(''):'<div class="empty">No usable booking-area history yet.</div>';

    box.innerHTML=`
      <section class="intel-hero panel">
        <div>
          <span class="intel-kicker">COOPERATIVE PLANNING ENGINE</span>
          <h2>🧠 AI Demand & Workforce Intelligence</h2>
          <p class="muted">Uses real SevaHub booking history and verified-worker capacity to forecast the next 7 days and flag workforce shortages. No random demo numbers are generated.</p>
        </div>
        <div class="intel-live-badge"><span></span>${safe(modelLabel)}</div>
      </section>

      <div class="stats intel-stats">
        <div class="stat"><span>Bookings - last 7 days</span><b>${number(summary.bookingsLast7)}</b></div>
        <div class="stat intel-highlight"><span>Forecast - next 7 days</span><b>${number(summary.forecastNext7)}</b></div>
        <div class="stat"><span>Verified workers</span><b>${number(summary.verifiedWorkers)}</b></div>
        <div class="stat"><span>Available now</span><b>${number(summary.availableWorkers)}</b></div>
        <div class="stat"><span>Services with shortage</span><b>${number(summary.shortageServices)}</b></div>
        <div class="stat"><span>Highest forecast demand</span><b class="intel-service-name">${safe(summary.highestDemandService||'No data')}</b></div>
      </div>

      <section class="panel intel-ai-panel">
        <div class="toolbar"><div><span class="intel-kicker">AI COOPERATIVE RECOMMENDATION</span><h2>What should the federation do?</h2></div><button class="btn secondary small" type="button" onclick="openAdminIntelligence()">↻ Refresh analysis</button></div>
        <ul class="intel-recommendations">${aiLines(data.ai?.text)}</ul>
      </section>

      <section class="panel">
        <div class="toolbar"><div><span class="intel-kicker">SERVICE FORECAST</span><h2>Demand vs workforce capacity</h2></div><span class="muted">28-day history → 7-day forecast</span></div>
        <div class="table-wrap"><table class="intel-table"><thead><tr><th>Service</th><th>Last 7d</th><th>Prev 7d</th><th>Forecast 7d</th><th>Confidence</th><th>Verified</th><th>Available</th><th>Recommended</th><th>Gap</th><th>Status</th></tr></thead><tbody>${serviceRows}</tbody></table></div>
      </section>

      <div class="intel-split-grid">
        <section class="panel">
          <span class="intel-kicker">PEAK DEMAND</span>
          <h2>When demand is strongest</h2>
          <div class="intel-peak-grid">
            <div><span>Peak day</span><b>${safe(peak.dayLabel||'No data')}</b><small>${number(peak.dayBookings)} bookings in history</small></div>
            <div><span>Peak hour</span><b>${safe(peak.hourLabel||'No data')}</b><small>${number(peak.hourBookings)} bookings in history</small></div>
          </div>
        </section>
        <section class="panel">
          <span class="intel-kicker">AREA INTELLIGENCE</span>
          <h2>Top observed booking areas</h2>
          <div class="intel-area-grid">${areaCards}</div>
        </section>
      </div>

      <section class="panel intel-method">
        <span class="intel-kicker">HOW THE FORECAST WORKS</span>
        <h2>Transparent planning methodology</h2>
        <div class="intel-method-grid">
          <p><b>Demand:</b> ${safe(data.methodology?.forecast||'')}</p>
          <p><b>Capacity:</b> ${safe(data.methodology?.workforce||'')}</p>
          <p><b>Availability:</b> ${safe(data.methodology?.availability||'')}</p>
        </div>
        <p class="muted intel-note">Forecasts are planning guidance. Confidence rises as SevaHub collects more real booking history.</p>
      </section>`;
  }

  const observer=new MutationObserver(ensureTab);
  observer.observe(document.getElementById('adminApp')||document.body,{childList:true,subtree:true});
  ensureTab();
})();
