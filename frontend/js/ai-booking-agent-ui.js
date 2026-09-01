/* Enhances the User AI panel copy for the conversational booking agent. */
(function(){
  const oldUserAI=typeof userAI==='function'?userAI:null;

  function copy(){
    const hi=localStorage.getItem('sevahub_language_v1')==='hi';
    return hi?{
      desc:'अपनी समस्या सामान्य भाषा में बताइए। AI सही service पहचान सकता है, available workers दिखा सकता है, worker चुनवा सकता है, date/time/location और bargaining पूछकर booking अपने-आप बना सकता है।',
      chip:'🪚 AI से booking करवाएँ',
      initial:'<b>नमस्ते! 👋</b><br>समस्या बताइए — जैसे <i>“मेरा bed खराब है”</i>। मैं service पहचानकर workers की list दूँगा और पूरी booking chat में करवा दूँगा।',
      disclaimer:'AI booking तभी बनाता है जब आप worker, date, time, location और bargaining choice दे देते हैं। Bargain होने पर worker Accept/Reject/Counter कर सकता है।'
    }:{
      desc:'Describe your problem normally. I can identify the right service, show available workers, let you choose one, ask for date/time/location and bargaining, then create the booking automatically.',
      chip:'🪚 Book through AI',
      initial:'<b>Hi! 👋</b><br>Tell me the problem — for example <i>“Mera bed kharab hai”</i>. I’ll identify the service, show workers, collect the booking details and create it here in chat.',
      disclaimer:'AI creates a booking only after you provide the worker, date, time, location and bargaining choice. If you bargain, the worker can Accept, Reject or Counter.'
    };
  }

  function enhance(){
    if(state?.role!=='USER')return;
    const panel=document.querySelector('#userContent .ai-panel');
    if(!panel)return;
    const c=copy();
    const desc=panel.querySelector('.ai-hero p');
    if(desc)desc.textContent=c.desc;

    const prompts=panel.querySelector('.ai-prompts');
    if(prompts&&!document.getElementById('aiBookingPrompt')){
      const btn=document.createElement('button');
      btn.id='aiBookingPrompt';
      btn.type='button';
      btn.className='ai-chip';
      btn.textContent=c.chip;
      btn.onclick=()=>{
        if(typeof useAIPrompt==='function')useAIPrompt('Mera bed kharab hai, booking karwa do.');
      };
      prompts.prepend(btn);
    }

    const first=panel.querySelector('#aiMessages .ai-msg');
    if(first)first.innerHTML=c.initial;
    const disclaimer=panel.querySelector('.ai-disclaimer');
    if(disclaimer)disclaimer.textContent=c.disclaimer;
  }

  if(oldUserAI){
    const wrapped=function(){
      const result=oldUserAI.apply(this,arguments);
      setTimeout(enhance,0);
      return result;
    };
    try{userAI=wrapped}catch(e){}
    window.userAI=wrapped;
  }

  const observer=new MutationObserver(()=>{
    if(document.querySelector('#userContent .ai-panel'))enhance();
  });
  observer.observe(document.body,{childList:true,subtree:true});
})();
