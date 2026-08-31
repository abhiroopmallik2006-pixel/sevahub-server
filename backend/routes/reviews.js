const express=require('express');
const pool=require('../config');
const {auth,authorize}=require('../middleware/auth');
const router=express.Router();

router.get('/my',auth,authorize('USER'),async(req,res,next)=>{try{
 const [rows]=await pool.query(`SELECT id,booking_id,worker_id,rating,comment,created_at FROM reviews WHERE user_id=? AND is_removed=FALSE ORDER BY created_at DESC`,[req.user.id]);
 res.json({success:true,data:rows});
}catch(e){next(e)}});

// Review history shown from professional cards before a user books a worker.
router.get('/worker/:workerId',auth,async(req,res,next)=>{try{
 const workerId=Number(req.params.workerId);
 if(!Number.isInteger(workerId)||workerId<1)return res.status(400).json({success:false,message:'Invalid worker'});

 const [workers]=await pool.query(`SELECT w.id,w.rating,w.total_reviews,u.full_name worker_name
  FROM workers w JOIN users u ON u.id=w.user_id WHERE w.id=? LIMIT 1`,[workerId]);
 if(!workers.length)return res.status(404).json({success:false,message:'Worker not found'});

 const [rows]=await pool.query(`SELECT r.id,r.booking_id,r.rating,r.comment,r.created_at,
   u.full_name reviewer_name,s.name service_name
   FROM reviews r
   JOIN users u ON u.id=r.user_id
   LEFT JOIN bookings b ON b.id=r.booking_id
   LEFT JOIN services s ON s.id=b.service_id
   WHERE r.worker_id=? AND r.is_removed=FALSE
   ORDER BY r.created_at DESC LIMIT 200`,[workerId]);

 const worker=workers[0];
 res.json({success:true,data:{
  workerId:worker.id,
  workerName:worker.worker_name,
  averageRating:Number(worker.rating||0),
  totalReviews:Number(worker.total_reviews||rows.length||0),
  reviews:rows
 }});
}catch(e){next(e)}});

router.post('/',auth,authorize('USER'),async(req,res,next)=>{
 const bookingId=Number(req.body.bookingId);
 const rating=Number(req.body.rating);
 const comment=String(req.body.comment||'').trim().slice(0,500);
 if(!Number.isInteger(bookingId)||bookingId<1)return res.status(400).json({success:false,message:'Invalid booking'});
 if(!Number.isInteger(rating)||rating<1||rating>5)return res.status(400).json({success:false,message:'Rating must be between 1 and 5 stars'});

 const conn=await pool.getConnection();
 try{
  await conn.beginTransaction();
  const [bookings]=await conn.query(`SELECT b.id,b.user_id,b.worker_id,b.status FROM bookings b WHERE b.id=? FOR UPDATE`,[bookingId]);
  if(!bookings.length){await conn.rollback();return res.status(404).json({success:false,message:'Booking not found'})}
  const booking=bookings[0];
  if(Number(booking.user_id)!==Number(req.user.id)){await conn.rollback();return res.status(403).json({success:false,message:'You cannot review this booking'})}
  if(booking.status!=='COMPLETED'){await conn.rollback();return res.status(400).json({success:false,message:'You can review only after the service is completed'})}

  const [existing]=await conn.query('SELECT id FROM reviews WHERE booking_id=?',[bookingId]);
  if(existing.length){await conn.rollback();return res.status(409).json({success:false,message:'You already reviewed this booking'})}

  await conn.query(`INSERT INTO reviews(booking_id,user_id,worker_id,rating,comment) VALUES(?,?,?,?,?)`,[bookingId,req.user.id,booking.worker_id,rating,comment||null]);

  const [stats]=await conn.query(`SELECT COALESCE(AVG(rating),0) average_rating,COUNT(*) total_reviews FROM reviews WHERE worker_id=? AND is_removed=FALSE`,[booking.worker_id]);
  await conn.query('UPDATE workers SET rating=?,total_reviews=? WHERE id=?',[Number(stats[0].average_rating||0).toFixed(2),Number(stats[0].total_reviews||0),booking.worker_id]);
  await conn.commit();

  res.status(201).json({success:true,message:'Review submitted',data:{bookingId,rating,averageRating:Number(stats[0].average_rating||0),totalReviews:Number(stats[0].total_reviews||0)}});
 }catch(e){await conn.rollback().catch(()=>{});next(e)}finally{conn.release()}
});

module.exports=router;
