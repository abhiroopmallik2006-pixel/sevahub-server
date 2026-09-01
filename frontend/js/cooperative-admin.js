const ADMIN_TOKEN_KEY='sevahub_admin_token_v1';
let adminToken=sessionStorage.getItem(ADMIN_TOKEN_KEY)||'';
let currentSection='summary';
let activeAdminSupportTicketId=null;

function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function money(v){return '₹'+Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:2})}
function pill(status){
  const s=String(status||'').toUpperCase();
  const cls=['VERIFIED','COMPLETED','PAID','RESOLVED','ACCEPTED'].includes(s)?'ok':['REJECTED','FAILED','CANCELLED'].includes(s)?'bad':'warn';
  return `<span class="pill ${cls}">${esc(s||'—')}</span>`;
}
async function adminApi(path,options={}){
  options.headers={'Content-Type':'application/json',...(options.headers||{})};
  if(adminToken)options.headers.Authorization='Bearer '+adminToken;
  const r=await fetch('/api/admin'+path,options);
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(data.message||'Admin request failed');
  return data;
}
function showLogin(message=''){
  closeAdminSupportChat();
  document.getElementById('adminApp').innerHTML=`<div class="admin-login"><div class="login-card"><div class="brand">SEVAHUB COOPERATIVE</div><h1>Admin access</h1><p class="muted">This area is separate from User and Worker accounts.</p><form onsubmit="adminLogin(event)"><div class="field"><label>Admin email</label><input id="adminEmail" type="email" autocomplete="username" required></div><div class="field"><label>Password</label><input id="adminPassword" type="password" autocomplete="current-password" required></div><button class="btn" type="submit">Sign in to Admin Dashboard</button></form>${message?`<div class="error">${esc(message)}</div>`:''}</div></div>`;
}
async function adminLogin(e){
  e.preventDefault();
  const btn=e.target.querySelector('button');
  try{
    btn.disabled=true;btn.textContent='Signing in…';
    const r=await adminApi('/login',{method:'POST',body:JSON.stringify({email:document.getElementById('adminEmail').value.trim(),password:document.getElementById('adminPassword').value})});
    adminToken=r.data.token;sessionStorage.setItem(ADMIN_TOKEN_KEY,adminToken);renderShell(r.data.admin.email);await openSection('summary');
  }catch(err){showLogin(err.message)}
}
function renderShell(email='Admin'){
  document.getElementById('adminApp').innerHTML=`<div class="admin-shell"><div class="topbar"><div><div class="brand">SEVAHUB COOPERATIVE</div><h1>Federation Admin Dashboard</h1></div><div class="top-actions"><span class="muted">${esc(email)}</span><button class="btn secondary small" onclick="adminLogout()">Logout</button></div></div><div class="tabs" id="adminTabs"><button class="tab active" data-section="summary" onclick="openSection('summary')">Overview</button><button class="tab" data-section="workers" onclick="openSection('workers')">Workers</button><button class="tab" data-section="bookings" onclick="openSection('bookings')">Bookings</button><button class="tab" data-section="support" onclick="openSection('support')">Support</button><button class="tab" data-section="payments" onclick="openSection('payments')">Payments</button><button class="tab" data-section="users" onclick="openSection('users')">Users</button></div><main id="adminContent"><div class="panel"><div class="empty">Loading…</div></div></main></div>`;
}
function adminLogout(){closeAdminSupportChat();adminToken='';sessionStorage.removeItem(ADMIN_TOKEN_KEY);showLogin()}
function setActive(section){document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.section===section))}
async function openSection(section){
  currentSection=section;setActive(section);
  const box=document.getElementById('adminContent');if(!box)return;
  box.innerHTML='<div class="panel"><div class="empty">Loading…</div></div>';
  try{
    if(section==='summary')return renderSummary((await adminApi('/summary')).data);
    if(section==='workers')return renderWorkers((await adminApi('/workers')).data||[]);
    if(section==='bookings')return renderBookings((await adminApi('/bookings')).data||[]);
    if(section==='support')return renderSupport((await adminApi('/support')).data||[]);
    if(section==='payments')return renderPayments((await adminApi('/payments')).data||[]);
    if(section==='users')return renderUsers((await adminApi('/users')).data||[]);
  }catch(err){
    if(/admin session|authentication|required|expired/i.test(err.message)){adminLogout();return}
    box.innerHTML=`<div class="panel"><div class="error">${esc(err.message)}</div></div>`;
  }
}
function renderSummary(d){
  document.getElementById('adminContent').innerHTML=`<div class="stats"><div class="stat"><span>Customers</span><b>${Number(d.users||0)}</b></div><div class="stat"><span>Workers</span><b>${Number(d.workers||0)}</b></div><div class="stat"><span>Total bookings</span><b>${Number(d.bookings||0)}</b></div><div class="stat"><span>Completed jobs</span><b>${Number(d.completed||0)}</b></div><div class="stat"><span>Pending worker verification</span><b>${Number(d.pendingWorkerVerification||0)}</b></div><div class="stat"><span>Open support tickets</span><b>${Number(d.openSupportTickets||0)}</b></div><div class="stat"><span>Verified payments</span><b>${money(d.paidAmount)}</b></div><div class="stat"><span>Worker net earnings</span><b>${money(d.workerNet)}</b></div></div><div class="panel"><h2>Cooperative operations</h2><p class="muted">Use Workers to approve or reject provider verification, Support to handle complaints and chat directly with customers/workers, and Bookings/Payments for platform oversight. This dashboard is not linked anywhere in the User or Worker interface.</p></div>`;
}
function renderWorkers(rows){
  const html=rows.length?rows.map(w=>`<tr><td>#${Number(w.id)}</td><td><b>${esc(w.full_name)}</b><br><span class="muted">${esc(w.email||'')}</span></td><td>${esc(w.services||'—')}</td><td>${esc(w.experience_years??0)} yr<br><span class="muted">${esc(w.service_area||'')}</span></td><td>${pill(w.verification_status)}</td><td><div class="actions"><button class="btn small" onclick="setWorkerVerification(${Number(w.id)},'VERIFIED')">Verify</button><button class="btn secondary small" onclick="setWorkerVerification(${Number(w.id)},'PENDING')">Pending</button><button class="btn danger small" onclick="setWorkerVerification(${Number(w.id)},'REJECTED')">Reject</button></div></td></tr>`).join(''):'<tr><td colspan="6"><div class="empty">No workers found.</div></td></tr>';
  document.getElementById('adminContent').innerHTML=`<div class="panel"><div class="toolbar"><h2>Worker verification</h2><span class="muted">${rows.length} workers</span></div><div class="table-wrap"><table><thead><tr><th>ID</th><th>Worker</th><th>Services</th><th>Experience / Area</th><th>Status</th><th>Admin action</th></tr></thead><tbody>${html}</tbody></table></div></div>`;
}
async function setWorkerVerification(id,status){try{await adminApi(`/workers/${id}/verification`,{method:'PUT',body:JSON.stringify({status})});await openSection('workers')}catch(e){alert(e.message)}}
function renderBookings(rows){
  const html=rows.length?rows.map(b=>`<tr><td>#${Number(b.id)}</td><td>${esc(b.service_name)}</td><td>${esc(b.customer_name)}</td><td>${esc(b.worker_name)}</td><td>${esc(String(b.booking_date||'').slice(0,10))}<br><span class="muted">${esc(b.booking_time||'')}</span></td><td>${money(b.final_price??b.original_price)}</td><td>${pill(b.status)}</td></tr>`).join(''):'<tr><td colspan="7"><div class="empty">No bookings found.</div></td></tr>';
  document.getElementById('adminContent').innerHTML=`<div class="panel"><h2>Bookings</h2><div class="table-wrap"><table><thead><tr><th>ID</th><th>Service</th><th>Customer</th><th>Worker</th><th>Schedule</th><th>Amount</th><th>Status</th></tr></thead><tbody>${html}</tbody></table></div></div>`;
}
function renderSupport(rows){
  const html=rows.length?rows.map(t=>`<tr><td>#${Number(t.id)}</td><td><b>${esc(t.subject)}</b><br><span class="muted">${esc(t.category)} · ${esc(t.role)}${Number(t.message_count||0)?` · 💬 ${Number(t.message_count)}`:''}</span></td><td>${esc(t.full_name||'')}<br><span class="muted">${esc(t.email||'')}</span></td><td>${t.booking_id?'#'+Number(t.booking_id):'—'}</td><td style="max-width:330px;white-space:normal">${esc(t.message)}</td><td>${pill(t.status)}</td><td><div class="actions"><button class="btn small" onclick="openAdminSupportChat(${Number(t.id)})">💬 Chat</button><button class="btn small" onclick="setSupportStatus(${Number(t.id)},'RESOLVED')">Resolve</button><button class="btn secondary small" onclick="setSupportStatus(${Number(t.id)},'OPEN')">Reopen</button></div></td></tr>`).join(''):'<tr><td colspan="7"><div class="empty">No support tickets.</div></td></tr>';
  document.getElementById('adminContent').innerHTML=`<div class="panel"><div class="toolbar"><h2>Support tickets</h2><button class="btn secondary small" onclick="openSection('support')">↻ Refresh</button></div><div class="table-wrap"><table><thead><tr><th>ID</th><th>Issue</th><th>Account</th><th>Booking</th><th>Original issue</th><th>Status</th><th>Admin action</th></tr></thead><tbody>${html}</tbody></table></div></div>`;
}
async function setSupportStatus(id,status){try{await adminApi(`/support/${id}/status`,{method:'PUT',body:JSON.stringify({status})});await openSection('support')}catch(e){alert(e.message)}}

function closeAdminSupportChat(){
  activeAdminSupportTicketId=null;
  document.getElementById('adminSupportChatModal')?.remove();
}
async function openAdminSupportChat(id){
  activeAdminSupportTicketId=Number(id);
  closeAdminSupportChat();
  activeAdminSupportTicketId=Number(id);
  const modal=document.createElement('div');
  modal.id='adminSupportChatModal';modal.className='admin-modal';
  modal.innerHTML=`<div class="admin-chat-card"><div class="admin-chat-head"><div><div class="brand">SUPPORT CHAT</div><h2>Ticket #${Number(id)}</h2></div><button class="btn secondary small" onclick="closeAdminSupportChat()">Close</button></div><div class="empty">Loading conversation…</div></div>`;
  document.body.appendChild(modal);
  try{await loadAdminSupportChat()}catch(e){modal.querySelector('.admin-chat-card').innerHTML=`<div class="admin-chat-head"><h2>Support chat</h2><button class="btn secondary small" onclick="closeAdminSupportChat()">Close</button></div><div class="error">${esc(e.message)}</div>`;}
}
async function loadAdminSupportChat(){
  const id=Number(activeAdminSupportTicketId);
  const modal=document.getElementById('adminSupportChatModal');
  if(!id||!modal)return;
  const r=await adminApi(`/support/${id}/messages`);
  const ticket=r.data.ticket||{},messages=r.data.messages||[];
  const messagesHtml=messages.length?messages.map(m=>{
    const admin=String(m.sender_type||'').toUpperCase()==='ADMIN';
    const when=m.created_at?new Date(m.created_at).toLocaleString():'';
    return `<div class="admin-chat-msg ${admin?'admin':'member'}"><b>${admin?'You · Admin':esc(ticket.full_name||ticket.role||'Member')}</b><div>${esc(m.message||'')}</div>${when?`<small>${esc(when)}</small>`:''}</div>`;
  }).join(''):'<div class="empty">No chat messages yet. Send the first reply below.</div>';
  modal.querySelector('.admin-chat-card').innerHTML=`<div class="admin-chat-head"><div><div class="brand">SUPPORT CHAT</div><h2>Ticket #${Number(ticket.id||id)} · ${esc(ticket.subject||'Support ticket')}</h2><p class="muted">${esc(ticket.full_name||'')} · ${esc(ticket.role||'')} · ${esc(ticket.email||'')} ${ticket.booking_id?'· Booking #'+Number(ticket.booking_id):''}</p></div><div class="actions"><button class="btn secondary small" onclick="loadAdminSupportChat()">↻ Refresh</button><button class="btn secondary small" onclick="closeAdminSupportChat()">Close</button></div></div><div class="admin-ticket-issue"><b>Original issue</b><div>${esc(ticket.message||'')}</div></div><div id="adminSupportMessages" class="admin-chat-messages">${messagesHtml}</div><form class="admin-chat-input" onsubmit="sendAdminSupportMessage(event)"><input id="adminSupportMessageInput" maxlength="1500" autocomplete="off" placeholder="Reply to ${esc(ticket.role==='WORKER'?'worker':'customer')}…" required><button class="btn" type="submit">Send reply</button></form><p class="muted admin-chat-note">No automatic polling is used. Use Refresh when needed. The member receives a SevaHub notification when you reply.</p>`;
  const body=document.getElementById('adminSupportMessages');if(body)body.scrollTop=body.scrollHeight;
}
async function sendAdminSupportMessage(e){
  e.preventDefault();
  const id=Number(activeAdminSupportTicketId),input=document.getElementById('adminSupportMessageInput');
  const message=input?.value.trim()||'';
  if(!id||!message)return;
  const btn=e.target.querySelector('button[type=submit]');
  try{
    btn.disabled=true;btn.textContent='Sending…';
    await adminApi(`/support/${id}/messages`,{method:'POST',body:JSON.stringify({message})});
    if(input)input.value='';
    await loadAdminSupportChat();
  }catch(err){alert(err.message)}finally{if(btn){btn.disabled=false;btn.textContent='Send reply'}}
}

function renderPayments(rows){
  const html=rows.length?rows.map(p=>`<tr><td>${esc(p.id)}</td><td>#${Number(p.booking_id)}</td><td>${esc(p.service_name)}</td><td>${esc(p.customer_name)} → ${esc(p.worker_name)}</td><td>${money(p.amount)}</td><td>${money(p.platform_fee)}</td><td>${money(p.worker_net_amount)}</td><td>${pill(p.status)}</td></tr>`).join(''):'<tr><td colspan="8"><div class="empty">No payment records.</div></td></tr>';
  document.getElementById('adminContent').innerHTML=`<div class="panel"><h2>Payments & worker net</h2><div class="table-wrap"><table><thead><tr><th>ID</th><th>Booking</th><th>Service</th><th>Parties</th><th>Gross</th><th>Platform fee</th><th>Worker net</th><th>Status</th></tr></thead><tbody>${html}</tbody></table></div></div>`;
}
function renderUsers(rows){
  const html=rows.length?rows.map(u=>`<tr><td>#${Number(u.id)}</td><td><b>${esc(u.full_name)}</b><br><span class="muted">${esc(u.username)}</span></td><td>${esc(u.email)}</td><td>${esc(u.phone||'—')}</td><td>${pill(u.role)}</td><td>${u.email_verified?'Yes':'No'}</td></tr>`).join(''):'<tr><td colspan="6"><div class="empty">No accounts found.</div></td></tr>';
  document.getElementById('adminContent').innerHTML=`<div class="panel"><h2>Platform accounts</h2><div class="table-wrap"><table><thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Email verified</th></tr></thead><tbody>${html}</tbody></table></div></div>`;
}
async function boot(){
  if(!adminToken)return showLogin();
  try{const r=await adminApi('/me');renderShell(r.data.email);await openSection('summary')}catch(e){adminLogout()}
}
boot();
