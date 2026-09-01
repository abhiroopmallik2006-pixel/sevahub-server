/* Lightweight AI-booking entry point for the User AI panel.
   No background observer: enhancement runs only when the AI panel is opened. */
(function(){
  const original=globalThis.userAI;
  if(typeof original!=='function'||original.__sevahubAIBookingWrapped)return;

  function isHindi(){
    try{return localStorage.getItem('sevahub_language_v1')==='hi'}catch(e){return false}
  }

  function copy(){
    return isHindi()?{
      desc:'अपनी समस्या सामान्य भाषा में बताइए। AI सही service पहचान सकता है, available workers दिखा सकता है, worker चुनवा सकता है, date/time/location और bargaining पूछकर booking अपने-आप बना सकता है।',
      chip:'🪚 AI से booking शुरू करें',
      initial:'<b>नमस्ते! 👋</b><br>अपनी समस्या बताइए — जैसे <i>“मेरा bed खराब है”</i>। मैं service पहचानकर available workers दिखाऊँगा, फिर worker, date, time, location और bargaining पूछकर booking बना दूँगा।',
      disclaimer:'AI booking तभी बनाता है जब worker, date, time, location और bargaining choice मिल जाए। Bargain होने पर worker Accept/Reject/Counter कर सकता है.'
    }:{
      desc:'Describe your problem normally. I can identify the service, show available workers, ask you to choose one, collect date/time/location and bargaining, then create the booking automatically.',
      chip:'🪚 Start AI booking',
      initial:'<b>Hi! 👋</b><br>Tell me the problem — for example <i>“Mera bed kharab hai”</i>. I’ll identify the service, show available workers, then ask for worker, date, time, location and bargaining before creating the booking.',
      disclaimer:'AI creates the booking only after worker, date, time, location and bargaining choice are provided. If you bargain, the worker can Accept, Reject or Counter.'
    };
  }

  function sendPrompt(prompt){
    const input=document.getElementById('aiInput');
    if(!input)return false;
    input.value=prompt;
    input.dispatchEvent(new Event('input',{bubbles:true}));

    const form=input.closest('form');
    if(form){
      if(typeof form.requestSubmit==='function')form.requestSubmit();
      else form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
      return true;
    }

    /* Fallback for older panel markup. */
    if(typeof globalThis.aiChat==='function'){
      globalThis.aiChat({preventDefault(){}});
      return true;
    }
    input.focus();
    return false;
  }

  function enhance(){
    try{
      if(typeof state==='undefined'||state?.role!=='USER')return;
      const panel=document.querySelector('#userContent .ai-panel');
      if(!panel||panel.dataset.bookingAgentEnhanced==='1')return;
      panel.dataset.bookingAgentEnhanced='1';
      const c=copy();

      const desc=panel.querySelector('.ai-hero p');
      if(desc)desc.textContent=c.desc;

      const prompts=panel.querySelector('.ai-prompts');
      if(prompts){
        const btn=document.createElement('button');
        btn.id='aiBookingPrompt';
        btn.type='button';
        btn.className='ai-chip';
        btn.textContent=c.chip;
        btn.addEventListener('click',()=>{
          const ok=sendPrompt('Mera bed kharab hai, booking karwa do.');
          if(!ok&&typeof toast==='function')toast('Type your problem and press Send to start AI booking.');
        });
        prompts.prepend(btn);
      }

      const first=panel.querySelector('#aiMessages .ai-msg');
      if(first)first.innerHTML=c.initial;
      const disclaimer=panel.querySelector('.ai-disclaimer');
      if(disclaimer)disclaimer.textContent=c.disclaimer;
    }catch(e){console.warn('AI booking UI enhancement skipped',e)}
  }

  const wrapped=function(...args){
    const result=original.apply(this,args);
    setTimeout(enhance,0);
    return result;
  };
  wrapped.__sevahubAIBookingWrapped=true;
  globalThis.userAI=wrapped;
})();
