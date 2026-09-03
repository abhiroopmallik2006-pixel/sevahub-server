const express=require('express');
const pool=require('../config');
const {auth}=require('../middleware/auth');
const {notify}=require('../utils/notifications');
const {assertWorkerActive,ensureWorkerModeration,moderationByWorker}=require('../utils/workerModeration');
const router=express.Router();

async function booking(id,userId){
  const [r]=await pool.query(`
    SELECT b.*,wu.id worker_user_id
    FROM bookings b
    JOIN workers w ON w.id=b.worker_id
    JOIN users wu ON wu.id=w.user_id
    WHERE b.id=? AND (b.user_id=? OR wu.id=?)`,[id,userId,userId]);
  return r[0];
}

async function blockRestrictedWorker(req,res){
  if(req.user.role!=='WORKER')return false;
  const state=await assertWorkerActive(req.user.id,pool);
  if(state.ok)return false;
  res.status(state.moderation?403:404).json({success:false,message:state.message});
  return true;
}

async function blockBookingWorker(workerId,res){
  const moderation=await moderationByWorker(workerId,pool);
  if(!moderation)return false;
  if(!moderation.isBanned)return false;
  res.status(403).json({success:false,message:'This worker is currently restricted, so bargaining cannot continue.'});
  return true;
}

router.get('/:bookingId',auth,async(req,res,next)=>{
  try{
    const b=await booking(req.params.bookingId,req.user.id);
    if(!b)return res.status(404).json({success:false,message:'Booking not found'});
    const [rows]=await pool.query('SELECT * FROM bargain_offers WHERE booking_id=? ORDER BY created_at ASC',[b.id]);
    res.json({success:true,data:rows});
  }catch(e){next(e)}
});

router.post('/',auth,async(req,res,next)=>{
  try{
    await ensureWorkerModeration(pool);
    if(await blockRestrictedWorker(req,res))return;
    const b=await booking(req.body.bookingId,req.user.id),amount=Number(req.body.amount);
    if(!b)return res.status(404).json({success:false,message:'Booking not found'});
    if(await blockBookingWorker(b.worker_id,res))return;
    if(!Number.isFinite(amount)||amount<=0)return res.status(400).json({success:false,message:'Enter a valid amount'});
    if(['ACCEPTED','COMPLETED','CANCELLED','IN_PROGRESS'].includes(b.status))return res.status(400).json({success:false,message:'Bargaining is closed'});

    const sender=req.user.role==='USER'?b.user_id:b.worker_user_id;
    if(sender!==req.user.id)return res.status(403).json({success:false,message:'Not allowed'});
    const receiver=req.user.role==='USER'?b.worker_user_id:b.user_id;

    const [pending]=await pool.query("SELECT id FROM bargain_offers WHERE booking_id=? AND status='PENDING'",[b.id]);
    if(pending.length)return res.status(400).json({success:false,message:'Wait for the other party to respond to the active offer'});

    const [r]=await pool.query(
      "INSERT INTO bargain_offers(booking_id,sender_id,receiver_id,sender_role,amount,message,status) VALUES(?,?,?,?,?,?, 'PENDING')",
      [b.id,sender,receiver,req.user.role,amount,String(req.body.message||'').slice(0,500)]
    );
    const status=req.user.role==='WORKER'?'COUNTER_OFFER_PENDING_USER':'BARGAINING';
    await pool.query('UPDATE bookings SET status=? WHERE id=?',[status,b.id]);
    await notify(req.app,receiver,
      req.user.role==='WORKER'?'Worker counter-offer':'New price proposal',
      req.user.role==='WORKER'?`Worker has sent a counter-offer of ₹${amount} for Booking #${b.id}.`:`New price proposal received for Booking #${b.id}.`,
      'BARGAIN');
    res.status(201).json({success:true,data:{id:r.insertId,amount,status}});
  }catch(e){next(e)}
});

router.put('/:id/respond',auth,async(req,res,next)=>{
  try{
    await ensureWorkerModeration(pool);
    if(await blockRestrictedWorker(req,res))return;
  }catch(e){return next(e)}
  const conn=await pool.getConnection();
  try{
    const action=String(req.body.action||'').toUpperCase();
    if(!['ACCEPT','REJECT','COUNTER'].includes(action))return res.status(400).json({success:false,message:'Invalid action'});

    const counterAmount=Number(req.body.amount);
    if(action==='COUNTER'&&(!Number.isFinite(counterAmount)||counterAmount<=0)){
      return res.status(400).json({success:false,message:'Enter a valid counter-offer amount'});
    }

    await conn.beginTransaction();
    const [rows]=await conn.query('SELECT * FROM bargain_offers WHERE id=? FOR UPDATE',[req.params.id]);
    if(!rows.length){await conn.rollback();return res.status(404).json({success:false,message:'Offer not found'});}

    const o=rows[0];
    if(Number(o.receiver_id)!==Number(req.user.id)){
      await conn.rollback();
      return res.status(403).json({success:false,message:'Only the recipient can respond to this offer'});
    }
    if(o.status!=='PENDING'){
      await conn.rollback();
      return res.status(400).json({success:false,message:'Offer is no longer active'});
    }
    const [bookingRows]=await conn.query(`SELECT b.worker_id,w.is_banned,w.ban_reason FROM bookings b JOIN workers w ON w.id=b.worker_id WHERE b.id=? LIMIT 1`,[o.booking_id]);
    if(!bookingRows.length){await conn.rollback();return res.status(404).json({success:false,message:'Booking not found'});}
    if(Boolean(bookingRows[0].is_banned)){
      await conn.rollback();
      return res.status(403).json({success:false,message:'This worker is currently restricted, so bargaining cannot continue.'});
    }

    if(action==='ACCEPT'){
      await conn.query("UPDATE bargain_offers SET status='ACCEPTED',responded_at=NOW() WHERE id=?",[o.id]);
      await conn.query("UPDATE bookings SET status='ACCEPTED',final_price=?,completion_pin=NULL,customer_tpin=NULL,tpin_attempts=0,tpin_expires_at=NULL WHERE id=?",[o.amount,o.booking_id]);
      await conn.commit();
      const wasWorkerOffer=o.sender_role==='WORKER';
      await notify(req.app,o.sender_id,
        wasWorkerOffer?'Counter-offer accepted':'Price proposal accepted',
        wasWorkerOffer?`Customer accepted your counter-offer of ₹${o.amount}.`:`Your price proposal of ₹${o.amount} has been accepted.`,
        'BARGAIN');
      return res.json({success:true,data:{finalPrice:o.amount}});
    }

    if(action==='REJECT'){
      await conn.query("UPDATE bargain_offers SET status='REJECTED',responded_at=NOW() WHERE id=?",[o.id]);
      await conn.query("UPDATE bookings SET status='BARGAINING' WHERE id=?",[o.booking_id]);
      await conn.commit();
      const wasWorkerOffer=o.sender_role==='WORKER';
      await notify(req.app,o.sender_id,
        wasWorkerOffer?'Counter-offer rejected':'Price proposal rejected',
        wasWorkerOffer?`Customer rejected your counter-offer for Booking #${o.booking_id}.`:`Worker rejected your price proposal for Booking #${o.booking_id}.`,
        'BARGAIN');
      return res.json({success:true,message:'Offer rejected; either side may send another proposal.'});
    }

    await conn.query("UPDATE bargain_offers SET status='COUNTERED',responded_at=NOW() WHERE id=?",[o.id]);
    const message=String(req.body.message||'Counter offer').slice(0,500);
    const [inserted]=await conn.query(
      "INSERT INTO bargain_offers(booking_id,sender_id,receiver_id,sender_role,amount,message,status) VALUES(?,?,?,?,?,?, 'PENDING')",
      [o.booking_id,req.user.id,o.sender_id,req.user.role,counterAmount,message]
    );
    const bookingStatus=req.user.role==='WORKER'?'COUNTER_OFFER_PENDING_USER':'BARGAINING';
    await conn.query('UPDATE bookings SET status=? WHERE id=?',[bookingStatus,o.booking_id]);
    await conn.commit();

    await notify(req.app,o.sender_id,
      req.user.role==='WORKER'?'Worker counter-offer':'Customer counter-offer',
      `${req.user.role==='WORKER'?'Worker':'Customer'} counter-offered ₹${counterAmount} for Booking #${o.booking_id}.`,
      'BARGAIN');
    return res.json({success:true,data:{id:inserted.insertId,amount:counterAmount,status:bookingStatus}});
  }catch(e){
    await conn.rollback().catch(()=>{});
    next(e);
  }finally{
    conn.release();
  }
});

module.exports=router;
