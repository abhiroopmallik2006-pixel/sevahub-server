/* Service-photo carousel for the public login visual + compact SevaBot launcher. */
(function(){
  const previousRenderLogin=typeof renderLogin==='function'?renderLogin:null;
  let carouselTimer=null;
  let activeIndex=0;

  authServiceVisual=function(){
    return `
      <div class="auth-visual-stage auth-service-showcase" id="authServiceShowcase">
        <div class="auth-photo-frame">
          <article class="auth-photo-slide active" data-auth-slide="0">
            <img src="https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=1200&q=82" alt="Professional home cleaning service" loading="eager">
            <div class="auth-photo-shade"></div>
            <div class="auth-photo-caption">
              <span>🧹 Cleaning</span>
              <h3>Fresh home, without the hassle.</h3>
              <p>Find nearby cleaning professionals and book at a fair price.</p>
            </div>
          </article>

          <article class="auth-photo-slide" data-auth-slide="1">
            <img src="https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=1200&q=82" alt="Electrician working on a home electrical panel" loading="lazy">
            <div class="auth-photo-shade"></div>
            <div class="auth-photo-caption">
              <span>⚡ Electrician</span>
              <h3>Skilled help, right when you need it.</h3>
              <p>Compare professionals, distance and pricing before you book.</p>
            </div>
          </article>

          <article class="auth-photo-slide" data-auth-slide="2">
            <img src="https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=1200&q=82" alt="Home repair professional doing carpentry work" loading="lazy">
            <div class="auth-photo-shade"></div>
            <div class="auth-photo-caption">
              <span>🪚 Home Repair</span>
              <h3>Local professionals for everyday repairs.</h3>
              <p>Bargain, chat and manage the complete service journey in SevaHub.</p>
            </div>
          </article>

          <div class="auth-photo-top-chip">📍 Nearby professionals</div>
          <div class="auth-photo-count-chip"><b>12+</b><span>services</span></div>
        </div>

        <div class="auth-photo-dots" aria-label="Service photos">
          <button type="button" class="active" data-auth-dot="0" aria-label="Show cleaning service"></button>
          <button type="button" data-auth-dot="1" aria-label="Show electrician service"></button>
          <button type="button" data-auth-dot="2" aria-label="Show home repair service"></button>
        </div>
      </div>`;
  };

  function showSlide(index){
    const showcase=document.getElementById('authServiceShowcase');
    if(!showcase)return;
    const slides=[...showcase.querySelectorAll('[data-auth-slide]')];
    const dots=[...showcase.querySelectorAll('[data-auth-dot]')];
    if(!slides.length)return;
    activeIndex=((Number(index)||0)+slides.length)%slides.length;
    slides.forEach((slide,i)=>slide.classList.toggle('active',i===activeIndex));
    dots.forEach((dot,i)=>dot.classList.toggle('active',i===activeIndex));
  }

  function startCarousel(){
    if(carouselTimer){clearInterval(carouselTimer);carouselTimer=null}
    const showcase=document.getElementById('authServiceShowcase');
    if(!showcase)return;
    activeIndex=0;
    showSlide(0);
    showcase.querySelectorAll('[data-auth-dot]').forEach(dot=>{
      dot.addEventListener('click',()=>{
        showSlide(Number(dot.dataset.authDot));
        if(carouselTimer)clearInterval(carouselTimer);
        carouselTimer=setInterval(()=>showSlide(activeIndex+1),4200);
      });
    });
    carouselTimer=setInterval(()=>showSlide(activeIndex+1),4200);
  }

  if(previousRenderLogin){
    renderLogin=function(app){
      const result=previousRenderLogin.apply(this,arguments);
      setTimeout(startCarousel,0);
      return result;
    };
  }

  if(!state.user){
    render();
    setTimeout(startCarousel,0);
  }
})();
