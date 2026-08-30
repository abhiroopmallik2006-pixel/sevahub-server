const express=require('express');
const pool=require('../config');
const {auth,authorize}=require('../middleware/auth');
const router=express.Router();

router.get('/me',auth,authorize('WORKER'),async(req,res,next)=>{
  try{
    const [rows]=await pool.query(`
      SELECT w.*,u.full_name,u.username,u.email,u.phone,
      (SELECT s.name FROM worker_services ws JOIN services s ON s.id=ws.service_id WHERE ws.worker_id=w.id ORDER BY ws.id LIMIT 1) service_name,
      (SELECT ws.price FROM worker_services ws WHERE ws.worker_id=w.id ORDER BY ws.id LIMIT 1) service_price
      FROM workers w JOIN users u ON u.id=w.user_id WHERE w.user_id=?`,[req.user.id]);
    res.json({success:true,data:rows[0]||null});
  }catch(e){next(e)}
});

router.get('/me/bargains',auth,authorize('WORKER'),async(req,res,next)=>{
  try{
    const [rows]=await pool.query(`
      SELECT b.id,b.booking_id,b.amount,b.message,b.status,b.created_at,
      b.sender_role,u.full_name customer_name,s.name service_name,
      bk.original_price,bk.final_price,bk.status booking_status
      FROM bargain_offers b
      JOIN bookings bk ON bk.id=b.booking_id
      JOIN users u ON u.id=b.sender_id
      JOIN services s ON s.id=bk.service_id
      JOIN workers w ON w.id=bk.worker_id
      WHERE w.user_id=? ORDER BY b.created_at DESC`,[req.user.id]);
    res.json({success:true,data:rows});
  }catch(e){next(e)}
});

router.get('/:id',async(req,res,next)=>{
  try{
    const [rows]=await pool.query(`
      SELECT w.*,u.full_name,u.username,u.profile_image,u.email,u.phone
      FROM workers w JOIN users u ON u.id=w.user_id WHERE w.id=?`,[req.params.id]);
    if(!rows.length) return res.status(404).json({success:false,message:'Worker not found'});
    const [services]=await pool.query(`
      SELECT s.id,s.name,ws.price FROM worker_services ws JOIN services s ON s.id=ws.service_id WHERE ws.worker_id=?`,[req.params.id]);
    res.json({success:true,data:{...rows[0],services}});
  }catch(e){next(e)}
});

module.exports=router;
