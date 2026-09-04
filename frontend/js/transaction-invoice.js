/* Downloadable SevaHub PDF transaction statements for customer spend + worker earnings history. */
(function(){
  const PLATFORM_FEE_PERCENT=2;
  let decorating=false;

  function role(){
    try{return String(state?.role||'').toUpperCase()}catch(e){return ''}
  }
  function fmtMoney(v){return Number(v||0).toFixed(2)}
  function fmtDate(value){
    if(!value)return '—';
    const d=new Date(value);
    if(Number.isNaN(d.getTime()))return String(value);
    return d.toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  }
  function bookingIdFromCard(card){
    const text=card?.textContent||'';
    const match=text.match(/Booking\s*#(\d+)/i);
    return match?Number(match[1]):0;
  }
  function invoiceRoleFromPage(){
    return document.querySelector('.earn-history-marker')?'WORKER':'USER';
  }
  async function fetchInvoiceData(bookingId,viewerRole){
    const [bookingsRes,historyRes,paymentsRes]=await Promise.all([
      api('/bookings'),
      api('/bookings/history?from=2000-01-01&to=2099-12-31'),
      api(viewerRole==='WORKER'?'/payments/worker':'/payments/my').catch(()=>({data:[]}))
    ]);
    const booking=(bookingsRes.data||[]).find(b=>Number(b.id)===Number(bookingId));
    const history=(historyRes.data?.rows||[]).find(b=>Number(b.id)===Number(bookingId));
    if(!booking&&!history)throw new Error('Transaction not found');
    const payment=(paymentsRes.data||[]).find(p=>Number(p.booking_id)===Number(bookingId))||null;
    const amount=Number(history?.final_price??booking?.final_price??booking?.original_price??0);
    const platformFee=Number(payment?.platform_fee??(amount*PLATFORM_FEE_PERCENT/100).toFixed(2));
    const workerNet=Number(payment?.worker_net_amount??Math.max(0,amount-platformFee).toFixed(2));
    const feePercent=Number(payment?.platform_fee_percent??PLATFORM_FEE_PERCENT);
    const method=String(booking?.payment_method||payment?.payment_method||'Cash');
    const paymentStatus=payment?.status||(method.toLowerCase()==='cash'?'CASH - DIRECT':'NOT RECORDED');
    return {
      bookingId:Number(bookingId),
      service:booking?.service_name||history?.service_name||'Service',
      status:String(booking?.status||'COMPLETED').replaceAll('_',' '),
      workerName:booking?.worker_user_name||history?.worker_name||'—',
      customerName:booking?.customer_name||history?.customer_name||'—',
      createdAt:booking?.created_at||null,
      scheduledDate:booking?.booking_date||history?.booking_date||null,
      scheduledTime:booking?.booking_time||null,
      completedAt:history?.completed_at||booking?.completed_at||null,
      paymentMethod:method,
      paymentStatus,
      paidAt:payment?.paid_at||null,
      receiptNumber:payment?.receipt_number||'',
      razorpayPaymentId:payment?.razorpay_payment_id||'',
      razorpayOrderId:payment?.razorpay_order_id||'',
      amount,
      platformFee,
      workerNet,
      feePercent,
      viewerRole
    };
  }

  function drawLogo(doc,x,y){
    const orange=[185,84,23];
    doc.setDrawColor(...orange);
    doc.setLineWidth(1.4);
    const r=4.2;
    doc.line(x-r,y,x+r,y);doc.line(x,y-r,x,y+r);
    doc.line(x-r*.72,y-r*.72,x+r*.72,y+r*.72);
    doc.line(x-r*.72,y+r*.72,x+r*.72,y-r*.72);
    doc.setTextColor(...orange);
    doc.setFont('helvetica','bold');
    doc.setFontSize(20);
    doc.text('SEVAHUB',x+8,y+2);
    doc.setFont('helvetica','normal');
    doc.setFontSize(8.5);
    doc.setTextColor(105,105,105);
    doc.text('COOPERATIVE HOUSEHOLD & COMMUNITY SERVICES',x+8,y+7);
  }

  function labelValue(doc,label,value,x,y,labelWidth=45){
    doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(100,100,100);doc.text(label,x,y);
    doc.setFont('helvetica','normal');doc.setTextColor(30,30,30);
    const lines=doc.splitTextToSize(String(value??'—'),120);
    doc.text(lines,x+labelWidth,y);
    return Math.max(6,lines.length*5);
  }

  function drawAmountRow(doc,label,value,y,bold=false){
    doc.setFillColor(bold?248:252,bold?240:248,bold?230:244);
    doc.roundedRect(18,y-5,174,11,2,2,'F');
    doc.setFont('helvetica',bold?'bold':'normal');
    doc.setFontSize(bold?11:10);doc.setTextColor(45,45,45);doc.text(label,23,y+1);
    doc.text(`INR ${fmtMoney(value)}`,187,y+1,{align:'right'});
  }

  async function downloadInvoice(bookingId,viewerRole){
    const jsPDF=globalThis.jspdf?.jsPDF;
    if(!jsPDF){
      const msg='PDF generator is still loading. Refresh once and try again.';
      if(typeof toast==='function')toast(msg);else alert(msg);
      return;
    }
    const button=document.querySelector(`[data-invoice-booking-id="${Number(bookingId)}"]`);
    const old=button?.textContent;
    if(button){button.disabled=true;button.textContent='Preparing PDF…'}
    try{
      const r=await fetchInvoiceData(bookingId,viewerRole);
      const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
      const orange=[185,84,23];
      drawLogo(doc,23,20);
      doc.setDrawColor(...orange);doc.setLineWidth(.8);doc.line(18,32,192,32);

      doc.setFont('helvetica','bold');doc.setFontSize(18);doc.setTextColor(35,35,35);
      doc.text(viewerRole==='WORKER'?'EARNINGS STATEMENT':'TRANSACTION INVOICE',18,44);
      doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(105,105,105);
      doc.text(`Document ref: SH-TXN-${String(r.bookingId).padStart(6,'0')}`,18,50);
      doc.text(`Generated: ${fmtDate(new Date().toISOString())}`,192,50,{align:'right'});

      doc.setFillColor(249,245,240);doc.roundedRect(18,58,174,34,3,3,'F');
      let y=66;
      y+=labelValue(doc,'Booking',`#${r.bookingId}`,23,y,34);
      y+=labelValue(doc,'Service',r.service,23,y,34);
      labelValue(doc,'Status',r.status,23,y,34);
      y=66;
      y+=labelValue(doc,viewerRole==='WORKER'?'Customer':'Worker',viewerRole==='WORKER'?r.customerName:r.workerName,108,y,30);
      y+=labelValue(doc,'Payment',`${r.paymentMethod} · ${r.paymentStatus}`,108,y,30);
      labelValue(doc,'Receipt',r.receiptNumber||'Not issued / cash record',108,y,30);

      doc.setFont('helvetica','bold');doc.setFontSize(12);doc.setTextColor(...orange);doc.text('Transaction timeline',18,105);
      doc.setDrawColor(225,225,225);doc.line(18,109,192,109);
      y=117;
      y+=labelValue(doc,'Booked',fmtDate(r.createdAt),23,y,38);
      const scheduled=[r.scheduledDate?String(r.scheduledDate).slice(0,10):'',r.scheduledTime?String(r.scheduledTime).slice(0,5):''].filter(Boolean).join(' ');
      y+=labelValue(doc,'Scheduled',scheduled||'—',23,y,38);
      y+=labelValue(doc,'Completed',fmtDate(r.completedAt),23,y,38);
      if(r.paidAt)y+=labelValue(doc,'Paid',fmtDate(r.paidAt),23,y,38);

      const moneyStart=Math.max(148,y+8);
      doc.setFont('helvetica','bold');doc.setFontSize(12);doc.setTextColor(...orange);doc.text('Amount breakdown',18,moneyStart);
      doc.setDrawColor(225,225,225);doc.line(18,moneyStart+4,192,moneyStart+4);
      drawAmountRow(doc,'Service amount',r.amount,moneyStart+14);
      drawAmountRow(doc,`SevaHub platform fee (${r.feePercent}%)`,r.platformFee,moneyStart+27);
      drawAmountRow(doc,'Worker net amount',r.workerNet,moneyStart+40,true);
      if(viewerRole==='USER')drawAmountRow(doc,'Customer total service payment',r.amount,moneyStart+53,true);

      let metaY=viewerRole==='USER'?moneyStart+70:moneyStart+57;
      doc.setFont('helvetica','bold');doc.setFontSize(10);doc.setTextColor(65,65,65);doc.text('Payment details',18,metaY);
      doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(80,80,80);
      const detailLines=[
        `Method: ${r.paymentMethod}`,
        `Payment status: ${r.paymentStatus}`,
        r.receiptNumber?`Receipt: ${r.receiptNumber}`:'',
        r.razorpayPaymentId?`Razorpay payment ID: ${r.razorpayPaymentId}`:'',
        r.razorpayOrderId?`Razorpay order ID: ${r.razorpayOrderId}`:''
      ].filter(Boolean);
      detailLines.forEach((line,i)=>doc.text(doc.splitTextToSize(line,170),18,metaY+7+i*6));

      let noteY=metaY+10+detailLines.length*6;
      if(noteY>265){doc.addPage();noteY=25}
      doc.setDrawColor(...orange);doc.line(18,noteY,192,noteY);
      doc.setFont('helvetica','normal');doc.setFontSize(8.5);doc.setTextColor(105,105,105);
      const note=r.paymentMethod.toLowerCase()==='cash'
        ?'Cash payments are settled directly between customer and worker. This PDF records the SevaHub booking amount and platform-fee breakdown.'
        :'This PDF summarizes transaction information recorded in SevaHub. It is a platform transaction statement, not a statutory tax invoice unless separately issued.';
      doc.text(doc.splitTextToSize(note,174),18,noteY+7);
      doc.setFont('helvetica','bold');doc.setTextColor(...orange);doc.text('SevaHub · Cooperative services with transparent worker earnings',18,286);
      doc.setFont('helvetica','normal');doc.setTextColor(120,120,120);doc.text(`Booking #${r.bookingId}`,192,286,{align:'right'});

      const kind=viewerRole==='WORKER'?'Earnings':'Invoice';
      doc.save(`SevaHub_${kind}_Booking_${r.bookingId}.pdf`);
      if(typeof toast==='function')toast('PDF downloaded');
    }catch(err){
      const msg=err?.message||'Could not create PDF';
      if(typeof toast==='function')toast(msg);else alert(msg);
    }finally{
      if(button?.isConnected){button.disabled=false;button.textContent=old||'Download PDF'}
    }
  }
  globalThis.downloadBookingInvoice=downloadInvoice;

  function decorateHistory(){
    if(decorating)return;
    const marker=document.querySelector('.spend-history-marker,.earn-history-marker');
    if(!marker)return;
    decorating=true;
    try{
      const viewerRole=invoiceRoleFromPage();
      marker.querySelectorAll('.history-report-row').forEach(card=>{
        const id=bookingIdFromCard(card);
        if(!id||card.querySelector('.transaction-pdf-btn'))return;
        const side=card.querySelector('.history-price-side')||card;
        const btn=document.createElement('button');
        btn.type='button';
        btn.className='btn small transaction-pdf-btn';
        btn.dataset.invoiceBookingId=String(id);
        btn.textContent='Download PDF';
        btn.addEventListener('click',e=>{
          e.preventDefault();e.stopPropagation();
          downloadInvoice(id,viewerRole);
        });
        side.appendChild(btn);
      });
    }finally{decorating=false}
  }

  function wrapHistoryFunction(name){
    try{
      const fn=globalThis[name];
      if(typeof fn!=='function'||fn.__invoiceWrapped)return;
      const wrapped=async function(){
        const result=await fn.apply(this,arguments);
        setTimeout(decorateHistory,0);
        return result;
      };
      wrapped.__invoiceWrapped=true;
      globalThis[name]=wrapped;
    }catch(e){console.warn('[Transaction PDF] wrapper skipped',name,e.message)}
  }

  wrapHistoryFunction('userSpendHistory');
  wrapHistoryFunction('workerEarnings');
  const observer=new MutationObserver(()=>{
    if(document.querySelector('.spend-history-marker,.earn-history-marker'))decorateHistory();
  });
  observer.observe(document.body,{childList:true,subtree:true});
  setTimeout(decorateHistory,500);
})();
