/* SevaHub platform language toggle + Worker AI Assistant.
   Language preference persists on this browser/app. */
(function(){
  const LANGUAGE_KEY='sevahub_language_v1';
  let language=localStorage.getItem(LANGUAGE_KEY)==='hi'?'hi':'en';
  let scheduled=false;
  const originalText=new WeakMap();
  const originalAttrs=new WeakMap();

  const exact={
    'Services':'सेवाएँ',
    'My Bookings':'मेरी बुकिंग्स',
    '✨ AI Assistant':'✨ एआई सहायक',
    'Spend History':'खर्च इतिहास',
    'Spend history':'खर्च इतिहास',
    'Notifications':'सूचनाएँ',
    'Overview':'अवलोकन',
    'Bargains':'मोलभाव',
    'Bookings':'बुकिंग्स',
    'Earnings':'कमाई',
    'Profile':'प्रोफ़ाइल',
    'Logout':'लॉगआउट',
    'Active bookings':'सक्रिय बुकिंग्स',
    'Pending bargains':'लंबित मोलभाव',
    'Completed':'पूर्ण',
    'Requests':'अनुरोध',
    'Rating':'रेटिंग',
    'Popular services':'लोकप्रिय सेवाएँ',
    'View professionals':'प्रोफेशनल देखें',
    'Book now':'अभी बुक करें',
    'Bargain':'मोलभाव',
    'Location':'स्थान',
    'Location On':'स्थान चालू',
    'Enable location':'स्थान चालू करें',
    'Stop sharing':'शेयरिंग बंद करें',
    '📍 Use my live location':'📍 मेरी लाइव लोकेशन इस्तेमाल करें',
    '📍 Live location':'📍 लाइव लोकेशन',
    '👤 Customer details':'👤 ग्राहक विवरण',
    '📍 Customer details & location':'📍 ग्राहक विवरण और लोकेशन',
    'Call customer':'ग्राहक को कॉल करें',
    'Chat':'चैट',
    '💬 Chat':'💬 चैट',
    '💬 Chat with customer':'💬 ग्राहक से चैट',
    '💬 Chat with worker':'💬 वर्कर से चैट',
    'Generate completion OTP':'कम्प्लीशन OTP बनाएँ',
    'Generate new OTP':'नया OTP बनाएँ',
    'Verify & complete':'वेरिफ़ाई करके पूरा करें',
    'Reviews':'रिव्यू',
    '⭐ Reviews':'⭐ रिव्यू',
    '⭐ See reviews':'⭐ रिव्यू देखें',
    'Worker Dashboard 🧰':'वर्कर डैशबोर्ड 🧰',
    'My professional profile':'मेरी प्रोफेशनल प्रोफ़ाइल',
    'My service':'मेरी सेवा',
    'Working area':'काम का क्षेत्र',
    'How bargaining works':'मोलभाव कैसे काम करता है',
    '💬 Customer bargains':'💬 ग्राहक मोलभाव',
    'No bookings.':'कोई बुकिंग नहीं।',
    'No bookings yet.':'अभी कोई बुकिंग नहीं।',
    'No notifications.':'कोई सूचना नहीं।',
    'No customer bargains yet. When a user offers a price, it will appear here automatically.':'अभी कोई ग्राहक मोलभाव नहीं है। यूज़र के ऑफर करते ही वह यहाँ दिखाई देगा।',
    'No bargains.':'कोई मोलभाव नहीं।',
    'Accept':'स्वीकार करें',
    'Reject':'अस्वीकार करें',
    'Counter':'काउंटर',
    'Counter offer':'काउंटर ऑफर',
    'Back':'वापस',
    '← Back':'← वापस',
    'Fair prices':'उचित कीमतें',
    'Trusted professionals':'भरोसेमंद प्रोफेशनल',
    'Nearby services':'आस-पास की सेवाएँ',
    'Login':'लॉगिन',
    'User':'यूज़र',
    'Worker':'वर्कर',
    'Username':'यूज़रनेम',
    'Password':'पासवर्ड',
    'WELCOME BACK':'वापसी पर स्वागत है',
    'New to SevaHub?':'SevaHub पर नए हैं?',
    'Need help signing in?':'साइन इन में मदद चाहिए?',
    'LOCAL SERVICES, MADE SIMPLE':'लोकल सेवाएँ, अब आसान',
    'SEVAHUB MARKETPLACE':'SEVAHUB मार्केटप्लेस',
    'Everything your home needs,':'आपके घर की हर ज़रूरत,',
    'in one place.':'एक ही जगह।',
    'Cleaning':'सफाई',
    'Plumbing':'प्लंबिंग',
    'Electrician':'इलेक्ट्रीशियन',
    'AC Repair':'एसी रिपेयर',
    'Appliance Repair':'उपकरण मरम्मत',
    'Beauty & Grooming':'ब्यूटी और ग्रूमिंग',
    'Painting':'पेंटिंग',
    'Carpenter':'बढ़ई',
    'Home Shifting':'घर शिफ्टिंग',
    'Pest Control':'कीट नियंत्रण',
    'Computer/Laptop Repair':'कंप्यूटर/लैपटॉप रिपेयर',
    'Other':'अन्य',
    'Home and office cleaning':'घर और ऑफिस की सफाई',
    'Repairs and installations':'मरम्मत और इंस्टॉलेशन',
    'Electrical repair and installation':'इलेक्ट्रिकल मरम्मत और इंस्टॉलेशन',
    'AC repair and maintenance':'एसी रिपेयर और मेंटेनेंस',
    'Home appliance repair':'घरेलू उपकरणों की मरम्मत',
    'Professional beauty services':'प्रोफेशनल ब्यूटी सेवाएँ',
    'Interior and exterior painting':'अंदर और बाहर की पेंटिंग',
    'Furniture and carpentry work':'फर्नीचर और बढ़ई का काम',
    'Home shifting assistance':'घर शिफ्टिंग सहायता',
    'Professional pest control':'प्रोफेशनल कीट नियंत्रण',
    'Computer repair services':'कंप्यूटर रिपेयर सेवाएँ',
    'Other local services':'अन्य लोकल सेवाएँ',
    '✨ AI Service Assistant':'✨ एआई सर्विस सहायक',
    'SEVAHUB INTELLIGENCE':'SEVAHUB इंटेलिजेंस',
    '🔧 Diagnose my problem':'🔧 मेरी समस्या पहचानें',
    '📋 Explain my booking':'📋 मेरी बुकिंग समझाएँ',
    '💰 Fair price':'💰 उचित कीमत',
    '🏘️ Community help':'🏘️ कम्युनिटी मदद',
    'Ask AI ✨':'AI से पूछें ✨',
    'YOUR GEMS':'आपके GEMS',
    'Earn GEMS':'GEMS कमाएँ',
    'Redeem GEMS':'GEMS रिडीम करें',
    'Level up':'लेवल बढ़ाएँ',
    'History':'इतिहास'
  };

  const placeholders={
    'Enter your username':'अपना यूज़रनेम दर्ज करें',
    'Enter your password':'अपना पासवर्ड दर्ज करें',
    'Describe your service need...':'अपनी सेवा की ज़रूरत बताएँ...',
    'Type a message...':'मैसेज लिखें...',
    'Ask SevaBot...':'SevaBot से पूछें...',
    'Service address':'सेवा का पता'
  };

  function translateText(source){
    if(language!=='hi')return source;
    const leading=(source.match(/^\s*/)||[''])[0];
    const trailing=(source.match(/\s*$/)||[''])[0];
    const core=source.trim();
    if(!core)return source;
    if(exact[core])return leading+exact[core]+trailing;

    let out=core;
    const replacements=[
      [/^Good day,\s*(.+)\s*👋$/i,'नमस्ते, $1 👋'],
      [/^Login as User$/,'यूज़र के रूप में लॉगिन'],
      [/^Login as Worker$/,'वर्कर के रूप में लॉगिन'],
      [/^Create User account$/,'यूज़र अकाउंट बनाएँ'],
      [/^Create Worker account$/,'वर्कर अकाउंट बनाएँ'],
      [/^Booking #(\d+)$/,'बुकिंग #$1'],
      [/^Booking #(\d+) · (.+)$/,'बुकिंग #$1 · $2'],
      [/^Current straight-line distance$/,'सीधी दूरी अभी'],
      [/^Open in Maps ↗$/,'मैप्स में खोलें ↗'],
      [/^📍 Open customer location in Maps ↗$/,'📍 ग्राहक की लोकेशन मैप्स में खोलें ↗'],
      [/^🗺 Open address in Maps ↗$/,'🗺 पता मैप्स में खोलें ↗'],
      [/^From (₹.+)$/,'शुरुआत $1 से'],
      [/^(.+) years experience · (.+)$/,'$1 साल का अनुभव · $2'],
      [/^Service: (.+)$/,'सेवा: $1'],
      [/^Listed price: (.+)$/,'लिस्टेड कीमत: $1'],
      [/^Original price: (.+)$/,'मूल कीमत: $1']
    ];
    for(const [rx,repl] of replacements){
      if(rx.test(out)){out=out.replace(rx,repl);break;}
    }
    return leading+out+trailing;
  }

  function shouldSkip(node){
    const p=node.parentElement;
    if(!p)return true;
    return Boolean(p.closest('script,style,textarea,.chat-body,.completion-otp-code,[data-no-translate]'));
  }

  function translateTree(root=document.body){
    if(!root)return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    let node;
    while((node=walker.nextNode())){
      if(shouldSkip(node))continue;
      if(!originalText.has(node))originalText.set(node,node.nodeValue);
      const source=originalText.get(node);
      const value=language==='hi'?translateText(source):source;
      if(node.nodeValue!==value)node.nodeValue=value;
    }

    root.querySelectorAll?.('input[placeholder],textarea[placeholder]').forEach(el=>{
      let saved=originalAttrs.get(el);
      if(!saved){saved={};originalAttrs.set(el,saved)}
      if(saved.placeholder===undefined)saved.placeholder=el.getAttribute('placeholder')||'';
      const source=saved.placeholder;
      const value=language==='hi'?(placeholders[source]||source):source;
      if(el.getAttribute('placeholder')!==value)el.setAttribute('placeholder',value);
    });
    document.documentElement.lang=language==='hi'?'hi':'en';
  }

  function languageButton(){
    let btn=document.getElementById('platformLanguageButton');
    if(!btn){
      btn=document.createElement('button');
      btn.id='platformLanguageButton';
      btn.type='button';
      btn.className='theme platform-language-btn';
      btn.dataset.noTranslate='true';
      btn.addEventListener('click',()=>{
        language=language==='en'?'hi':'en';
        localStorage.setItem(LANGUAGE_KEY,language);
        updateLanguageButton();
        translateTree(document.body);
        if(typeof toast==='function')toast(language==='hi'?'प्लेटफ़ॉर्म भाषा: हिन्दी':'Platform language: English');
      });
    }
    return btn;
  }

  function updateLanguageButton(){
    const btn=document.getElementById('platformLanguageButton');
    if(!btn)return;
    btn.textContent=language==='hi'?'🌐 English':'🌐 हिन्दी';
    btn.title=language==='hi'?'Switch platform to English':'प्लेटफ़ॉर्म हिन्दी में करें';
  }

  function placeLanguageButton(){
    const btn=languageButton();
    const actions=document.querySelector('.nav .nav-actions');
    if(actions){
      btn.classList.remove('floating-language-btn');
      if(btn.parentElement!==actions)actions.insertBefore(btn,actions.firstChild);
    }else if(document.querySelector('.auth-home-shell')){
      btn.classList.add('floating-language-btn');
      if(btn.parentElement!==document.body)document.body.appendChild(btn);
    }
    updateLanguageButton();
  }

  function workerAI(){
    const box=document.getElementById('workerContent');
    if(!box)return;
    box.innerHTML=`<div class="card panel ai-panel worker-ai-panel">
      <div class="ai-hero"><div class="ai-orb">✦</div><div><span class="ai-kicker">SEVAHUB INTELLIGENCE</span><h2>✨ AI Service Assistant</h2><p class="muted">Describe a problem in normal language. I can identify the service, suggest a budget range, explain your booking, help with bargaining, and guide you to the right cooperative professional.</p></div></div>
      <div class="ai-prompts">
       <button class="ai-chip" onclick="useAIPrompt('Mere kitchen ka sink leak kar raha hai. Kaunsi service chahiye aur approx budget kya hoga?')">🔧 Diagnose my problem</button>
       <button class="ai-chip" onclick="useAIPrompt('Mujhe apni latest booking ka status samjhao.')">📋 Explain my booking</button>
       <button class="ai-chip" onclick="useAIPrompt('Fair bargaining price kaise decide karun?')">💰 Fair price</button>
       <button class="ai-chip" onclick="useAIPrompt('Mere area ke liye community service ka example batao.')">🏘️ Community help</button>
      </div>
      <div id="aiMessages" class="chat-body ai-chat"><div class="msg ai-msg"><b>Hi! 👋</b><br>Tell me what you need at home or in your community. For example: <i>“AC cooling nahi kar raha”</i>.</div></div>
      <form class="chat-input ai-input" onsubmit="aiChat(event)"><input id="aiInput" maxlength="2000" autocomplete="off" placeholder="Describe your service need..." required><button class="btn small" type="submit">Ask AI ✨</button></form>
      <div class="ai-disclaimer">AI gives guidance and estimates only. Final service price, worker selection and safety decisions remain with the user/cooperative.</div>
     </div>`;
    try{localStorage.setItem('sevahub_ui_route_v1',JSON.stringify({view:'worker-ai'}))}catch(e){}
    translateTree(box);
  }
  window.workerAI=workerAI;

  function addWorkerAIButton(){
    if(typeof state==='undefined'||state?.role!=='WORKER'||!state?.user)return;
    const content=document.getElementById('workerContent');
    const dashboard=content?.closest('.dashboard');
    if(!dashboard||document.getElementById('workerAiTabButton'))return;
    const home=[...dashboard.querySelectorAll('button')].find(b=>String(b.getAttribute('onclick')||'').includes('workerHome()'));
    const tabs=home?.parentElement;
    if(!tabs)return;
    const btn=document.createElement('button');
    btn.id='workerAiTabButton';
    btn.type='button';
    btn.className='btn secondary';
    btn.textContent='✨ AI Assistant';
    btn.addEventListener('click',workerAI);
    const earnings=[...tabs.children].find(el=>String(el.getAttribute?.('onclick')||'').includes('workerEarnings()'));
    if(earnings)tabs.insertBefore(btn,earnings);else tabs.appendChild(btn);
  }

  function restoreWorkerAIIfNeeded(){
    if(typeof state==='undefined'||state?.role!=='WORKER'||!state?.user)return;
    try{
      const route=JSON.parse(localStorage.getItem('sevahub_ui_route_v1')||'null');
      if(route?.view==='worker-ai'&&document.getElementById('workerContent')&&!document.querySelector('.worker-ai-panel')){
        workerAI();
      }
    }catch(e){}
  }

  function refreshEnhancements(){
    placeLanguageButton();
    addWorkerAIButton();
    translateTree(document.body);
    restoreWorkerAIIfNeeded();
  }

  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;refreshEnhancements()});
  }

  const style=document.createElement('style');
  style.textContent=`
    .platform-language-btn{white-space:nowrap;font-weight:700;min-height:38px;padding:8px 12px;border-radius:12px}
    .floating-language-btn{position:fixed;z-index:9999;top:16px;right:16px;background:#fff;border:1px solid rgba(0,0,0,.12);box-shadow:0 8px 26px rgba(0,0,0,.12)}
    body.dark .floating-language-btn,.dark .floating-language-btn{background:#12191d;color:#fff;border-color:#344148}
    @media(max-width:650px){.platform-language-btn{padding:7px 9px;font-size:12px}.floating-language-btn{top:10px;right:10px}}
  `;
  document.head.appendChild(style);

  const observer=new MutationObserver(schedule);
  observer.observe(document.getElementById('app')||document.body,{childList:true,subtree:true});
  setTimeout(schedule,0);
})();
