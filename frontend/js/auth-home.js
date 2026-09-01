/* Split-screen homepage/login inspired by the provided reference.
   This file intentionally overrides only the public auth screens;
   the existing dashboard, booking and backend logic remains unchanged. */

let passwordResetState=null;

function switchAuthRole(role){
  state.role=role;
  renderLogin(document.getElementById('app'));
}

function toggleAuthPassword(){
  const input=document.getElementById('loginPass');
  const button=document.getElementById('authPasswordToggle');
  if(!input)return;
  const hidden=input.type==='password';
  input.type=hidden?'text':'password';
  if(button)button.textContent=hidden?'🙈':'👁';
}

function toggleResetPassword(inputId,buttonId){
  const input=document.getElementById(inputId);
  const button=document.getElementById(buttonId);
  if(!input)return;
  const hidden=input.type==='password';
  input.type=hidden?'text':'password';
  if(button)button.textContent=hidden?'🙈':'👁';
}

function authHelp(){
  renderForgotPassword();
}

function authServiceVisual(){
  return `
    <div class="auth-visual-stage" aria-hidden="true">
      <div class="auth-orbit orbit-one"></div>
      <div class="auth-orbit orbit-two"></div>
      <div class="auth-visual-card visual-card-main">
        <div class="visual-card-head"><span></span><span></span><span></span></div>
        <div class="visual-chart-title">Nearby services</div>
        <div class="visual-bars">
          <i style="height:42%"></i><i style="height:70%"></i><i style="height:52%"></i><i style="height:88%"></i><i style="height:64%"></i>
        </div>
        <div class="visual-mini-row"><b>12+</b><span>services available</span></div>
      </div>
      <div class="auth-visual-card visual-card-left">
        <div class="visual-service-icon">🧹</div>
        <strong>Cleaning</strong>
        <small>Trusted professionals</small>
      </div>
      <div class="auth-visual-card visual-card-right">
        <div class="visual-service-icon">🔧</div>
        <strong>Home Repair</strong>
        <small>Fair prices</small>
      </div>
      <div class="auth-person person-one">🧑‍🔧</div>
      <div class="auth-person person-two">🏠</div>
      <div class="auth-floor-line"></div>
    </div>`;
}

function authPublicShell(inner){
  return `
    <main class="auth-home-shell">
      <section class="auth-login-panel">
        <div class="auth-login-inner">
          <div class="auth-brand-wrap">
            <div class="auth-logo-mark">S</div>
            <div>
              <div class="auth-brand-name">SEVAHUB</div>
              <div class="auth-brand-tag">LOCAL SERVICES, MADE SIMPLE</div>
            </div>
          </div>
          ${inner}
          <p class="auth-bottom-note">Trusted services • Fair bargaining • Secure completion OTP</p>
        </div>
      </section>
      <section class="auth-visual-panel">
        <div class="auth-visual-copy">
          <span class="auth-visual-pill">SEVAHUB MARKETPLACE</span>
          <h2>Everything your home needs,<br>in one place.</h2>
          <p>Find skilled professionals, negotiate a fair price and get the job done with confidence.</p>
        </div>
        ${authServiceVisual()}
        <div class="auth-dots"><span class="active"></span><span></span><span></span></div>
      </section>
    </main>`;
}

renderLanding=function(app){
  state.role='USER';
  renderLogin(app);
};

renderLogin=function(app){
  passwordResetState=null;
  const isUser=state.role!=='WORKER';
  app.innerHTML=authPublicShell(`
    <div class="auth-heading">
      <span class="auth-kicker">WELCOME BACK</span>
      <h1>Login</h1>
      <p>Sign in to book trusted local services or manage your work.</p>
    </div>

    <div class="auth-role-switch" role="tablist" aria-label="Choose account type">
      <button class="auth-role-tab ${isUser?'active':''}" type="button" onclick="switchAuthRole('USER')">User</button>
      <button class="auth-role-tab ${!isUser?'active':''}" type="button" onclick="switchAuthRole('WORKER')">Worker</button>
    </div>

    <form class="auth-form" onsubmit="login(event)">
      <div class="auth-field">
        <label for="loginUser">Username</label>
        <div class="auth-input-wrap">
          <span class="auth-input-icon">👤</span>
          <input id="loginUser" autocomplete="username" required placeholder="Enter your username">
        </div>
      </div>

      <div class="auth-field">
        <label for="loginPass">Password</label>
        <div class="auth-input-wrap">
          <span class="auth-input-icon">🔒</span>
          <input id="loginPass" type="password" autocomplete="current-password" required placeholder="Enter your password">
          <button id="authPasswordToggle" class="auth-eye" type="button" onclick="toggleAuthPassword()" aria-label="Show or hide password">👁</button>
        </div>
      </div>

      <button class="auth-forgot" type="button" onclick="authHelp()">Need help signing in?</button>
      <button class="auth-login-button" type="submit">Login as ${isUser?'User':'Worker'} <span>→</span></button>
    </form>

    <div class="auth-divider"><span>New to SevaHub?</span></div>
    <button class="auth-create-button" type="button" onclick="renderRegister()">Create ${isUser?'User':'Worker'} account</button>
  `);
};

function renderForgotPassword(){
  const app=document.getElementById('app');
  const role=state.role==='WORKER'?'WORKER':'USER';
  passwordResetState={role,email:'',verified:false,devOtp:null};
  app.innerHTML=authPublicShell(`
    <div class="auth-heading">
      <span class="auth-kicker">ACCOUNT RECOVERY</span>
      <h1>Reset password</h1>
      <p>Enter the Gmail/email registered with your ${role==='WORKER'?'worker':'user'} account. We will send a 6-digit OTP to that email.</p>
    </div>
    <form class="auth-form" onsubmit="sendPasswordResetOtp(event)">
      <div class="auth-field">
        <label for="resetEmail">Registered email</label>
        <div class="auth-input-wrap">
          <span class="auth-input-icon">✉️</span>
          <input id="resetEmail" type="email" autocomplete="email" required placeholder="Enter your registered Gmail/email">
        </div>
      </div>
      <button class="auth-login-button" type="submit">Send OTP <span>→</span></button>
      <button class="auth-forgot" type="button" onclick="renderLogin(document.getElementById('app'))">← Back to login</button>
    </form>
  `);
}

async function sendPasswordResetOtp(e){
  e.preventDefault();
  const email=document.getElementById('resetEmail').value.trim().toLowerCase();
  const btn=e.target.querySelector('button[type=submit]');
  try{
    if(btn){btn.disabled=true;btn.textContent='Sending OTP...'}
    const r=await api('/auth/send-otp',{method:'POST',body:JSON.stringify({email,purpose:'RESET'})});
    passwordResetState={...(passwordResetState||{}),email,verified:false,devOtp:r.devOtp||null};
    toast('OTP sent to '+email);
    renderPasswordResetOtp();
  }catch(err){
    toast(err.message);
    if(btn){btn.disabled=false;btn.innerHTML='Send OTP <span>→</span>'}
  }
}

function renderPasswordResetOtp(){
  const app=document.getElementById('app');
  const email=passwordResetState?.email||'';
  app.innerHTML=authPublicShell(`
    <div class="auth-heading">
      <span class="auth-kicker">VERIFY EMAIL</span>
      <h1>Enter OTP</h1>
      <p>Enter the 6-digit code sent to <b>${esc(email)}</b>.</p>
    </div>
    ${passwordResetState?.devOtp?`<div class="offer"><b>Demo OTP:</b> ${esc(passwordResetState.devOtp)}</div>`:''}
    <form class="auth-form" onsubmit="verifyPasswordResetOtp(event)">
      <div class="auth-field">
        <label for="resetOtp">6-digit OTP</label>
        <div class="auth-input-wrap">
          <span class="auth-input-icon">🔢</span>
          <input id="resetOtp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required placeholder="Enter 6-digit OTP">
        </div>
      </div>
      <button class="auth-login-button" type="submit">Verify OTP <span>→</span></button>
      <button class="auth-forgot" type="button" onclick="resendPasswordResetOtp()">Resend OTP</button>
      <button class="auth-forgot" type="button" onclick="renderForgotPassword()">← Change email</button>
    </form>
  `);
}

async function resendPasswordResetOtp(){
  const email=passwordResetState?.email;
  if(!email)return renderForgotPassword();
  try{
    const r=await api('/auth/send-otp',{method:'POST',body:JSON.stringify({email,purpose:'RESET'})});
    passwordResetState.devOtp=r.devOtp||null;
    toast('A new OTP was sent');
    renderPasswordResetOtp();
  }catch(err){toast(err.message)}
}

async function verifyPasswordResetOtp(e){
  e.preventDefault();
  const otp=document.getElementById('resetOtp').value.trim();
  const btn=e.target.querySelector('button[type=submit]');
  try{
    if(btn){btn.disabled=true;btn.textContent='Verifying...'}
    await api('/auth/verify-otp',{method:'POST',body:JSON.stringify({email:passwordResetState.email,otp,purpose:'RESET'})});
    passwordResetState.verified=true;
    renderNewPassword();
  }catch(err){
    toast(err.message);
    if(btn){btn.disabled=false;btn.innerHTML='Verify OTP <span>→</span>'}
  }
}

function renderNewPassword(){
  if(!passwordResetState?.verified)return renderForgotPassword();
  const app=document.getElementById('app');
  app.innerHTML=authPublicShell(`
    <div class="auth-heading">
      <span class="auth-kicker">CREATE NEW PASSWORD</span>
      <h1>New password</h1>
      <p>Your email is verified. Choose a new password with at least 6 characters.</p>
    </div>
    <form class="auth-form" onsubmit="submitNewPassword(event)">
      <div class="auth-field">
        <label for="newResetPassword">New password</label>
        <div class="auth-input-wrap">
          <span class="auth-input-icon">🔒</span>
          <input id="newResetPassword" type="password" minlength="6" autocomplete="new-password" required placeholder="Enter new password">
          <button id="newResetPasswordToggle" class="auth-eye" type="button" onclick="toggleResetPassword('newResetPassword','newResetPasswordToggle')">👁</button>
        </div>
      </div>
      <div class="auth-field">
        <label for="confirmResetPassword">Confirm new password</label>
        <div class="auth-input-wrap">
          <span class="auth-input-icon">🔒</span>
          <input id="confirmResetPassword" type="password" minlength="6" autocomplete="new-password" required placeholder="Confirm new password">
          <button id="confirmResetPasswordToggle" class="auth-eye" type="button" onclick="toggleResetPassword('confirmResetPassword','confirmResetPasswordToggle')">👁</button>
        </div>
      </div>
      <button class="auth-login-button" type="submit">Reset password <span>→</span></button>
    </form>
  `);
}

async function submitNewPassword(e){
  e.preventDefault();
  const newPassword=document.getElementById('newResetPassword').value;
  const confirm=document.getElementById('confirmResetPassword').value;
  if(newPassword!==confirm)return toast('Passwords do not match');
  const btn=e.target.querySelector('button[type=submit]');
  try{
    if(btn){btn.disabled=true;btn.textContent='Resetting...'}
    await api('/auth/reset-password',{method:'POST',body:JSON.stringify({email:passwordResetState.email,newPassword})});
    try{
      localStorage.removeItem('sevahub_token');
      localStorage.removeItem('sevahub_ui_session_v1');
      localStorage.removeItem('sevahub_ui_route_v1');
      sessionStorage.removeItem('sevahub_token');
    }catch(e){}
    const role=passwordResetState?.role==='WORKER'?'WORKER':'USER';
    passwordResetState=null;
    state.role=role;
    toast('Password reset successfully. Login with your new password.');
    renderLogin(document.getElementById('app'));
  }catch(err){
    toast(err.message);
    if(btn){btn.disabled=false;btn.innerHTML='Reset password <span>→</span>'}
  }
}

/* app.js renders once before this override file loads. Refresh the public screen. */
if(!state.user){
  render();
}
