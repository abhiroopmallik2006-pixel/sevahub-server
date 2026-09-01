const express=require('express');
const pool=require('../config');
const {auth}=require('../middleware/auth');
const router=express.Router();

const ALLOWED_CATEGORIES=new Set([
  'BOOKING','PAYMENT','BARGAINING','LOCATION','ACCOUNT','SAFETY','TECHNICAL','OTHER'
]);

async function ensureSupportTable(){
  await pool.query(`CREATE TABLE IF NOT EXISTS support_tickets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    role VARCHAR(20) NOT NULL,
    category VARCHAR(40) NOT NULL,
    booking_id INT NULL,
    subject VARCHAR(140) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_support_user_created (user_id,created_at),
    INDEX idx_support_status (status)
  )`);
}

async function canUseBooking(user,bookingId){
  if(!bookingId)return true;
  if(user.role==='WORKER'){
    const [rows]=await pool.query(`SELECT b.id FROM bookings b JOIN workers w ON w.id=b.worker_id WHERE b.id=? AND w.user_id=? LIMIT 1`,[bookingId,user.id]);
    return rows.length>0;
  }
  const [rows]=await pool.query('SELECT id FROM bookings WHERE id=? AND user_id=? LIMIT 1',[bookingId,user.id]);
  return rows.length>0;
}

router.get('/my',auth,async(req,res,next)=>{try{
  await ensureSupportTable();
  const [rows]=await pool.query(`SELECT id,category,booking_id,subject,message,status,created_at,updated_at
    FROM support_tickets WHERE user_id=? ORDER BY created_at DESC LIMIT 100`,[req.user.id]);
  res.json({success:true,data:rows});
}catch(e){next(e)}});

router.post('/',auth,async(req,res,next)=>{try{
  await ensureSupportTable();
  const category=String(req.body.category||'OTHER').trim().toUpperCase();
  const subject=String(req.body.subject||'').trim();
  const message=String(req.body.message||'').trim();
  const rawBooking=req.body.bookingId;
  const bookingId=rawBooking===null||rawBooking===undefined||rawBooking===''?null:Number(rawBooking);

  if(!ALLOWED_CATEGORIES.has(category))return res.status(400).json({success:false,message:'Choose a valid support category'});
  if(subject.length<3||subject.length>140)return res.status(400).json({success:false,message:'Subject must be 3 to 140 characters'});
  if(message.length<10||message.length>4000)return res.status(400).json({success:false,message:'Describe the issue in 10 to 4,000 characters'});
  if(bookingId!==null&&(!Number.isInteger(bookingId)||bookingId<1))return res.status(400).json({success:false,message:'Invalid booking reference'});
  if(!(await canUseBooking(req.user,bookingId)))return res.status(403).json({success:false,message:'That booking does not belong to this account'});

  const [r]=await pool.query(`INSERT INTO support_tickets(user_id,role,category,booking_id,subject,message,status)
    VALUES(?,?,?,?,?,?,'OPEN')`,[req.user.id,req.user.role,category,bookingId,subject,message]);
  res.status(201).json({success:true,message:'Support request created',data:{id:r.insertId,status:'OPEN'}});
}catch(e){next(e)}});

router.put('/:id/resolve',auth,async(req,res,next)=>{try{
  await ensureSupportTable();
  const id=Number(req.params.id);
  if(!Number.isInteger(id)||id<1)return res.status(400).json({success:false,message:'Invalid support request'});
  const [r]=await pool.query(`UPDATE support_tickets SET status='RESOLVED' WHERE id=? AND user_id=? AND status<>'RESOLVED'`,[id,req.user.id]);
  if(!r.affectedRows){
    const [rows]=await pool.query('SELECT id,status FROM support_tickets WHERE id=? AND user_id=?',[id,req.user.id]);
    if(!rows.length)return res.status(404).json({success:false,message:'Support request not found'});
    return res.json({success:true,message:'Support request is already resolved',data:rows[0]});
  }
  res.json({success:true,message:'Support request marked resolved',data:{id,status:'RESOLVED'}});
}catch(e){next(e)}});

module.exports=router;
