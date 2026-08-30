/* Split-screen homepage/login inspired by the provided reference.
   This file intentionally overrides only the public auth screens;
   the existing dashboard, booking and backend logic remains unchanged. */

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

function authHelp(){
  toast('Use your registered username and password to sign in.');
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

renderLanding=function(app){
  state.role='USER';
  renderLogin(app);
};

renderLogin=function(app){
  const isUser=state.role!=='WORKER';
  app.innerHTML=`
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
};

/* app.js renders once before this override file loads. Refresh the public screen. */
if(!state.user){
  render();
}
