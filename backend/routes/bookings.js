const express=require('express');
const crypto=require('crypto');
const pool=require('../config');
const {auth,authorize}=require('../middleware/auth');
const {notify}=require('../utils/notifications');
const {assertWorkerActive,moderationByWorker}=require('../utils/workerModeration');
const router=express.Router();
const hash=pin=>crypto.createHash('sha256').update(String(pin)).digest('hex');
const makeCompletionOtp=()=>String(crypto.randomInt(0,1000000)).padStart(6,'0');
const OTP_TTL_MINUTES=10;
const fields='b.id,b.user_id,b.worker_id,b.service_id,b.booking_date,b.booking_time,b.address,b.instructions,b.original_price,b.final_price,b.payment_method,b.status,b.created_at,b.updated_at,b.completion_pin,b.customer_tpin,b.tpin_attempts,b.tpin_expires_at';

async function blockRestrictedWorker(userId,res){
 const state=await assertWorkerActive(userId,pool);
 if(state.ok)return false;
 res.status(state.moderation?403:404).json({success:false,message:state.message});
 return true;
}

router.post('/',auth,authorize('USER'),async(req,res,next)=>{try{
 const {workerId,serviceId,bookingDate,bookingTime,address,instructions='',paymentMethod='Cash'}=req.body;
 if(!workerId||!serviceId||!bookingDate||!bookingTime||!address)return res.status(400).json({success:false,message:'Complete booking details are required'});
 const moderation=await moderationByWorker(workerId,pool);
 if(!moderation)return res.status(404).json({success:false,message:'Worker not found'});
 if(moderation.isBanned)return res.status(403).json({success:false,message:'This worker is currently unavailable for new service bookings'});
 const [prices]=await pool.query('SELECT price FROM worker_services WHERE worker_id=? AND service_id=?',[workerId,serviceId]);
 if(!prices.length)return res.status(400).json({success:false,message:'Worker does not provide this service'});
 const [workers]=await pool.query('SELECT user_id FROM workers WHERE id=?',[workerId]);
 const [r]=await pool.query(`INSERT INTO bookings(user_id,worker_id,service_id,booking_date,booking_time,address,instructions,original_price,payment_method,status) VALUES(?,?,?,?,?,?,?,?,?,?)`,[req.user.id,workerId,serviceId,bookingDate,bookingTime,address,instructions,prices[0].price,paymentMethod,'PENDING']);
 await notify(req.app,workers[0].user_id,'New booking request',`A customer has requested Booking #${r.insertId}.`);
 res.status(201).json({success:true,data:{id:r.insertId,originalPrice:prices[0].price}});
}catch(e){next(e)}});

router.get('/',auth,async(req,res,next)=>{try{
 const worker=req.user.role==='WORKER'; const sql=worker?`SELECT ${fields},u.full_name customer_name,s.name service_name FROM bookings b JOIN workers w ON w.id=b.worker_id JOIN users u ON u.id=b.user_id JOIN services s ON s.id=b.service_id WHERE w.user_id=? ORDER BY b.created_at DESC`:`SELECT ${fields},u.full_name worker_user_name,s.name service_name FROM bookings b JOIN workers w ON w.id=b.worker_id JOIN users u ON u.id=w.user_id JOIN services s ON s.id=b.service_id WHERE b.user_id=? ORDER BY b.created_at DESC`;
 const [rows]=await pool.query(sql,[req.user.id]); res.json({success:true,data:rows.map(r=>{delete r.completion_pin;delete r.tpin_attempts;if(worker){delete r.customer_tpin;delete r.tpin_expires_at}else if(r.tpin_expires_at && new Date(r.tpin_expires_at).getTime()<=Date.now()){r.customer_tpin=null;r.tpin_expires_at=null}return r})});
}catch(e){next(e)}});

router.get('/history',auth,async(req,res,next)=>{try{
 const dateOk=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''));
 const from=dateOk(req.query.from)?String(req.query.from):'2000-01-01';
 const to=dateOk(req.query.to)?String(req.query.to):'2099-12-31';
 if(from>to)return res.status(400).json({success:false,message:'From date cannot be after To date'});
 let sql,params;
 if(req.user.role==='WORKER'){
  sql=`SELECT b.id,b.booking_date,b.completed_at,COALESCE(b.final_price,b.original_price) final_price,
       s.name service_name,u.full_name customer_name
       FROM bookings b
       JOIN workers w ON w.id=b.worker_id
       JOIN users u ON u.id=b.user_id
       JOIN services s ON s.id=b.service_id
       WHERE w.user_id=? AND b.status='COMPLETED'
       AND DATE(COALESCE(b.completed_at,b.booking_date)) BETWEEN ? AND ?
       ORDER BY COALESCE(b.completed_at,b.booking_date) DESC,b.id DESC`;
  params=[req.user.id,from,to];
 }else{
  sql=`SELECT b.id,b.booking_date,b.completed_at,COALESCE(b.final_price,b.original_price) final_price,
       s.name service_name,wu.full_name worker_name
       FROM bookings b
       JOIN workers w ON w.id=b.worker_id
       JOIN users wu ON wu.id=w.user_id
       JOIN services s ON s.id=b.service_id
       WHERE b.user_id=? AND b.status='COMPLETED'
       AND DATE(COALESCE(b.completed_at,b.booking_date)) BETWEEN ? AND ?
       ORDER BY COALESCE(b.completed_at,b.booking_date) DESC,b.id DESC`;
  params=[req.user.id,from,to];
 }
 const [rows]=await pool.query(sql,params);
 const total=rows.reduce((sum,row)=>sum+Number(row.final_price||0),0);
 res.json({success:true,data:{rows,total:Number(total.toFixed(2)),from,to}});
}catch(e){next(e)}});

router.post('/:id/start',auth,authorize('WORKER'),async(req,res,next)=>{try{
 if(await blockRestrictedWorker(req.user.id,res))return;
 const [r]=await pool.query(`UPDATE bookings b JOIN workers w ON w.id=b.worker_id SET b.status='IN_PROGRESS' WHERE b.id=? AND w.user_id=? AND b.status='ACCEPTED'`,[req.params.id,req.user.id]);
 if(!r.affectedRows)return res.status(400).json({success:false,message:'Only accepted assigned bookings can be started'});res.json({success:true,message:'Service started'});
}catch(e){next(e)}});

router.post('/:id/request-completion-otp',auth,authorize('WORKER'),async(req,res,next)=>{try{
 if(await blockRestrictedWorker(req.user.id,res))return;
 const [rows]=await pool.query(`SELECT b.id,b.user_id,b.status FROM bookings b JOIN workers w ON w.id=b.worker_id WHERE b.id=? AND w.user_id=?`,[req.params.id,req.user.id]);
 if(!rows.length)return res.status(404).json({success:false,message:'Booking not found'});
 const b=rows[0];
 if(!['ACCEPTED','IN_PROGRESS'].includes(b.status))return res.status(400).json({success:false,message:'Booking is not ready for completion'});
 const otp=makeCompletionOtp();
 const expiresAt=new Date(Date.now()+OTP_TTL_MINUTES*60*1000);
 await pool.query('UPDATE bookings SET completion_pin=?,customer_tpin=?,tpin_attempts=0,tpin_expires_at=? WHERE id=?',[hash(otp),otp,expiresAt,b.id]);
 await notify(req.app,b.user_id,'Completion OTP generated',`A completion OTP was generated for Booking #${b.id}. Open My Bookings to view it and share it only after the service is finished.`,'BOOKING');
 req.app.get('io').to(`user-${b.user_id}`).emit('completion-otp',{bookingId:b.id,otp,expiresAt:expiresAt.toISOString()});
 res.json({success:true,message:`OTP generated in the customer's app. It is valid for ${OTP_TTL_MINUTES} minutes.`,data:{bookingId:b.id,expiresAt:expiresAt.toISOString()}});
}catch(e){next(e)}});

router.post('/:id/complete',auth,authorize('WORKER'),async(req,res,next)=>{
 try{if(await blockRestrictedWorker(req.user.id,res))return}catch(e){return next(e)}
 const conn=await pool.getConnection();try{
  const tpin=String(req.body.tpin||req.body.pin||'');if(!/^\d{6}$/.test(tpin))return res.status(400).json({success:false,message:'Enter the 6-digit completion OTP shown in the customer app'});
  const [rows]=await conn.query(`SELECT b.* FROM bookings b JOIN workers w ON w.id=b.worker_id WHERE b.id=? AND w.user_id=? FOR UPDATE`,[req.params.id,req.user.id]);if(!rows.length)return res.status(404).json({success:false,message:'Booking not found'});const b=rows[0];
  if(!['ACCEPTED','IN_PROGRESS'].includes(b.status))return res.status(400).json({success:false,message:'Booking is not ready for completion'});if(Number(b.tpin_attempts)>=5)return res.status(429).json({success:false,message:'Too many incorrect OTP attempts. Generate a new completion OTP.'});
  if(!b.completion_pin||!b.customer_tpin||!b.tpin_expires_at)return res.status(400).json({success:false,message:'Generate a completion OTP first'});
  if(new Date(b.tpin_expires_at).getTime()<=Date.now()){await conn.query('UPDATE bookings SET completion_pin=NULL,customer_tpin=NULL,tpin_attempts=0,tpin_expires_at=NULL WHERE id=?',[b.id]);return res.status(400).json({success:false,message:'Completion OTP expired. Generate a new one.'});}
  if(!crypto.timingSafeEqual(Buffer.from(hash(tpin)),Buffer.from(b.completion_pin))){await conn.query('UPDATE bookings SET tpin_attempts=tpin_attempts+1 WHERE id=?',[b.id]);return res.status(400).json({success:false,message:'Incorrect completion OTP'});}
  const amount=Number(b.final_price||b.original_price||0);
  const gems=Math.floor(amount/100);
  await conn.beginTransaction();
  await conn.query("UPDATE bookings SET status='COMPLETED',completed_at=NOW(),completion_pin=NULL,customer_tpin=NULL,tpin_attempts=0,tpin_expires_at=NULL WHERE id=?",[b.id]);
  if(gems>0){
   await conn.query(`INSERT INTO reward_transactions(user_id,booking_id,type,coins,description)
     SELECT ?,?,'EARN',?,?
     WHERE NOT EXISTS (SELECT 1 FROM reward_transactions WHERE booking_id=? AND type='EARN')`,
     [b.user_id,b.id,gems,`Earned ${gems} GEMS for ₹${amount} completed service`,b.id]);
  }
  await conn.commit();
  notify(req.app,b.user_id,'Service completed',`Booking #${b.id} completed. You earned ${gems} GEMS.`,'BOOKING').catch(()=>{});
  const io=req.app.get('io');
  if(io){
   io.to(`user-${b.user_id}`).emit('booking-completed',{bookingId:b.id,gems,amount});
   io.to(`user-${req.user.id}`).emit('booking-completed',{bookingId:b.id,gems,amount});
  }
  res.json({success:true,message:'Service completed',gems,amount});
 }catch(e){await conn.rollback().catch(()=>{});next(e)}finally{conn.release()}
});
module.exports=router;
