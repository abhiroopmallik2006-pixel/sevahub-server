const express=require('express');
const crypto=require('crypto');
const jwt=require('jsonwebtoken');
const pool=require('../config');
const {notify}=require('../utils/notifications');

const router=express.Router();
const ADMIN_TOKEN_TTL=process.env.ADMIN_JWT_EXPIRES_IN||'8h';

function digest(value){return crypto.createHash('sha256').update(String(value||'')).digest()}
function safeEqual(a,b){
  try{return crypto.timingSafeEqual(digest(a),digest(b))}catch(e){return false}
}
function configuredAdmin(){
  return {
    email:String(process.env.ADMIN_EMAIL||'').trim().toLowerCase(),
    password:String(process.env.ADMIN_PASSWORD||'')
  };
}
function signAdminToken(email){
  return jwt.sign({role:'ADMIN',admin:true,email},process.env.JWT_SECRET,{expiresIn:ADMIN_TOKEN_TTL});
}
function adminAuth(req,res,next){
  const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  if(!token)return res.status(401).json({success:false,message:'Admin authentication required'});
  try{
    const payload=jwt.verify(token,process.env.JWT_SECRET);
    if(payload.role!=='ADMIN'||payload.admin!==true)return res.status(403).json({success:false,message:'Admin access only'});
    req.admin=payload;
    next();
  }catch(e){return res.status(401).json({success:false,message:'Invalid or expired admin session'})}
}
async function tableExists(name){
  const [rows]=await pool.query('SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? LIMIT 1',[name]);
  return Boolean(rows.length);
}
async function columnExists(table,column){
  const [rows]=await pool.query('SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=? LIMIT 1',[table,column]);
  return Boolean(rows.length);
}
async function ensureWorkerVerification(){
  if(!(await columnExists('workers','verification_status'))){
    await pool.query("ALTER TABLE workers ADD COLUMN verification_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'");
  }
}
async function ensureSupportMessages(){
  if(!(await tableExists('support_tickets')))return false;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS support_messages (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      ticket_id BIGINT NOT NULL,
      sender_type VARCHAR(20) NOT NULL,
      sender_user_id BIGINT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_support_messages_ticket (ticket_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  return true;
}

router.post('/login',async(req,res)=>{
  const {email:configuredEmail,password:configuredPassword}=configuredAdmin();
  if(!configuredEmail||!configuredPassword)return res.status(503).json({success:false,message:'Admin access is not configured on the server'});
  const email=String(req.body.email||'').trim().toLowerCase();
  const password=String(req.body.password||'');
  if(!safeEqual(email,configuredEmail)||!safeEqual(password,configuredPassword))return res.status(401).json({success:false,message:'Invalid admin credentials'});
  const token=signAdminToken(configuredEmail);
  res.json({success:true,data:{token,admin:{email:configuredEmail,role:'ADMIN'}}});
});

router.get('/me',adminAuth,(req,res)=>res.json({success:true,data:{email:req.admin.email,role:'ADMIN'}}));

router.get('/summary',adminAuth,async(req,res,next)=>{try{
  await ensureWorkerVerification();
  const [[usersCount],[workersCount],[bookingsCount],[completedCount],[pendingWorkers]] = await Promise.all([
    pool.query("SELECT COUNT(*) total FROM users WHERE role='USER'"),
    pool.query('SELECT COUNT(*) total FROM workers'),
    pool.query("SELECT COUNT(*) total FROM bookings"),
    pool.query("SELECT COUNT(*) total FROM bookings WHERE status='COMPLETED'"),
    pool.query("SELECT COUNT(*) total FROM workers WHERE UPPER(COALESCE(verification_status,'PENDING'))='PENDING'")
  ]);
  let openSupport=0,paidAmount=0,workerNet=0;
  if(await tableExists('support_tickets')){
    const [r]=await pool.query("SELECT COUNT(*) total FROM support_tickets WHERE status<>'RESOLVED'");
    openSupport=Number(r[0]?.total||0);
  }
  if(await tableExists('payments')){
    const [r]=await pool.query("SELECT COALESCE(SUM(amount),0) paid,COALESCE(SUM(worker_net_amount),0) worker_net FROM payments WHERE status='PAID'");
    paidAmount=Number(r[0]?.paid||0);workerNet=Number(r[0]?.worker_net||0);
  }
  res.json({success:true,data:{users:Number(usersCount[0]?.total||0),workers:Number(workersCount[0]?.total||0),bookings:Number(bookingsCount[0]?.total||0),completed:Number(completedCount[0]?.total||0),pendingWorkerVerification:Number(pendingWorkers[0]?.total||0),openSupportTickets:openSupport,paidAmount,workerNet}});
}catch(e){next(e)}});

router.get('/workers',adminAuth,async(req,res,next)=>{try{
  await ensureWorkerVerification();
  const [rows]=await pool.query(`
    SELECT w.id,w.user_id,u.full_name,u.username,u.email,u.phone,w.experience_years,w.service_area,w.service_radius,
      COALESCE(w.verification_status,'PENDING') verification_status,w.rating,w.total_reviews,
      GROUP_CONCAT(DISTINCT CONCAT(s.name,' @ ₹',ws.price) ORDER BY s.name SEPARATOR ', ') services
    FROM workers w
    JOIN users u ON u.id=w.user_id
    LEFT JOIN worker_services ws ON ws.worker_id=w.id
    LEFT JOIN services s ON s.id=ws.service_id
    GROUP BY w.id,u.id
    ORDER BY w.id DESC
    LIMIT 300`);
  res.json({success:true,data:rows});
}catch(e){next(e)}});

router.put('/workers/:id/verification',adminAuth,async(req,res,next)=>{try{
  await ensureWorkerVerification();
  const id=Number(req.params.id);
  const status=String(req.body.status||'').trim().toUpperCase();
  if(!Number.isInteger(id)||id<1)return res.status(400).json({success:false,message:'Invalid worker'});
  if(!['PENDING','VERIFIED','REJECTED'].includes(status))return res.status(400).json({success:false,message:'Invalid verification status'});
  const [result]=await pool.query('UPDATE workers SET verification_status=? WHERE id=?',[status,id]);
  if(!result.affectedRows)return res.status(404).json({success:false,message:'Worker not found'});
  res.json({success:true,data:{workerId:id,status}});
}catch(e){next(e)}});

router.get('/users',adminAuth,async(req,res,next)=>{try{
  const [rows]=await pool.query(`SELECT id,full_name,username,email,phone,role,email_verified,created_at FROM users ORDER BY id DESC LIMIT 400`);
  res.json({success:true,data:rows});
}catch(e){next(e)}});

router.get('/bookings',adminAuth,async(req,res,next)=>{try{
  const [rows]=await pool.query(`
    SELECT b.id,b.status,b.booking_date,b.booking_time,b.address,b.original_price,b.final_price,b.payment_method,b.created_at,
      s.name service_name,cu.full_name customer_name,wu.full_name worker_name
    FROM bookings b
    JOIN services s ON s.id=b.service_id
    JOIN users cu ON cu.id=b.user_id
    JOIN workers w ON w.id=b.worker_id
    JOIN users wu ON wu.id=w.user_id
    ORDER BY b.id DESC LIMIT 400`);
  res.json({success:true,data:rows});
}catch(e){next(e)}});

router.get('/support',adminAuth,async(req,res,next)=>{try{
  if(!(await ensureSupportMessages()))return res.json({success:true,data:[]});
  const [rows]=await pool.query(`
    SELECT t.id,t.user_id,t.role,t.category,t.subject,t.message,t.booking_id,t.status,t.created_at,t.updated_at,
      u.full_name,u.email,
      (SELECT COUNT(*) FROM support_messages sm WHERE sm.ticket_id=t.id) message_count,
      (SELECT MAX(sm.created_at) FROM support_messages sm WHERE sm.ticket_id=t.id) last_message_at
    FROM support_tickets t LEFT JOIN users u ON u.id=t.user_id
    ORDER BY (t.status='OPEN') DESC,COALESCE((SELECT MAX(sm2.created_at) FROM support_messages sm2 WHERE sm2.ticket_id=t.id),t.created_at) DESC
    LIMIT 300`);
  res.json({success:true,data:rows});
}catch(e){next(e)}});

router.get('/support/:id/messages',adminAuth,async(req,res,next)=>{try{
  if(!(await ensureSupportMessages()))return res.status(404).json({success:false,message:'Support system not initialized'});
  const id=Number(req.params.id);
  if(!Number.isInteger(id)||id<1)return res.status(400).json({success:false,message:'Invalid support ticket'});
  const [tickets]=await pool.query(`
    SELECT t.id,t.user_id,t.role,t.category,t.subject,t.message,t.booking_id,t.status,t.created_at,u.full_name,u.email
    FROM support_tickets t LEFT JOIN users u ON u.id=t.user_id
    WHERE t.id=? LIMIT 1`,[id]);
  if(!tickets.length)return res.status(404).json({success:false,message:'Support ticket not found'});
  const [messages]=await pool.query(`
    SELECT id,ticket_id,sender_type,message,created_at
    FROM support_messages
    WHERE ticket_id=? ORDER BY id ASC LIMIT 300`,[id]);
  res.json({success:true,data:{ticket:tickets[0],messages}});
}catch(e){next(e)}});

router.post('/support/:id/messages',adminAuth,async(req,res,next)=>{try{
  if(!(await ensureSupportMessages()))return res.status(404).json({success:false,message:'Support system not initialized'});
  const id=Number(req.params.id);
  const message=String(req.body.message||'').trim();
  if(!Number.isInteger(id)||id<1)return res.status(400).json({success:false,message:'Invalid support ticket'});
  if(message.length<1||message.length>1500)return res.status(400).json({success:false,message:'Message must be 1 to 1,500 characters'});
  const [tickets]=await pool.query('SELECT id,user_id,role,subject FROM support_tickets WHERE id=? LIMIT 1',[id]);
  if(!tickets.length)return res.status(404).json({success:false,message:'Support ticket not found'});
  const ticket=tickets[0];
  const [result]=await pool.query(`
    INSERT INTO support_messages(ticket_id,sender_type,sender_user_id,message)
    VALUES(?,'ADMIN',NULL,?)`,[id,message]);
  await pool.query('UPDATE support_tickets SET updated_at=CURRENT_TIMESTAMP WHERE id=?',[id]);
  await notify(req.app,ticket.user_id,'Support reply',`Admin replied to Support Ticket #${id}: ${message.slice(0,120)}`,'SUPPORT').catch(()=>{});
  res.status(201).json({success:true,data:{id:result.insertId,ticketId:id,senderType:'ADMIN',message}});
}catch(e){next(e)}});

router.put('/support/:id/status',adminAuth,async(req,res,next)=>{try{
  if(!(await tableExists('support_tickets')))return res.status(404).json({success:false,message:'Support system not initialized'});
  const id=Number(req.params.id),status=String(req.body.status||'').trim().toUpperCase();
  if(!Number.isInteger(id)||id<1)return res.status(400).json({success:false,message:'Invalid support ticket'});
  if(!['OPEN','RESOLVED'].includes(status))return res.status(400).json({success:false,message:'Invalid support status'});
  const [result]=await pool.query('UPDATE support_tickets SET status=? WHERE id=?',[status,id]);
  if(!result.affectedRows)return res.status(404).json({success:false,message:'Support ticket not found'});
  res.json({success:true,data:{id,status}});
}catch(e){next(e)}});

router.get('/payments',adminAuth,async(req,res,next)=>{try{
  if(!(await tableExists('payments')))return res.json({success:true,data:[]});
  const [rows]=await pool.query(`
    SELECT p.id,p.booking_id,p.amount,p.platform_fee,p.worker_net_amount,p.currency,p.status,p.payment_method,p.razorpay_payment_id,p.paid_at,p.created_at,
      cu.full_name customer_name,wu.full_name worker_name,s.name service_name
    FROM payments p
    JOIN bookings b ON b.id=p.booking_id
    JOIN users cu ON cu.id=b.user_id
    JOIN workers w ON w.id=b.worker_id
    JOIN users wu ON wu.id=w.user_id
    JOIN services s ON s.id=b.service_id
    ORDER BY p.id DESC LIMIT 300`);
  res.json({success:true,data:rows});
}catch(e){next(e)}});

module.exports=router;
