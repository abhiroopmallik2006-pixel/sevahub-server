/* Adds the cooperative Skill Verified badge to live worker cards. */
(function(){
  const original=globalThis.workerHTML;
  if(typeof original!=='function'||original.__sevahubSkillBadgeWrapped)return;
  const wrapped=function(worker,serviceId){
    let html=original.apply(this,arguments);
    if(String(worker?.skill_certificate_status||'').toUpperCase()==='VERIFIED'){
      const badge='<span class="pill skill-certificate-verified" title="Skill certificate verified by the cooperative">🛡 Skill Verified</span>';
      if(html.includes('<span class="pill success">✓ Verified</span>'))html=html.replace('<span class="pill success">✓ Verified</span>',`<span class="pill success">✓ Verified</span>${badge}`);
      else html=html.replace('</h3>',`</h3>${badge}`);
    }
    return html;
  };
  wrapped.__sevahubSkillBadgeWrapped=true;
  globalThis.workerHTML=wrapped;
})();
