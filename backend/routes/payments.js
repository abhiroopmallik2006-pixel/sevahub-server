const express=require('express');
const https=require('https');
const crypto=require('crypto');
const pool=require('../config');
const {auth,authorize}=require('../middleware/auth');
const {notify}=require('../utils/notifications');
const {ensureWorkerModeration}=require('../utils/workerModeration');

const router=express.Router();
const PLATFORM_FEE_PERCENT=Number(process.env.PLATFORM_FEE_PERCENT||2);

function keys(){
  return {
    id:String(process.env.RAZORPAY_KEY_ID||'').trim(),
    secret:String(process.env.RAZORPAY_KEY_SECRET||'').trim()
  };
}

function receiptNumber(id){
  return `SH-${String(id).padStart(6,'0')}`;
}

function feeBreakdown(amount){
  const total=Math.max(0,Number(amount)||0);
  const percent=Math.min(Math.max(Number(PLATFORM_FEE_PERCENT)||0,0),100);
  const platformFee=Number((total*percent/100).toFixed(2));
  const workerNet=Number(Math.max(0,total-platformFee).toFixed(2));
  return {percent,platformFee,workerNet};
}

function feePercentFromRow(row){
  const amount=Number(row.amount||0);
  const fee=Number(row.platform_fee||0);
  return amount>0?Number(((fee/amount)*100).toFixed(2)):0;
}

async function ensurePaymentsTable(){
  await pool.query(`CREATE TABLE IF NOT EXISTS payments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    booking_id INT NOT NULL UNIQUE,
    user_id INT NOT NULL,
    razorpay_order_id VARCHAR(100) UNIQUE,
    razorpay_payment_id VARCHAR(100) UNIQUE NULL,
    razorpay_signature VARCHAR(255) NULL,
    amount DECIMAL(10,2) NOT NULL,
    platform_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    worker_net_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    status ENUM('CREATED','PAID','FAILED') NOT NULL DEFAULT 'CREATED',
    payment_method VARCHAR(30) NULL,
    failure_reason VARCHAR(500) NULL,
    paid_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_payments_user_status (user_id,status)
  )`);

  const [cols]=await pool.query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments'`);
  const names=new Set(cols.map(c=>c.COLUMN_NAME));
  if(!names.has('platform_fee')) await pool.query(`ALTER TABLE payments ADD COLUMN platform_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER amount`);
  if(!names.has('worker_net_amount')) await pool.query(`ALTER TABLE payments ADD COLUMN worker_net_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER platform_fee`);
}

function razorpayRequest(method,path,body){
  const {id,secret}=keys();
  return new Promise((resolve,reject)=>{
    const payload=body?JSON.stringify(body):'';
    const req=https.request({
      hostname:'api.razorpay.com',
      port:443,
      path,
      method,
      auth:`${id}:${secret}`,
      headers:{
        'Content-Type':'application/json',
        ...(payload?{'Content-Length':Buffer.byteLength(payload)}:{})
      }
    },res=>{
      let raw='';
      res.on('data',chunk=>raw+=chunk);
      res.on('end',()=>{
        let data={};
        try{data=raw?JSON.parse(raw):{}}catch(e){return reject(new Error('Invalid response from Razorpay'))}
        if(res.statusCode>=200&&res.statusCode<300)return resolve(data);
        reject(new Error(data?.error?.description||data?.error?.reason||`Razorpay request failed (${res.statusCode})`));
      });
    });
    req.on('error',reject);
    if(payload)req.write(payload);
    req.end();
  });
}

router.get('/my',auth,authorize('USER'),async(req,res,next)=>{try{
  await ensurePaymentsTable();
  const [rows]=await pool.query(`SELECT p.id,p.booking_id,p.razorpay_order_id,p.razorpay_payment_id,p.amount,p.platform_fee,p.worker_net_amount,p.currency,p.status,p.payment_method,p.paid_at,p.created_at,p.updated_at,s.name service_name,wu.full_name worker_name
    FROM payments p
    JOIN bookings b ON b.id=p.booking_id
    JOIN services s ON s.id=b.service_id
    JOIN workers w ON w.id=b.worker_id
    JOIN users wu ON wu.id=w.user_id
    WHERE p.user_id=? ORDER BY p.created_at DESC`,[req.user.id]);
  res.json({success:true,data:rows.map(r=>({...r,receipt_number:receiptNumber(r.id),platform_fee_percent:feePercentFromRow(r)}))});
}catch(e){next(e)}});

router.get('/worker',auth,authorize('WORKER'),async(req,res,next)=>{try{
  await ensurePaymentsTable();
  const [rows]=await pool.query(`SELECT p.id,p.booking_id,p.razorpay_order_id,p.razorpay_payment_id,p.amount,p.platform_fee,p.worker_net_amount,p.currency,p.status,p.payment_method,p.paid_at,p.created_at,p.updated_at,s.name service_name,cu.full_name customer_name
    FROM payments p
    JOIN bookings b ON b.id=p.booking_id
    JOIN workers w ON w.id=b.worker_id
    JOIN users cu ON cu.id=b.user_id
    JOIN services s ON s.id=b.service_id
    WHERE w.user_id=? AND p.status='PAID'
    ORDER BY p.paid_at DESC,p.id DESC`,[req.user.id]);
  res.json({success:true,data:rows.map(r=>({...r,receipt_number:receiptNumber(r.id),platform_fee_percent:feePercentFromRow(r)}))});
}catch(e){next(e)}});

router.post('/order',auth,authorize('USER'),async(req,res,next)=>{try{
  const {id:keyId,secret}=keys();
  if(!keyId||!secret)return res.status(503).json({success:false,message:'Razorpay is not configured on the server'});

  const bookingId=Number(req.body.bookingId);
  if(!Number.isInteger(bookingId)||bookingId<1)return res.status(400).json({success:false,message:'Invalid booking'});

  await Promise.all([ensurePaymentsTable(),ensureWorkerModeration(pool)]);

  const [rows]=await pool.query(`SELECT b.id,b.user_id,b.status,b.payment_method,b.original_price,b.final_price,u.full_name,u.email,u.phone,w.is_banned,w.ban_reason
    FROM bookings b
    JOIN users u ON u.id=b.user_id
    JOIN workers w ON w.id=b.worker_id
    WHERE b.id=? AND b.user_id=?`,[bookingId,req.user.id]);
  if(!rows.length)return res.status(404).json({success:false,message:'Booking not found'});

  const booking=rows[0];
  if(String(booking.payment_method||'').toLowerCase()==='cash')return res.status(400).json({success:false,message:'This booking is set to Cash payment'});
  if(!['ACCEPTED','IN_PROGRESS','COMPLETED'].includes(booking.status))return res.status(400).json({success:false,message:'Online payment becomes available after the worker accepts the booking'});
  if(booking.status!=='COMPLETED'&&Boolean(booking.is_banned))return res.status(403).json({success:false,message:'This worker is currently restricted. Online payment is unavailable until the cooperative resolves the booking.'});

  const amountRupees=Number(booking.final_price??booking.original_price??0);
  if(!(amountRupees>0))return res.status(400).json({success:false,message:'Invalid booking amount'});
  const amountPaise=Math.round(amountRupees*100);
  if(amountPaise<100)return res.status(400).json({success:false,message:'Payment amount must be at least ₹1'});
  const {percent,platformFee,workerNet}=feeBreakdown(amountRupees);

  const [existingRows]=await pool.query('SELECT * FROM payments WHERE booking_id=? AND user_id=?',[bookingId,req.user.id]);
  const existing=existingRows[0];
  if(existing?.status==='PAID')return res.status(409).json({success:false,message:'This booking is already paid'});

  if(existing?.status==='CREATED'&&existing.razorpay_order_id&&Number(existing.amount)===amountRupees){
    await pool.query('UPDATE payments SET platform_fee=?,worker_net_amount=? WHERE id=?',[platformFee,workerNet,existing.id]);
    return res.json({success:true,data:{bookingId,keyId,orderId:existing.razorpay_order_id,amount:amountPaise,currency:'INR',name:booking.full_name,email:booking.email,contact:booking.phone||'',platformFeePercent:percent,platformFee,workerNet,reused:true}});
  }

  const order=await razorpayRequest('POST','/v1/orders',{
    amount:amountPaise,
    currency:'INR',
    receipt:`sevahub_${bookingId}_${Date.now()}`.slice(0,40),
    notes:{booking_id:String(bookingId),user_id:String(req.user.id),source:'sevahub',platform_fee_percent:String(percent),platform_fee:String(platformFee)}
  });

  await pool.query(`INSERT INTO payments(booking_id,user_id,razorpay_order_id,amount,platform_fee,worker_net_amount,currency,status,payment_method,failure_reason) VALUES(?,?,?,?,?,?,?,'CREATED',?,NULL)
    ON DUPLICATE KEY UPDATE razorpay_order_id=VALUES(razorpay_order_id),razorpay_payment_id=NULL,razorpay_signature=NULL,amount=VALUES(amount),platform_fee=VALUES(platform_fee),worker_net_amount=VALUES(worker_net_amount),currency=VALUES(currency),status='CREATED',payment_method=VALUES(payment_method),failure_reason=NULL,paid_at=NULL`,
    [bookingId,req.user.id,order.id,amountRupees,platformFee,workerNet,'INR',booking.payment_method]);

  res.status(201).json({success:true,data:{bookingId,keyId,orderId:order.id,amount:Number(order.amount||amountPaise),currency:order.currency||'INR',name:booking.full_name,email:booking.email,contact:booking.phone||'',platformFeePercent:percent,platformFee,workerNet}});
}catch(e){next(e)}});

router.post('/verify',auth,authorize('USER'),async(req,res,next)=>{try{
  const {secret}=keys();
  if(!secret)return res.status(503).json({success:false,message:'Razorpay is not configured on the server'});

  const bookingId=Number(req.body.bookingId);
  const paymentId=String(req.body.razorpay_payment_id||'').trim();
  const returnedOrderId=String(req.body.razorpay_order_id||'').trim();
  const receivedSignature=String(req.body.razorpay_signature||'').trim();
  if(!bookingId||!paymentId||!returnedOrderId||!receivedSignature)return res.status(400).json({success:false,message:'Incomplete payment verification data'});

  await ensurePaymentsTable();
  const [rows]=await pool.query('SELECT * FROM payments WHERE booking_id=? AND user_id=?',[bookingId,req.user.id]);
  if(!rows.length)return res.status(404).json({success:false,message:'Payment order not found'});
  const payment=rows[0];
  const percent=feePercentFromRow(payment);
  if(payment.status==='PAID')return res.json({success:true,message:'Payment already verified',data:{bookingId,paymentId:payment.razorpay_payment_id,status:'PAID',receiptNumber:receiptNumber(payment.id),amount:Number(payment.amount),platformFeePercent:percent,platformFee:Number(payment.platform_fee),workerNet:Number(payment.worker_net_amount)}});
  if(String(payment.razorpay_order_id)!==returnedOrderId)return res.status(400).json({success:false,message:'Payment order mismatch'});

  const expected=crypto.createHmac('sha256',secret).update(`${payment.razorpay_order_id}|${paymentId}`).digest('hex');
  let valid=false;
  try{
    const a=Buffer.from(expected,'utf8');
    const b=Buffer.from(receivedSignature,'utf8');
    valid=a.length===b.length&&crypto.timingSafeEqual(a,b);
  }catch(e){valid=false}
  if(!valid)return res.status(400).json({success:false,message:'Payment signature verification failed'});

  await pool.query(`UPDATE payments SET razorpay_payment_id=?,razorpay_signature=?,status='PAID',failure_reason=NULL,paid_at=NOW() WHERE id=?`,[paymentId,receivedSignature,payment.id]);

  const [workerRows]=await pool.query(`SELECT w.user_id FROM bookings b JOIN workers w ON w.id=b.worker_id WHERE b.id=?`,[bookingId]);
  const workerUserId=workerRows[0]?.user_id;
  if(workerUserId){
    notify(req.app,workerUserId,'Payment received',`Booking #${bookingId}: customer paid ₹${Number(payment.amount).toFixed(2)}. SevaHub platform fee ${percent}% = ₹${Number(payment.platform_fee).toFixed(2)}. Your net amount is ₹${Number(payment.worker_net_amount).toFixed(2)}.`,'PAYMENT').catch(()=>{});
  }

  res.json({success:true,message:'Payment verified successfully',data:{bookingId,paymentId,status:'PAID',receiptNumber:receiptNumber(payment.id),amount:Number(payment.amount),platformFeePercent:percent,platformFee:Number(payment.platform_fee),workerNet:Number(payment.worker_net_amount)}});
}catch(e){next(e)}});

router.post('/failed',auth,authorize('USER'),async(req,res,next)=>{try{
  await ensurePaymentsTable();
  const bookingId=Number(req.body.bookingId);
  const reason=String(req.body.reason||'Payment was not completed').slice(0,500);
  if(!bookingId)return res.status(400).json({success:false,message:'Invalid booking'});
  await pool.query(`UPDATE payments SET status='FAILED',failure_reason=? WHERE booking_id=? AND user_id=? AND status<>'PAID'`,[reason,bookingId,req.user.id]);
  res.json({success:true});
}catch(e){next(e)}});

module.exports=router;
