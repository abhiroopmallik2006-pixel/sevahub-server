const isDemo=location.protocol==='file:';
const API=isDemo?'': '/api';
const DEMO_KEY='sevahub_demo_v2';
const state={role:null,user:null,view:'home',service:null,worker:null,booking:null};
let chatSocket=null;
let activeChatBookingId=null;
let completionOtpBookingId=null;

const services=[
 {id:1,name:'Cleaning',icon:'🧹',description:'Home and office cleaning',base_price:150},
 {id:2,name:'Plumbing',icon:'🔧',description:'Repairs and installations',base_price:250},
 {id:3,name:'Electrician',icon:'⚡',description:'Electrical repair and installation',base_price:200},
 {id:4,name:'AC Repair',icon:'❄️',description:'AC repair and maintenance',base_price:500},
 {id:5,name:'Appliance Repair',icon:'🔌',description:'Home appliance repair',base_price:450},
 {id:6,name:'Beauty & Grooming',icon:'💇',description:'Professional beauty services',base_price:300},
 {id:7,name:'Painting',icon:'🎨',description:'Interior and exterior painting',base_price:450},
 {id:8,name:'Carpenter',icon:'🪚',description:'Furniture and carpentry work',base_price:350},
 {id:9,name:'Home Shifting',icon:'📦',description:'Home shifting assistance',base_price:500},
 {id:10,name:'Pest Control',icon:'🐜',description:'Professional pest control',base_price:500},
 {id:11,name:'Computer/Laptop Repair',icon:'💻',description:'Computer repair services',base_price:700},
 {id:12,name:'Other',icon:'📌',description:'Other local services',base_price:100}
];

const demoWorkers=[];
function db(){const d=JSON.parse(localStorage.getItem(DEMO_KEY)||'{"users":[],"workers":[],"bookings":[],"offers":[],"notifications":[],"reviews":[],"coins":{},"messages":[],"rewardTransactions":[],"version":3}');d.rewardTransactions=d.rewardTransactions||[];d.coins=d.coins||{};return d}
function saveDB(x){localStorage.setItem(DEMO_KEY,JSON.stringify(x))}
function seedDemo(){
 const d=db();
 if(!d.version || d.version<3){saveDB({users:[],workers:[],bookings:[],offers:[],notifications:[],reviews:[],coins:{},messages:[],version:3})}
}
seedDemo();

async function api(path,options={}){
 const token=sessionStorage.getItem('sevahub_token');
 options.headers={'Content-Type':'application/json',...(options.headers||{})};
 if(token) options.headers.Authorization='Bearer '+token;
 const r=await fetch(API+path,options);
 const data=await r.json().catch(()=>({}));
 if(!r.ok) throw new Error(data.message||'Request failed');
 return data;
}
function toast(msg){let x=document.createElement('div');x.className='toast';x.textContent=msg;document.body.appendChild(x);setTimeout(()=>x.remove(),2600)}
function money(n){return '₹'+Number(n).toLocaleString('en-IN')}
function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function monthRange(){const now=new Date();return {from:new Date(now.getFullYear(),now.getMonth(),1).toISOString().slice(0,10),to:new Date(now.getFullYear(),now.getMonth()+1,0).toISOString().slice(0,10)}}
function historyPanel(title,totalLabel,total,rows,rowRenderer,filterHandlerName,from,to){
 return `<div class="card panel">
  <div class="split"><h2>${title}</h2></div>
  <form class="history-filter" onsubmit="${filterHandlerName}(event)">
   <div class="field"><label>From</label><input id="histFrom" type="date" value="${from}"></div>
   <div class="field"><label>To</label><input id="histTo" type="date" value="${to}"></div>
   <button class="btn secondary small" type="submit">Filter</button>
  </form>
  <div class="history-total"><span class="muted">${totalLabel}</span><div class="price">${money(total)}</div></div>
  ${rows.length?rows.map(rowRenderer).join(''):'<div class="empty">No completed services in this range.</div>'}
 </div>`;
}

function initLiveChat(){
 if(isDemo || !window.io || !state.user) return;
 try{
  if(chatSocket) chatSocket.disconnect();
  chatSocket=window.io({transports:['websocket','polling']});
  chatSocket.on('connect',()=>{ chatSocket.emit('join-user-room',state.user.id); });
  chatSocket.on('booking-message',payload=>{
   if(Number(payload?.bookingId)!==Number(activeChatBookingId)) return;
   const m=payload.message||{};
   appendBookingMessage(m);
  });
  chatSocket.on('completion-otp',payload=>{
   if(state.role!=='USER') return;
   toast(`Completion OTP generated for Booking #${payload.bookingId}`);
   const content=document.getElementById('userContent');
   if(content && content.querySelector('.booking-list-marker')) userBookings();
  });
  chatSocket.on('notification:new', payload => {
  if(state.role === 'USER'){
    loadUserStats();

    const content = document.getElementById('userContent');
    if(content?.querySelector('.booking-list-marker')){
      userBookings();
    }
  }

  if(state.role === 'WORKER'){
    loadWorkerStats();
  }
});
  chatSocket.on('booking-completed',payload=>{
   if(state.role==='USER'){
    toast(`Service completed · +${Number(payload?.gems||0)} GEMS`);
    loadUserStats();
    const content=document.getElementById('userContent');
    if(content?.querySelector('.gem-wallet')) userRewards();
    else if(content?.querySelector('.spend-history-marker')) userSpendHistory();
   }else if(state.role==='WORKER'){
    loadWorkerStats();
    const content=document.getElementById('workerContent');
    if(content?.querySelector('.earn-history-marker')) workerEarnings();
   }
  });
 }catch(e){ console.warn('Live chat unavailable',e); }
}
function appendBookingMessage(m){
 const body=document.getElementById('bookingChatMessages');
 if(!body || body.dataset.bookingId!==String(m.booking_id||m.bookingId)) return;
 if(document.getElementById('chat-msg-'+m.id)) return;
 const mine=Number(m.sender_id||m.senderId)===Number(state.user.id);
 const div=document.createElement('div'); div.className='msg '+(mine?'user':'ai-msg'); div.id='chat-msg-'+m.id;
 div.innerHTML=`<b>${esc(m.sender_name||m.senderName||'')}</b><br>${esc(m.message||'')}`;
 body.appendChild(div); body.scrollTop=body.scrollHeight;
}
function render(){
 const app=document.getElementById('app');
 if(!state.role){renderLanding(app);return}
 if(!state.user){renderLogin(app);return}
 state.role==='USER'?renderUser(app):renderWorker(app);
}

function nav(title){
 return `<nav class="nav"><div class="brand">SEVAHUB</div><div class="nav-actions">
 <button class="theme" onclick="toggleTheme()">◐</button>
 <span class="pill">${esc(state.user.fullName)} · ${state.role}</span>
 <button class="btn secondary small" onclick="logout()">Logout</button></div></nav>`;
}
function renderLanding(app){
 app.innerHTML=`<div class="container"><section class="hero"><div class="brand">SEVAHUB</div><h1>Book local services.<br>On your terms.</h1><p>A two-sided service marketplace where customers find professionals and both sides can negotiate a fair price.</p>
 <div class="role-grid">
 <div class="role-card" onclick="chooseRole('USER')"><div class="role-icon">🏠</div><h2>I'm a User</h2><p class="muted">Find trusted professionals, book services and bargain for a fair price.</p><button class="btn">Continue as User →</button></div>
 <div class="role-card" onclick="chooseRole('WORKER')"><div class="role-icon">🧰</div><h2>I'm a Worker</h2><p class="muted">Offer your services, receive requests and earn from completed jobs.</p><button class="btn">Continue as Worker →</button></div>
 </div></section>
 <section class="section"><div class="grid grid-4">
 ${services.slice(0,8).map(s=>`<div class="card service-card"><div class="service-icon">${s.icon}</div><h3>${s.name}</h3><p class="muted">${s.description}</p></div>`).join('')}
 </div></section><div class="footer">© 2026 SevaHub · Marketplace MVP</div></div>`;
}
function chooseRole(r){state.role=r;render()}
function renderLogin(app){
 app.innerHTML=`<div class="container"><div class="card form"><button class="btn secondary small" onclick="state.role=null;render()">← Back</button><h2>Login as ${state.role==='USER'?'User':'Worker'}</h2><p class="muted">Use your name as username. Demo password: <b>admin</b></p>
 <form onsubmit="login(event)"><div class="field"><label>Username</label><input id="loginUser" required placeholder="Your name"></div><div class="field"><label>Password</label><input id="loginPass" type="password" required value="admin"></div><button class="btn" type="submit">Login</button></form>
 <p class="muted top-space">New here? <button class="btn secondary small" onclick="renderRegister()">Create account</button></p></div></div>`;
}
function renderRegister(){
 const worker=state.role==='WORKER';
 document.getElementById('app').innerHTML=`<div class="container"><div class="card form"><button class="btn secondary small" onclick="render()">← Back</button><h2>Create ${worker?'Worker':'User'} account</h2>
 <form onsubmit="register(event)"><div class="field"><label>Full name</label><input id="rName" required></div><div class="field"><label>Email</label><input id="rEmail" type="email" required></div><div class="field"><label>Phone</label><input id="rPhone"></div>
 ${worker?`<div class="field"><label>Service</label><select id="rService">${services.map(s=>`<option value="${s.id}">${s.icon} ${s.name}</option>`).join('')}</select></div><div class="field"><label>Starting price (₹)</label><input id="rPrice" type="number" min="1" value="600" required></div><div class="field"><label>Experience (years)</label><input id="rExp" type="number" min="0" value="1"></div><div class="field"><label>Service area</label><input id="rArea" value="Delhi NCR"></div>`:''}
 <div class="field"><label>Password</label><input id="rPass" type="password" value="admin"></div><button class="btn" type="submit">Create account</button></form></div></div>`;
}
let pendingRegistration=null;

async function register(e){
 e.preventDefault();
 const name=document.getElementById('rName').value.trim(), email=document.getElementById('rEmail').value.trim(), phone=document.getElementById('rPhone').value.trim(), pass=document.getElementById('rPass').value||'admin';
 try{
  if(!isDemo){
   // Live mode: email must be OTP-verified before the account is created.
   const worker=state.role==='WORKER'?{experience:+document.getElementById('rExp').value,serviceArea:document.getElementById('rArea').value,serviceId:+document.getElementById('rService').value,price:+document.getElementById('rPrice').value}:null;
   pendingRegistration={fullName:name,email,phone,password:pass,role:state.role,worker};
   const btn=e.target.querySelector('button[type=submit]'); if(btn){btn.disabled=true;btn.textContent='Sending code...'}
   const otpResult = await api('/auth/send-otp',{
  method:'POST',
  body:JSON.stringify({email,purpose:'REGISTER'})
});

if (otpResult.devOtp) {
  pendingRegistration.devOtp = otpResult.devOtp;
}
   toast('Verification code sent to '+email);
   renderOtpStep();
  }else{
   const d=db(), id=Date.now(), username=name;
   if(d.users.some(u=>u.username.toLowerCase()===username.toLowerCase())) return toast('That name is already used. Choose another name.');
   d.users.push({id,fullName:name,username,email,phone,role:state.role,password:pass});
   if(state.role==='WORKER'){
    const sid=+document.getElementById('rService').value, s=services.find(x=>x.id===sid), w={id,userId:id,name,serviceId:sid,service:s.name,price:+document.getElementById('rPrice').value,experience:+document.getElementById('rExp').value,rating:5,reviews:0,area:document.getElementById('rArea').value};
    d.workers.push(w);
   }else d.coins[id]=0;
   saveDB(d); state.user={id,fullName:name,username,email,role:state.role};
   toast('Account created'); render();
  }
 }catch(err){toast(err.message); const btn=document.querySelector('#app button[type=submit]'); if(btn){btn.disabled=false;btn.textContent='Create account'}}
}

function renderOtpStep(){
 document.getElementById('app').innerHTML=`<div class="container"><div class="card form">
  <button class="btn secondary small" onclick="renderRegister()">← Back</button>
  <h2>Verify your email</h2>
  <p class="muted">We sent a 6-digit code to <b>${esc(pendingRegistration.email)}</b>. Enter it below to finish creating your account.</p>
  ${pendingRegistration?.devOtp ? `
<div class="offer">
  <b>Demo verification code:</b>
  <div style="font-size:26px;font-weight:800;letter-spacing:5px;margin-top:6px">
    ${esc(pendingRegistration.devOtp)}
  </div>
  <p class="muted">Demo mode verification code</p>
</div>` : ''}
  <form onsubmit="submitOtp(event)">
   <div class="field"><label>Verification code</label><input id="otpCode" maxlength="6" inputmode="numeric" pattern="[0-9]{6}" placeholder="123456" required autofocus></div>
   <button class="btn" type="submit">Verify & create account</button>
  </form>
  <p class="muted top-space">Didn't get the code? <button class="btn secondary small" id="resendBtn" onclick="resendOtp()">Resend code</button></p>
 </div></div>`;
 document.getElementById('otpCode').focus();
}

async function submitOtp(e){
 e.preventDefault();
 const otp=document.getElementById('otpCode').value.trim();
 const btn=e.target.querySelector('button[type=submit]');
 try{
  if(btn){btn.disabled=true;btn.textContent='Verifying...'}
  await api('/auth/verify-otp',{method:'POST',body:JSON.stringify({email:pendingRegistration.email,otp,purpose:'REGISTER'})});
  await finishRegistration();
 }catch(err){
  toast(err.message);
  if(btn){btn.disabled=false;btn.textContent='Verify & create account'}
 }
}

async function resendOtp(){
 const btn=document.getElementById('resendBtn');
 try{
  if(btn){btn.disabled=true;btn.textContent='Sending...'}
  const otpResult = await api('/auth/send-otp',{
  method:'POST',
  body:JSON.stringify({
    email:pendingRegistration.email,
    purpose:'REGISTER'
  })
});

if (otpResult.devOtp) {
  pendingRegistration.devOtp = otpResult.devOtp;
  renderOtpStep();
}
  toast('A new code has been sent');
 }catch(err){toast(err.message)}
 finally{if(btn){btn.disabled=false;btn.textContent='Resend code'}}
}

async function finishRegistration(){
 const {fullName,email,phone,password,role,worker}=pendingRegistration;
 try{
  const body={fullName,email,phone,password,role};
  if(role==='WORKER'&&worker) body.experience=worker.experience,body.serviceArea=worker.serviceArea,body.services=[{serviceId:worker.serviceId,price:worker.price}];
  const r=await api('/auth/register',{method:'POST',body:JSON.stringify(body)});
  sessionStorage.setItem('sevahub_token',r.data.token); state.user=r.data.user; pendingRegistration=null;
  toast('Account created'); render();
 }catch(err){toast(err.message)}
}
async function login(e){
 e.preventDefault(); const username=document.getElementById('loginUser').value.trim(),password=document.getElementById('loginPass').value;
 try{
  if(!isDemo){
   const r=await api('/auth/login',{method:'POST',body:JSON.stringify({username,password})});
   if(r.data.user.role!==state.role) throw new Error('This account belongs to the other role.');
   sessionStorage.setItem('sevahub_token',r.data.token);state.user=r.data.user;
  }else{
   const d=db(),u=d.users.find(x=>x.username.toLowerCase()===username.toLowerCase()&&x.password===password&&x.role===state.role);
   if(!u) throw new Error('Invalid username/password for selected role.');
   state.user=u;
  }
  render(); initLiveChat();
 }catch(err){toast(err.message)}
}
function logout(){if(chatSocket){chatSocket.disconnect();chatSocket=null}activeChatBookingId=null;sessionStorage.removeItem('sevahub_token');state.user=null;state.role=null;state.view='home';render()}

function renderUser(app){
 app.innerHTML=nav('User')+`<main class="container dashboard"><div class="split"><div><h1>Good day, ${esc(state.user.fullName.split(' ')[0])} 👋</h1><p class="muted">Find a professional and negotiate a price that feels fair.</p></div></div>
 <div class="stats"><div class="card stat"><span class="muted">Active bookings</span><b id="statBookings">—</b></div><div class="card stat"><span class="muted">💎 GEMS</span><b id="statCoins">—</b></div><div class="card stat"><span class="muted">Pending bargains</span><b id="statBargains">—</b></div><div class="card stat"><span class="muted">Completed</span><b id="statCompleted">—</b></div></div>
 <div class="tabs"><button class="btn" onclick="userServices()">Services</button><button class="btn secondary" onclick="userBookings()">My Bookings</button><button class="btn secondary" onclick="userAI()">✨ AI Assistant</button><button class="btn secondary" onclick="userSpendHistory()">Spend History</button><button class="btn secondary" onclick="userRewards()">💎 GEMS</button><button class="btn secondary" onclick="userNotifications()">Notifications</button></div>
 <div id="userContent"></div></main>${chatBox()}`;
 userServices();
 loadUserStats();
}
async function loadUserStats(){
 try{
  if(isDemo){
   const d=db(),rows=d.bookings.filter(b=>b.userId===state.user.id);
   document.getElementById('statBookings').textContent=
   rows.filter(b=>['ACCEPTED','IN_PROGRESS'].includes(b.status)).length;
   document.getElementById('statCoins').textContent=d.coins[state.user.id]||0;
   document.getElementById('statBargains').textContent=d.offers.filter(o=>o.status==='PENDING'&&rows.some(b=>b.id===o.bookingId)).length;
   document.getElementById('statCompleted').textContent=rows.filter(b=>b.status==='COMPLETED').length;
  }else{
   const [bookingsRes,balanceRes]=await Promise.all([api('/bookings'),api('/rewards/balance')]);
   const rows=bookingsRes.data||[];
   document.getElementById('statBookings').textContent=rows.filter(b=>['ACCEPTED','IN_PROGRESS'].includes(b.status)).length;
   document.getElementById('statCoins').textContent=balanceRes.data.gems;
   document.getElementById('statBargains').textContent=rows.filter(b=>b.status==='BARGAINING').length;
   document.getElementById('statCompleted').textContent=rows.filter(b=>b.status==='COMPLETED').length;
  }
 }catch(e){/* stats are non-critical; fail silently */}
}
async function userServices(){
 const box=document.getElementById('userContent'); box.innerHTML=`<div class="card panel"><h2>Popular services</h2><div class="grid grid-4">${services.map(s=>`<div class="card service-card"><div class="service-icon">${s.icon}</div><h3>${s.name}</h3><p class="muted">${s.description}</p><div class="price">From ${money(s.base_price)}</div><button class="btn small" onclick="showWorkers(${s.id})">View professionals</button></div>`).join('')}</div></div>`;
}
async function showWorkers(serviceId){
 const box=document.getElementById('userContent'); const s=services.find(x=>x.id===serviceId);
 try{
  let workers;
  if(isDemo) workers=db().workers.filter(w=>w.serviceId===serviceId);
  else workers=(await api(`/services/${serviceId}/workers`)).data;
  box.innerHTML=`<div class="card panel"><div class="split"><h2>${s.icon} ${s.name} professionals</h2><button class="btn secondary small" onclick="userServices()">← Services</button></div><div class="grid grid-3">${workers.length?workers.map(w=>workerHTML(w,serviceId)).join(''):`<div class="empty">No professionals yet. A newly registered worker will appear here automatically.</div>`}</div></div>`;
 }catch(e){toast(e.message)}
}
function workerHTML(w,sid){return `<div class="card worker-card"><div class="split"><div><h3>${esc(w.name||w.full_name)}</h3><span class="pill success">✓ Verified</span></div><div>👤</div></div><p class="muted">${esc(w.experience_years??w.experience)} years experience · ${esc(w.area||w.service_area)}</p><p class="rating">★ ${w.rating||5} <span class="muted">(${w.reviews??w.total_reviews??0})</span></p><div class="price">${money(w.price??w.service_price)}</div><div class="tabs"><button class="btn small" onclick='openBooking(${JSON.stringify(w)},${sid})'>Book now</button><button class="btn secondary small" onclick='openBooking(${JSON.stringify(w)},${sid},true)'>Bargain</button></div></div>`}
function openBooking(w,sid,bargain=false){
 state.worker=w;state.service=services.find(s=>s.id===sid);
 document.getElementById('userContent').innerHTML=`<div class="card form"><button class="btn secondary small" onclick="showWorkers(${sid})">← Back</button><h2>${bargain?'Start bargain':'Book'} ${state.service.name}</h2><p>Professional: <b>${esc(w.name||w.full_name)}</b> · Listed price <b>${money(w.price??w.service_price)}</b></p>
 <form onsubmit="createBooking(event,${sid},${w.id||w.worker_id})"><div class="field"><label>Date</label><input id="bDate" type="date" required></div><div class="field"><label>Time</label><input id="bTime" type="time" required></div><div class="field"><label>Address</label><textarea id="bAddress" required placeholder="Service address"></textarea></div><div class="field"><label>Payment</label><select id="bPay"><option>Cash</option><option>UPI</option><option>Card</option></select></div><button class="btn" type="submit">Create booking & ${bargain?'open bargain':'continue'}</button></form></div>`;
}
async function createBooking(e,sid,wid){
 e.preventDefault();
 const date=document.getElementById('bDate').value,time=document.getElementById('bTime').value,address=document.getElementById('bAddress').value,pay=document.getElementById('bPay').value;
 try{
  if(isDemo){
   const d=db(),w=d.workers.find(x=>x.id===wid),id=Date.now();
   d.bookings.push({id,userId:state.user.id,workerId:wid,serviceId:sid,date,time,address,payment:pay,originalPrice:w.price,finalPrice:w.price,status:'BARGAINING',customer_tpin:null,tpin_expires_at:null});
   d.notifications.push({userId:w.userId,title:'New booking request',message:`${state.user.fullName} created a booking and can bargain.`});
   saveDB(d);state.booking=d.bookings.at(-1);toast('Booking created');showBargainDemo(state.booking);
  }else{
   const r=await api('/bookings',{method:'POST',body:JSON.stringify({workerId:wid,serviceId:sid,bookingDate:date,bookingTime:time,address,paymentMethod:pay})});
   state.booking={id:r.data.id,originalPrice:r.data.originalPrice,completionPin:r.data.completionPin};showBargainLive(r.data.id,r.data.originalPrice);
  }
 }catch(e){toast(e.message)}
}
function showBargainDemo(b){
 const d=db(), offers=d.offers.filter(o=>o.bookingId===b.id), active=offers.find(o=>o.status==='PENDING');
 const recipient=active&&active.receiverId===state.user.id;
 document.getElementById('userContent').innerHTML=`<div class="card panel"><div class="split"><div><h2>💬 Bargain with ${esc((d.workers.find(w=>w.id===b.workerId)||{}).name||'worker')}</h2><p class="muted">Listed price: ${money(b.originalPrice)}</p></div><span class="pill warning">${b.status}</span></div>${bargainHistory(offers,'USER')}${recipient?`<div class="offer"><h3>Worker offer: ${money(active.amount)}</h3><p>${esc(active.message||'')}</p><div class="tabs"><button class="btn small" onclick="respondDemoUser(${active.id},'ACCEPT')">Accept</button><button class="btn danger small" onclick="respondDemoUser(${active.id},'REJECT')">Reject</button><button class="btn secondary small" onclick="counterDemoUser(${active.id})">Counter</button></div></div>`:''}${!active?`<form onsubmit="offerDemo(event,${b.id},'USER')"><div class="field"><label>Your fair price</label><input id="offerAmount" type="number" min="1" step="1" required placeholder="e.g. ${b.originalPrice}"></div><div class="field"><label>Message (optional)</label><input id="offerMessage" placeholder="I think this is fair because..."></div><button class="btn">Send offer</button></form>`:'<p class="muted">Waiting for the active offer to be answered.</p>'}<button class="btn secondary top-space" onclick="openBookingChat(${b.id},'USER')">💬 Chat with worker</button></div>`;
}
function bargainHistory(offers,role){
 if(!offers.length)return '<div class="empty">No offers yet. Enter the price you think is fair.</div>';
 return `<div class="bargain-history">${offers.map(o=>`<div class="offer ${o.senderRole===role?'mine':''}"><b>${o.senderRole==='USER'?'Customer':'Worker'} · ${money(o.amount)}</b><span class="muted">${esc(o.message||'')} · ${o.status}</span></div>`).join('')}</div>`;
}
function offerDemo(e,bid,role){
 e.preventDefault();const amount=+document.getElementById('offerAmount').value,message=document.getElementById('offerMessage').value;
 if(!(amount>0))return toast('Enter a valid amount');
 const d=db(); d.messages=d.messages||[]; const b=d.bookings.find(x=>x.id===bid),w=d.workers.find(x=>x.id===b.workerId),sender=state.user.id,receiver=role==='USER'?w.userId:b.userId;
 d.offers.filter(x=>x.bookingId===bid&&x.status==='PENDING').forEach(x=>x.status='COUNTERED');
 d.offers.push({id:Date.now(),bookingId:bid,senderId:sender,receiverId:receiver,senderRole:role,amount,message,status:'PENDING',createdAt:new Date().toISOString()});
 d.notifications.push({userId:receiver,title:'New bargain offer',message:`${state.user.fullName} offered ${money(amount)}.`});saveDB(d);toast('Offer sent');showBargainDemo(b);
}
function respondDemoUser(oid,action){const d=db(),o=d.offers.find(x=>x.id===oid);if(!o||o.receiverId!==state.user.id)return toast('Not allowed');const b=d.bookings.find(x=>x.id===o.bookingId);o.status=action==='ACCEPT'?'ACCEPTED':'REJECTED';if(action==='ACCEPT'){b.status='ACCEPTED';b.finalPrice=o.amount;d.offers.filter(x=>x.bookingId===b.id&&x.id!==oid&&x.status==='PENDING').forEach(x=>x.status='COUNTERED');d.notifications.push({userId:b.userId,title:'Bargain accepted',message:`You accepted ₹${o.amount}.`});}else{b.status='BARGAINING';d.notifications.push({userId:b.userId,title:'Offer rejected',message:'Worker offer rejected. You can send another offer.'});}saveDB(d);toast(action==='ACCEPT'?'Offer accepted':'Offer rejected');showBargainDemo(b)}
function counterDemoUser(oid){const amount=prompt('Enter your counter-offer (₹):');if(!amount)return;const n=Number(amount);if(!(n>0))return toast('Invalid amount');const d=db(),o=d.offers.find(x=>x.id===oid),b=d.bookings.find(x=>x.id===o.bookingId);d.offers.filter(x=>x.bookingId===b.id&&x.status==='PENDING').forEach(x=>x.status='COUNTERED');d.offers.push({id:Date.now(),bookingId:b.id,senderId:state.user.id,receiverId:o.senderId,senderRole:'USER',amount:n,message:'Customer counter-offer',status:'PENDING',createdAt:new Date().toISOString()});b.status='BARGAINING';saveDB(d);toast('Counter-offer sent');showBargainDemo(b)}

async function showBargainLive(id,price){
 const box=document.getElementById('userContent');
 try{const offers=(await api(`/bargains/${id}`)).data,active=offers.find(o=>o.status==='PENDING'),isRecipient=active&&Number(active.receiver_id)===Number(state.user.id),counter=isRecipient&&active.sender_role==='WORKER';box.innerHTML=`<div class="card panel"><h2>💬 Bargain</h2><p class="muted">Listed price: ${money(price)}</p>${bargainHistory(offers,state.role)}${counter?`<div class="offer"><h3>Worker Offer: ${money(active.amount)}</h3><p>${esc(active.message||'')}</p><div class="tabs"><button class="btn small" onclick="respondOffer(${active.id},'ACCEPT')">Accept ${money(active.amount)}</button><button class="btn danger small" onclick="respondOffer(${active.id},'REJECT')">Reject</button><button class="btn secondary small" onclick="counterLiveOffer(${active.id},${id})">Counter offer</button></div></div>`:''}${!active?`<form onsubmit="offerLive(event,${id})"><div class="field"><label>Your fair price</label><input id="offerAmount" type="number" min="1" required></div><div class="field"><label>Message (optional)</label><input id="offerMessage" placeholder="Why this price?"></div><button class="btn">Send offer</button></form>`:'<p class="muted">Waiting for the other party to respond.</p>'}<button class="btn secondary top-space" onclick="openBookingChat(${id},'USER')">💬 Chat with worker</button></div>`}catch(e){toast(e.message)}
}
async function respondOffer(id,action){try{await api(`/bargains/${id}/respond`,{method:'PUT',body:JSON.stringify({action})});toast(action==='ACCEPT'?'Offer accepted':'Offer rejected');userBookings()}catch(e){toast(e.message)}}
async function offerLive(e,id){e.preventDefault();const amount=+document.getElementById('offerAmount').value;try{await api('/bargains',{method:'POST',body:JSON.stringify({bookingId:id,amount,message:document.getElementById('offerMessage')?.value||''})});toast('Offer sent');showBargainLive(id,state.booking?.originalPrice||0)}catch(e){toast(e.message)}}

async function userBookings(){
 const box=document.getElementById('userContent');
 try{
  const rows=isDemo?db().bookings.filter(b=>b.userId===state.user.id):(await api('/bookings')).data;
  box.innerHTML=`<div class="card panel booking-list-marker"><h2>My bookings</h2>${rows.length?rows.map(b=>{const price=b.finalPrice??b.final_price??b.originalPrice??b.original_price;const tpin=b.customer_tpin||b.tpin||'';const otpExpiry=b.tpin_expires_at?new Date(b.tpin_expires_at):null;const otpActive=tpin&&(!otpExpiry||otpExpiry.getTime()>Date.now());return `<div class="card panel"><div class="split"><div><h3>Booking #${b.id} · ${esc((services.find(s=>s.id===(b.serviceId||b.service_id))||{name:b.service_name}).name||b.service_name)}</h3><p class="muted">${b.date||b.booking_date||''} · ${b.time||b.booking_time||''}</p></div><div><span class="pill">${String(b.status).replaceAll('_',' ')}</span><div class="price">${money(price)}</div></div></div>${otpActive&&['ACCEPTED','IN_PROGRESS'].includes(b.status)?`<div class="offer completion-otp-card"><div class="muted">Service completion OTP</div><div class="completion-otp-code">${esc(tpin)}</div><p class="muted">Share this 6-digit OTP with the worker only after the work is actually completed.${otpExpiry?` Expires around ${otpExpiry.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}.`:''}</p></div>`:''}${b.status==='COUNTER_OFFER_PENDING_USER'?`<button class="btn small" onclick="openExistingBargain(${b.id})">Review worker counter-offer</button>`:`<button class="btn secondary small" onclick="openExistingBargain(${b.id})">Bargain / history</button><button class="btn secondary small" onclick="openBookingChat(${b.id},'USER')">💬 Chat</button>`}</div>`}).join(''):'<div class="empty">No bookings yet.</div>'}</div>`;
 }catch(e){toast(e.message)}
}
function openExistingBargain(id){if(isDemo){const b=db().bookings.find(x=>x.id===id);showBargainDemo(b)}else showBargainLive(id,0)}
async function userRewards(){
 const box=document.getElementById('userContent');
 box.innerHTML='<div class="empty">Loading GEMS...</div>';
 try{
  let gems,history;
  if(isDemo){
   const d=db();
   gems=d.coins[state.user.id]||0;
   history=(d.rewardTransactions||[]).filter(x=>x.userId===state.user.id).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  }else{
   const [balanceRes,historyRes]=await Promise.all([api('/rewards/balance'),api('/rewards/history')]);
   gems=balanceRes.data.gems; history=historyRes.data;
  }
  renderGemsWallet(box,gems,history);
 }catch(e){toast(e.message)}
}
function renderGemsWallet(box,gems,history){
 const rupeeValue=gems*2;
 box.innerHTML=`
 <div class="gem-wallet">
  <div class="gem-hero">
   <div class="gem-hero-icon">💎</div>
   <div>
    <div class="gem-hero-label">YOUR GEMS</div>
    <div class="gem-hero-value">${gems}</div>
    <div class="gem-hero-sub">≈ ₹${rupeeValue} in redemption value</div>
   </div>
  </div>
  <div class="gem-grid">
   <div class="gem-block"><div class="gem-block-icon">⛏️</div><b>Earn GEMS</b><p>Get 1 💎 for every ₹100 you spend on completed services.</p></div>
   <div class="gem-block"><div class="gem-block-icon">🔄</div><b>Redeem GEMS</b><p>1 💎 = ₹2 credit. Redeem any amount up to your balance.</p></div>
   <div class="gem-block"><div class="gem-block-icon">🏆</div><b>Level up</b><p>Keep booking services to stack more GEMS over time.</p></div>
  </div>
  <div class="card panel gem-redeem-panel">
   <h2>Redeem GEMS</h2>
   ${isDemo?'<p class="muted">Redemption is available in live (server) mode — this is a demo preview.</p>':`
   <form onsubmit="redeemGems(event,${gems})" class="gem-redeem-form">
    <div class="field"><label>GEMS to redeem (you have ${gems})</label><input id="redeemGems" type="number" min="1" max="${gems}" step="1" required placeholder="e.g. 50"></div>
    <button class="btn gem-btn" type="submit" ${gems<=0?'disabled':''}>Redeem for ₹ credit</button>
   </form>`}
  </div>
  ${history&&history.length?`<div class="card panel"><h2>History</h2>${history.map(h=>`<div class="offer"><div class="split"><b>${h.type==='REDEEM'?'−':'+'}${h.coins} 💎</b><span class="muted">${new Date(h.created_at).toLocaleDateString()}</span></div><span class="muted">${esc(h.description||'')}</span></div>`).join('')}</div>`:''}
 </div>`;
}
async function redeemGems(e,currentBalance){
 e.preventDefault();
 const gems=+document.getElementById('redeemGems').value;
 if(!(gems>0)) return toast('Enter a valid amount');
 if(gems>currentBalance) return toast(`You only have ${currentBalance} GEMS`);
 try{
  const r=await api('/rewards/redeem',{method:'POST',body:JSON.stringify({gems})});
  toast(r.message);
  loadUserStats();
  userRewards();
 }catch(e){toast(e.message)}
}
function userNotifications(){const d=db(),rows=d.notifications.filter(n=>n.userId===state.user.id);document.getElementById('userContent').innerHTML=`<div class="card panel"><h2>Notifications</h2>${rows.length?rows.reverse().map(n=>`<div class="offer"><b>${esc(n.title)}</b><div>${esc(n.message)}</div></div>`).join(''):'<div class="empty">No notifications.</div>'}</div>`}
function userAI(){
 document.getElementById('userContent').innerHTML=`<div class="card panel ai-panel">
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
}
function useAIPrompt(text){const input=document.getElementById('aiInput');if(!input)return;input.value=text;input.focus();}
function demoAI(message){
 const q=String(message).toLowerCase();
 const match=services.find(s=>q.includes(s.name.toLowerCase().split('/')[0].split(' ')[0]));
 if(q.includes('sink')||q.includes('tap')||q.includes('leak')||q.includes('pipe')) return `🔧 **Plumbing** looks like the right service. A typical local repair may start around ${money(services.find(s=>s.id===2).base_price)} in this prototype. Share a photo/details with the professional before agreeing on the final amount.`;
 if(q.includes('ac')||q.includes('cooling')) return `❄️ **AC Repair** is the likely category. The prototype starting price is around ${money(services.find(s=>s.id===4).base_price)}. Tell the technician the AC type and symptom for a better estimate.`;
 if(q.includes('fan')||q.includes('switch')||q.includes('light')||q.includes('electric')) return `⚡ **Electrician** is the likely category. Starting price here is around ${money(services.find(s=>s.id===3).base_price)}.`;
 if(q.includes('clean')) return `🧹 **Cleaning** is the likely category. The prototype starting price is around ${money(services.find(s=>s.id===1).base_price)}. You can choose one-time or recurring help when supported.`;
 if(q.includes('community')||q.includes('society')||q.includes('park')) return `🏘️ A **Community Service** request can cover shared needs such as park maintenance, common-area cleaning, lighting repair or event setup. The cooperative can coordinate multiple verified members for one community gig.`;
 if(q.includes('bargain')||q.includes('price')||q.includes('counter')) return '💰 For bargaining, compare the professional’s quoted scope, experience and the prototype’s base estimate. Send a reasonable offer; the worker can accept, reject or counter.';
 if(q.includes('booking')||q.includes('status')) return '📋 Open **My Bookings** for the latest booking state. I can also explain the status if you paste the non-sensitive details here.';
 if(q.includes('gem')||q.includes('reward')) return '💎 Completed-service spending earns GEMS in this prototype. Open the GEMS tab to see your balance and redemption options.';
 return 'I can help identify the right service, estimate a starting budget, explain bookings/bargaining, or suggest community-service ideas. Try: “Mere bathroom ka tap leak ho raha hai.”';
}
async function aiChat(e){
 e.preventDefault();
 const input=document.getElementById('aiInput'),body=document.getElementById('aiMessages'),message=input.value.trim();
 if(!message)return;
 body.innerHTML+=`<div class="msg user">${esc(message)}</div>`; input.value='';
 const typing=document.createElement('div');typing.className='msg ai-msg typing';typing.innerHTML='<span class="typing-dots">● ● ●</span> SevaHub AI is thinking…';body.appendChild(typing);body.scrollTop=body.scrollHeight;
 try{
  let answer;
  if(isDemo){ await new Promise(r=>setTimeout(r,450)); answer=demoAI(message); }
  else { const r=await api('/ai/chat',{method:'POST',body:JSON.stringify({message})}); answer=r.data.message; }
  typing.className='msg ai-msg';typing.innerHTML=esc(answer).replace(/\n/g,'<br>');
 }catch(err){typing.className='msg ai-msg';typing.textContent=`I couldn't reach the AI service right now. ${err.message}`}
 body.scrollTop=body.scrollHeight;
}

async function userSpendHistory(e){
 if(e) e.preventDefault();
 const box=document.getElementById('userContent');
 const {from:defFrom,to:defTo}=monthRange();
 const from=document.getElementById('histFrom')?.value||defFrom;
 const to=document.getElementById('histTo')?.value||defTo;
 try{
  let rows,total;
  if(isDemo){
   const d=db();
   rows=d.bookings.filter(b=>{const reportDate=String(b.completedAt||b.date||'').slice(0,10);return b.userId===state.user.id&&b.status==='COMPLETED'&&reportDate>=from&&reportDate<=to})
    .map(b=>({id:b.id,booking_date:String(b.completedAt||b.date||'').slice(0,10),final_price:b.finalPrice??b.originalPrice,service_name:(services.find(s=>s.id===b.serviceId)||{}).name,worker_name:(d.workers.find(w=>w.id===b.workerId)||{}).name}));
   total=rows.reduce((s,r)=>s+Number(r.final_price||0),0);
  }else{
   const r=await api(`/bookings/history?from=${from}&to=${to}`);
   rows=r.data.rows; total=r.data.total;
  }
  box.innerHTML=`<div class="spend-history-marker">${historyPanel('Spend history','Total spent in range',total,rows,
   r=>`<div class="offer"><div class="split"><div><b>${esc(r.service_name||'Service')}</b><p class="muted">${esc(r.worker_name||'')} · ${String(r.booking_date).slice(0,10)}</p></div><div class="price">${money(r.final_price??r.original_price)}</div></div></div>`,
   'userSpendHistory',from,to)}</div>`;
 }catch(err){toast(err.message)}
}

function renderWorker(app){
 app.innerHTML=nav('Worker')+`<main class="container dashboard"><h1>Worker Dashboard 🧰</h1><p class="muted">Manage services, requests and customer bargains.</p>
 <div class="stats"><div class="card stat"><span class="muted">Requests</span><b id="wReq">—</b></div><div class="card stat"><span class="muted">Rating</span><b>4.9 ★</b></div><div class="card stat"><span class="muted">Earnings</span><b id="wEarn">₹0</b></div><div class="card stat"><span class="muted">Bargains</span><b id="wBarg">—</b></div></div>
 <div class="tabs"><button class="btn" onclick="workerHome()">Overview</button><button class="btn secondary" onclick="workerBargains()">Bargains</button><button class="btn secondary" onclick="workerBookings()">Bookings</button><button class="btn secondary" onclick="workerEarnings()">Earnings</button><button class="btn secondary" onclick="workerProfile()">Profile</button></div><div id="workerContent"></div></main>${chatBox()}`;
 workerHome();
 loadWorkerStats();
}
async function loadWorkerStats(){
 try{
  let rows;
  if(isDemo){
   const d=db(),w=d.workers.find(x=>x.userId===state.user.id);
   rows=d.bookings.filter(b=>b.workerId===w?.id).map(b=>({...b,final_price:b.finalPrice??b.originalPrice}));
  }else rows=(await api('/bookings')).data||[];
  const completed=rows.filter(b=>b.status==='COMPLETED');
  const earnings=completed.reduce((sum,b)=>sum+Number(b.final_price??b.finalPrice??b.original_price??b.originalPrice??0),0);
  const reqEl=document.getElementById('wReq'),earnEl=document.getElementById('wEarn'),bargEl=document.getElementById('wBarg');
  if(reqEl)reqEl.textContent=rows.filter(b=>!['COMPLETED','CANCELLED','REJECTED'].includes(b.status)).length;
  if(earnEl)earnEl.textContent=money(earnings);
  if(bargEl)bargEl.textContent=rows.filter(b=>['BARGAINING','COUNTER_OFFER_PENDING_USER'].includes(b.status)).length;
 }catch(e){/* non-critical dashboard stats */}
}
async function workerHome(){
 const box=document.getElementById('workerContent');
 if(isDemo){
  const d=db(),w=d.workers.find(x=>x.userId===state.user.id);
  box.innerHTML=`<div class="grid grid-3"><div class="card panel"><h2>My service</h2><p>${esc(w?.service||'Service not set')}</p><div class="price">${money(w?.price||0)}</div></div><div class="card panel"><h2>Working area</h2><p>${esc(w?.area||'Delhi NCR')}</p><p class="muted">Flexible service area available.</p></div><div class="card panel"><h2>How bargaining works</h2><p class="muted">Customers can send a fair-price offer. Accept, reject or counter it.</p></div></div>`;
  return;
 }
 try{
  const w=(await api('/workers/me')).data||{};
  box.innerHTML=`<div class="grid grid-3"><div class="card panel"><h2>My service</h2><p>${esc(w.service_name||'Service provider')}</p><div class="price">${money(w.service_price||0)}</div></div><div class="card panel"><h2>Working area</h2><p>${esc(w.service_area||'Delhi NCR')}</p><p class="muted">Flexible service area available.</p></div><div class="card panel"><h2>How bargaining works</h2><p class="muted">Customers can send a fair-price offer. Accept, reject or counter it.</p></div></div>`;
 }catch(e){box.innerHTML=`<div class="empty">${esc(e.message)}</div>`}
}
function workerBargains(){
 const box=document.getElementById('workerContent');
 if(isDemo){
  const d=db(),my=d.workers.find(w=>w.userId===state.user.id),offers=d.offers.filter(o=>{const b=d.bookings.find(x=>x.id===o.bookingId);return b&&b.workerId===my?.id});
  box.innerHTML=`<div class="card panel"><h2>💬 Customer bargains</h2>${offers.length?offers.map(o=>{const b=d.bookings.find(x=>x.id===o.bookingId),u=d.users.find(x=>x.id===b.userId);return `<div class="card panel"><div class="split"><div><h3>${esc(u.fullName)} offered ${money(o.amount)}</h3><p class="muted">Service: ${esc(services.find(s=>s.id===b.serviceId)?.name||'Service')}</p><p>${esc(o.message||'No message')}</p></div><span class="pill ${o.status==='PENDING'?'warning':''}">${o.status}</span></div>${o.status==='PENDING'?`<div class="tabs"><button class="btn small" onclick="respondDemo(${o.id},'ACCEPT')">Accept</button><button class="btn danger small" onclick="respondDemo(${o.id},'REJECT')">Reject</button><button class="btn secondary small" onclick="counterWorker(${o.id})">Counter</button></div>`:''}</div>`}).join(''):'<div class="empty">No customer bargains yet. When a user offers a price, it will appear here automatically.</div>'}</div>`;
 }else loadWorkerBargainsLive();
}
async function loadWorkerBargainsLive(){
 try{const rows=(await api('/workers/me/bargains')).data;document.getElementById('workerContent').innerHTML=`<div class="card panel"><h2>💬 Customer bargains</h2>${rows.length?rows.map(o=>`<div class="card panel"><div class="split"><div><h3>${esc(o.customer_name)} offered ${money(o.amount)}</h3><p class="muted">${esc(o.service_name)} · original ${money(o.original_price)}</p></div><span class="pill">${o.status==='PENDING'&&o.sender_role==='WORKER'?'Counter-offer sent — waiting for user':o.status}</span></div>${o.status==='PENDING'&&o.sender_role==='USER'?`<div class="tabs"><button class="btn small" onclick="respondLive(${o.id},'ACCEPT')">Accept ${money(o.amount)}</button><button class="btn danger small" onclick="respondLive(${o.id},'REJECT')">Reject</button><button class="btn secondary small" onclick="counterLiveOffer(${o.id},${o.booking_id})">Counter offer</button><button class="btn secondary small" onclick="openBookingChat(${o.booking_id},'WORKER')">💬 Chat</button></div>`:''}</div>`).join(''):'<div class="empty">No bargains.</div>'}</div>`}catch(e){toast(e.message)}
}
function respondDemo(oid,action){const d=db(),o=d.offers.find(x=>x.id===oid);if(!o)return;o.status=action==='ACCEPT'?'ACCEPTED':'REJECTED';const b=d.bookings.find(x=>x.id===o.bookingId);if(action==='ACCEPT'){b.status='ACCEPTED';b.finalPrice=o.amount;d.offers.filter(x=>x.bookingId===b.id&&x.id!==oid&&x.status==='PENDING').forEach(x=>x.status='REJECTED')}else b.status='REJECTED';d.notifications.push({userId:b.userId,title:action==='ACCEPT'?'Bargain accepted':'Bargain rejected',message:action==='ACCEPT'?`Worker accepted ${money(o.amount)}.`:'Worker rejected your offer.'});saveDB(d);toast(action==='ACCEPT'?'Accepted':'Rejected');workerBargains()}
function counterWorker(oid){const amount=prompt('Enter your counter-offer (₹):');if(!amount)return;const n=Number(amount);if(!(n>0))return toast('Invalid amount');const d=db(),o=d.offers.find(x=>x.id===oid),b=d.bookings.find(x=>x.id===o.bookingId),w=d.workers.find(x=>x.id===b.workerId);d.offers.filter(x=>x.bookingId===b.id&&x.status==='PENDING').forEach(x=>x.status='COUNTERED');d.offers.push({id:Date.now(),bookingId:b.id,senderId:state.user.id,receiverId:b.userId,senderRole:'WORKER',amount:n,message:'Counter offer',status:'PENDING',createdAt:new Date().toISOString()});d.notifications.push({userId:b.userId,title:'Worker counter-offer',message:`${w.name} counter-offered ${money(n)}.`});saveDB(d);toast('Counter-offer sent');workerBargains()}
async function respondLive(id,action){
  try{
    await api(`/bargains/${id}/respond`,{
      method:'PUT',
      body:JSON.stringify({action})
    });

    toast(action==='ACCEPT'?'Accepted':'Rejected');

    await loadWorkerStats();
    await loadWorkerBargainsLive();

  }catch(e){
    toast(e.message);
  }
}

async function counterLiveOffer(offerId,bookingId){const amount=prompt('Enter your counter-offer (₹):');if(!amount)return;const n=Number(amount);if(!(n>0))return toast('Invalid amount');try{await api(`/bargains/${offerId}/respond`,{method:'PUT',body:JSON.stringify({action:'COUNTER',amount:n,message:'Counter offer'})});toast('Counter-offer sent — waiting for the other side');if(state.role==='WORKER')loadWorkerBargainsLive();else showBargainLive(bookingId,state.booking?.originalPrice||0)}catch(e){toast(e.message)}}
function workerBookings(){
 const box=document.getElementById('workerContent');
 if(isDemo){const d=db(),w=d.workers.find(x=>x.userId===state.user.id),rows=d.bookings.filter(b=>b.workerId===w?.id);box.innerHTML=`<div class="card panel"><h2>Bookings</h2>${rows.length?rows.map(b=>{const ready=['ACCEPTED','IN_PROGRESS'].includes(b.status),waiting=Number(completionOtpBookingId)===Number(b.id);return `<div class="offer"><div class="split"><div><b>Booking #${b.id}</b><p class="muted">${b.date} · ${b.time}</p></div><span class="pill">${b.status}</span></div>${ready&&waiting?`<div class="completion-otp-worker"><b>OTP generated in customer app</b><p class="muted">Ask the customer for the 6-digit code after the work is finished.</p><form class="otp-inline-form" onsubmit="verifyCompletionOtpDemo(event,${b.id})"><input id="workerOtp-${b.id}" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="6-digit OTP" required><button class="btn small">Verify & complete</button></form><button class="btn secondary small top-space" onclick="requestCompletionOtpDemo(${b.id})">Generate new OTP</button></div>`:''}<div class="tabs top-space">${ready&&!waiting?`<button class="btn small" onclick="requestCompletionOtpDemo(${b.id})">Generate completion OTP</button>`:''}<button class="btn secondary small" onclick="openBookingChat(${b.id},'WORKER')">💬 Chat with customer</button></div></div>`}).join(''):'<div class="empty">No bookings.</div>'}</div>`}else loadWorkerBookingsLive();
}
async function loadWorkerBookingsLive(){try{const rows=(await api('/bookings')).data;document.getElementById('workerContent').innerHTML=`<div class="card panel"><h2>Bookings</h2>${rows.map(b=>{const ready=['ACCEPTED','IN_PROGRESS'].includes(b.status),waiting=Number(completionOtpBookingId)===Number(b.id);return `<div class="offer"><div class="split"><b>#${b.id} · ${esc(b.service_name)}</b><span class="pill">${b.status}</span></div>${ready&&waiting?`<div class="completion-otp-worker"><b>OTP generated in customer app</b><p class="muted">Ask the customer for the 6-digit code after the work is finished.</p><form class="otp-inline-form" onsubmit="verifyCompletionOtpLive(event,${b.id})"><input id="workerOtp-${b.id}" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="6-digit OTP" required><button class="btn small">Verify & complete</button></form><button class="btn secondary small top-space" onclick="requestCompletionOtpLive(${b.id})">Generate new OTP</button></div>`:''}<div class="tabs top-space">${ready&&!waiting?`<button class="btn small" onclick="requestCompletionOtpLive(${b.id})">Generate completion OTP</button>`:''}<button class="btn secondary small" onclick="openBookingChat(${b.id},'WORKER')">💬 Chat with customer</button></div></div>`}).join('')||'<div class="empty">No bookings.</div>'}</div>`}catch(e){toast(e.message)}}
function requestCompletionOtpDemo(id){const d=db(),b=d.bookings.find(x=>x.id===id);if(!b)return toast('Booking not found');const otp=String(Math.floor(Math.random()*1000000)).padStart(6,'0');b.customer_tpin=otp;b.tpin_expires_at=new Date(Date.now()+10*60*1000).toISOString();d.notifications.push({userId:b.userId,title:'Completion OTP generated',message:`Open My Bookings to view the completion OTP for Booking #${b.id}.`});saveDB(d);completionOtpBookingId=id;toast('OTP generated in the customer app');workerBookings()}
function verifyCompletionOtpDemo(e,id){e.preventDefault();const d=db(),b=d.bookings.find(x=>x.id===id),pin=document.getElementById(`workerOtp-${id}`)?.value?.trim();if(!b)return toast('Booking not found');if(!/^\d{6}$/.test(pin||''))return toast('Enter the 6-digit OTP');if(new Date(b.tpin_expires_at||0).getTime()<=Date.now())return toast('OTP expired. Generate a new one.');if(String(pin)!==String(b.customer_tpin))return toast('Incorrect completion OTP');b.status='COMPLETED';b.completedAt=new Date().toISOString();b.customer_tpin=null;b.tpin_expires_at=null;completionOtpBookingId=null;const amount=Number(b.finalPrice??b.originalPrice??0),gems=Math.floor(amount/100);d.coins[b.userId]=(d.coins[b.userId]||0)+gems;d.rewardTransactions=d.rewardTransactions||[];if(gems>0&&!d.rewardTransactions.some(x=>x.bookingId===b.id&&x.type==='EARN'))d.rewardTransactions.push({id:Date.now(),userId:b.userId,bookingId:b.id,type:'EARN',coins:gems,description:`Earned ${gems} GEMS for ₹${amount} completed service`,created_at:new Date().toISOString()});d.notifications.push({userId:b.userId,title:'Service completed',message:`Your service is complete. You earned ${gems} GEMS.`});saveDB(d);toast(`Service completed · +${gems} GEMS`);loadWorkerStats();workerBookings()}
async function requestCompletionOtpLive(id){try{await api(`/bookings/${id}/request-completion-otp`,{method:'POST'});completionOtpBookingId=id;toast('OTP generated in the customer app');loadWorkerBookingsLive()}catch(e){toast(e.message)}}
async function verifyCompletionOtpLive(e,id){e.preventDefault();const pin=document.getElementById(`workerOtp-${id}`)?.value?.trim();if(!/^\d{6}$/.test(pin||''))return toast('Enter the 6-digit OTP');try{const r=await api(`/bookings/${id}/complete`,{method:'POST',body:JSON.stringify({pin})});completionOtpBookingId=null;toast(`Completed. +${r.gems} GEMS`);loadWorkerStats();loadWorkerBookingsLive()}catch(e){toast(e.message)}}
function workerProfile(){const d=db(),w=d.workers.find(x=>x.userId===state.user.id);document.getElementById('workerContent').innerHTML=`<div class="card panel"><h2>My professional profile</h2><div class="grid grid-3"><div><span class="muted">Name</span><h3>${esc(state.user.fullName)}</h3></div><div><span class="muted">Service</span><h3>${esc(w?.service||'Not set')}</h3></div><div><span class="muted">Price</span><h3>${money(w?.price||0)}</h3></div></div><p class="muted">New workers are automatically discoverable by users through their selected service.</p></div>`}

async function workerEarnings(e){
 if(e) e.preventDefault();
 const box=document.getElementById('workerContent');
 const {from:defFrom,to:defTo}=monthRange();
 const from=document.getElementById('histFrom')?.value||defFrom;
 const to=document.getElementById('histTo')?.value||defTo;
 try{
  let rows,total;
  if(isDemo){
   const d=db(),w=d.workers.find(x=>x.userId===state.user.id);
   rows=d.bookings.filter(b=>{const reportDate=String(b.completedAt||b.date||'').slice(0,10);return b.workerId===w?.id&&b.status==='COMPLETED'&&reportDate>=from&&reportDate<=to})
    .map(b=>({id:b.id,booking_date:String(b.completedAt||b.date||'').slice(0,10),final_price:b.finalPrice??b.originalPrice,service_name:(services.find(s=>s.id===b.serviceId)||{}).name,customer_name:(d.users.find(u=>u.id===b.userId)||{}).fullName}));
   total=rows.reduce((s,r)=>s+Number(r.final_price||0),0);
  }else{
   const r=await api(`/bookings/history?from=${from}&to=${to}`);
   rows=r.data.rows; total=r.data.total;
  }
  box.innerHTML=`<div class="earn-history-marker">${historyPanel('Earnings history','Total earned in range',total,rows,
   r=>`<div class="offer"><div class="split"><div><b>${esc(r.service_name||'Service')}</b><p class="muted">${esc(r.customer_name||'')} · ${String(r.booking_date).slice(0,10)}</p></div><div class="price">${money(r.final_price??r.original_price)}</div></div></div>`,
   'workerEarnings',from,to)}</div>`;
 }catch(err){toast(err.message)}
}

async function openBookingChat(bookingId,role){
 const box=document.getElementById(role==='WORKER'?'workerContent':'userContent');
 if(!box)return;
 activeChatBookingId=bookingId;
 if(!chatSocket && !isDemo) initLiveChat();
 box.innerHTML=`<div class="card panel booking-chat"><div class="split"><div><h2>💬 Chat</h2><p class="muted">Private conversation for Booking #${bookingId} · <span class="live-dot">● Live</span></p></div><button class="btn secondary small" onclick="activeChatBookingId=null;${role==='WORKER'?'workerBookings()':'userBookings()'}">← Back</button></div><div id="bookingChatMessages" data-booking-id="${bookingId}" class="chat-body"></div><form class="chat-input" onsubmit="sendBookingChat(event,${bookingId},'${role}')"><input id="bookingChatInput" maxlength="2000" autocomplete="off" placeholder="Type a message..." required><button class="btn small">Send</button></form></div>`;
 await loadBookingChat(bookingId);
}
async function loadBookingChat(bookingId){
 const body=document.getElementById('bookingChatMessages');if(!body)return;
 try{const rows=isDemo?db().messages.filter(m=>m.bookingId===bookingId):(await api(`/chat/${bookingId}`)).data;
 body.innerHTML='';
 rows.forEach(m=>appendBookingMessage(m));
 if(!rows.length)body.innerHTML='<div class="empty">No messages yet. Say hello 👋</div>';
 body.scrollTop=body.scrollHeight;
 }catch(e){body.innerHTML=`<div class="empty">Chat unavailable: ${esc(e.message)}</div>`}
}
async function sendBookingChat(e,bookingId,role){e.preventDefault();const input=document.getElementById('bookingChatInput'),message=input?.value.trim();if(!message)return;
 try{if(isDemo){const d=db();d.messages=d.messages||[];const b=d.bookings.find(x=>x.id===bookingId),w=d.workers.find(x=>x.id===b.workerId);d.messages.push({id:Date.now(),bookingId,senderId:state.user.id,receiverId:state.user.id===b.userId?w.userId:b.userId,senderName:state.user.fullName,message,createdAt:new Date().toISOString()});saveDB(d)}else await api(`/chat/${bookingId}`,{method:'POST',body:JSON.stringify({message})});input.value='';
 if(isDemo) await loadBookingChat(bookingId);
 else {
  // The server pushes the message to the other participant over Socket.IO.
  // Append our own response immediately so neither side needs to refresh.
  const body=document.getElementById('bookingChatMessages');
  if(body){ const fake={id:'local-'+Date.now(),booking_id:bookingId,sender_id:state.user.id,sender_name:state.user.fullName,message}; appendBookingMessage(fake); }
 }
 }catch(e){toast(e.message)}
}

function chatBox(){return `<div class="chat"><div id="chatBox" class="chat-box hidden"><div class="chat-head"><b>SevaBot</b><div>Instant prototype support</div></div><div id="chatBody" class="chat-body"><div class="msg">Hi! Ask me about bookings, bargaining, rewards or support.</div></div><form class="chat-input" onsubmit="chat(event)"><input id="chatInput" placeholder="Ask SevaBot..."><button class="btn small">Send</button></form></div><button class="btn" onclick="document.getElementById('chatBox').classList.toggle('hidden')">💬</button></div>`}
async function chat(e){e.preventDefault();const input=document.getElementById('chatInput');if(!input||!input.value.trim())return;const body=document.getElementById('chatBody');const q=input.value;body.innerHTML+=`<div class="msg user">${esc(q)}</div>`;input.value='';try{const answer=isDemo?demoAI(q):(await api('/ai/chat',{method:'POST',body:JSON.stringify({message:q})})).data.message;body.innerHTML+=`<div class="msg ai-msg">${esc(answer).replace(/\n/g,'<br>')}</div>`}catch(err){body.innerHTML+=`<div class="msg ai-msg">${esc(err.message)}</div>`}body.scrollTop=body.scrollHeight}
function toggleTheme(){document.body.classList.toggle('dark');localStorage.setItem('sevahub_theme',document.body.classList.contains('dark')?'dark':'light')}
if(localStorage.getItem('sevahub_theme')==='dark')document.body.classList.add('dark');
render();
