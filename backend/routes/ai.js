const express=require('express');
const pool=require('../config');
const {auth}=require('../middleware/auth');
const {reply}=require('../services/aiProvider');
const router=express.Router();
async function getServices(){ const [rows]=await pool.query('SELECT name,base_price FROM services ORDER BY id'); return rows; }
router.post('/chat',auth,async(req,res,next)=>{try{
  const message=String(req.body.message||'').trim();
  if(!message||message.length>2000) return res.status(400).json({success:false,message:'Enter a message up to 2,000 characters'});
  const isWorker=req.user.role==='WORKER';
  const [bookings]=await pool.query(isWorker?`SELECT b.id,b.status,b.booking_date,b.final_price,s.name service_name FROM bookings b JOIN workers w ON w.id=b.worker_id JOIN services s ON s.id=b.service_id WHERE w.user_id=? ORDER BY b.created_at DESC LIMIT 10`:`SELECT b.id,b.status,b.booking_date,b.final_price,s.name service_name FROM bookings b JOIN services s ON s.id=b.service_id WHERE b.user_id=? ORDER BY b.created_at DESC LIMIT 10`,[req.user.id]);
  const text=await reply({message,context:{
  role:req.user.role,
  bookings,
  services: await getServices(), platform:{name:'SevaHub',model:'digital cooperative gig services',service_categories:['household repair','cleaning','appliances','gardening','moving','community maintenance','community events'],currency:'INR'}, sessionId:String(req.user.id), userId:String(req.user.id)
}});
  res.json({success:true,data:{message:text}});
}catch(e){next(e)}});
module.exports=router;
