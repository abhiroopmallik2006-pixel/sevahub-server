const express=require('express');
const pool=require('../config');
const {auth}=require('../middleware/auth');
const {notify}=require('../utils/notifications');
const router=express.Router();
async function getBooking(id,userId){
 const [r]=await pool.query(`SELECT b.id,b.user_id,b.worker_id,w.user_id worker_user_id FROM bookings b JOIN workers w ON w.id=b.worker_id WHERE b.id=? AND (b.user_id=? OR w.user_id=?)`,[id,userId,userId]);
 return r[0];
}
router.get('/:bookingId',auth,async(req,res,next)=>{try{
 const b=await getBooking(req.params.bookingId,req.user.id); if(!b)return res.status(404).json({success:false,message:'Booking not found'});
 const [rows]=await pool.query(`SELECT m.id,m.booking_id,m.sender_id,m.receiver_id,m.message,m.created_at,u.full_name sender_name FROM booking_messages m JOIN users u ON u.id=m.sender_id WHERE m.booking_id=? ORDER BY m.created_at ASC LIMIT 300`,[b.id]);
 res.json({success:true,data:rows});
}catch(e){next(e)}});
router.post('/:bookingId',auth,async(req,res,next)=>{try{
 const b=await getBooking(req.params.bookingId,req.user.id);if(!b)return res.status(404).json({success:false,message:'Booking not found'});
 const message=String(req.body.message||'').trim();if(!message||message.length>2000)return res.status(400).json({success:false,message:'Enter a message up to 2,000 characters'});
 const receiver=Number(req.user.id)===Number(b.user_id)?b.worker_user_id:b.user_id;
 const [senderRows]=await pool.query('SELECT full_name FROM users WHERE id=? LIMIT 1',[req.user.id]);
 const senderName=senderRows[0]?.full_name||req.user.username||'SevaHub user';
 const [r]=await pool.query('INSERT INTO booking_messages(booking_id,sender_id,receiver_id,message) VALUES(?,?,?,?)',[b.id,req.user.id,receiver,message]);
 const preview=message.length>120?message.slice(0,117)+'...':message;
 await notify(req.app,receiver,`💬 New message from ${senderName}`,`${preview} · Booking #${b.id}`,'CHAT');
 const payload={id:r.insertId,booking_id:b.id,sender_id:req.user.id,receiver_id:receiver,message,created_at:new Date().toISOString(),sender_name:senderName};
 req.app.get('io')?.to(`user-${receiver}`).emit('booking-message',{bookingId:b.id,message:payload});
 res.status(201).json({success:true,data:payload});
}catch(e){next(e)}});
module.exports=router;
