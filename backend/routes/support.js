const express=require('express');
const pool=require('../config');
const {auth}=require('../middleware/auth');
const {reply}=require('../services/aiProvider');

const router=express.Router();
const CATEGORIES=new Set(['BOOKING','PAYMENT','BARGAINING','LOCATION','ACCOUNT','SAFETY','TECHNICAL','OTHER']);
let tableReadyPromise=null;

function ensureTable(){
  if(!tableReadyPromise){
    tableReadyPromise=(async()=>{
      await pool.query(`
        CREATE TABLE IF NOT EXISTS support_tickets (
          id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          user_id BIGINT NOT NULL,
          role VARCHAR(20) NOT NULL,
          category VARCHAR(40) NOT NULL,
          subject VARCHAR(120) NOT NULL,
          message TEXT NOT NULL,
          booking_id BIGINT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_support_owner (user_id, created_at),
          INDEX idx_support_booking (booking_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      /* Keep chat storage independent from a DB-level foreign key. Some deployed
         databases already have an older support_tickets definition, and adding
         a FK at runtime can fail even though the app-level ownership checks are
         valid. This table is still protected by authenticated ticket lookups. */
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
    })().catch(err=>{
      tableReadyPromise=null;
      throw err;
    });
  }
  return tableReadyPromise;
}

async function canReferenceBooking(req,bookingId){
  if(!bookingId)return true;
  if(req.user.role==='USER'){
    const [rows]=await pool.query('SELECT id FROM bookings WHERE id=? AND user_id=? LIMIT 1',[bookingId,req.user.id]);
    return Boolean(rows[0]);
  }
  if(req.user.role==='WORKER'){
    const [rows]=await pool.query(`
      SELECT b.id
      FROM bookings b
      JOIN workers w ON w.id=b.worker_id
      WHERE b.id=? AND w.user_id=?
      LIMIT 1`,[bookingId,req.user.id]);
    return Boolean(rows[0]);
  }
  return false;
}

async function ownedTicket(req,ticketId){
  const [rows]=await pool.query(`
    SELECT id,user_id,role,subject,status
    FROM support_tickets
    WHERE id=? AND user_id=? AND role=?
    LIMIT 1`,[ticketId,req.user.id,req.user.role]);
  return rows[0]||null;
}

async function supportBookingContext(req,bookingId){
  if(!bookingId)return null;
  if(!(await canReferenceBooking(req,bookingId)))return null;
  const userSql=`
    SELECT b.id,b.status,b.booking_date,b.booking_time,b.payment_method,b.original_price,b.final_price,s.name service_name
    FROM bookings b
    JOIN services s ON s.id=b.service_id
    WHERE b.id=? AND b.user_id=?
    LIMIT 1`;
  const workerSql=`
    SELECT b.id,b.status,b.booking_date,b.booking_time,b.payment_method,b.original_price,b.final_price,s.name service_name
    FROM bookings b
    JOIN workers w ON w.id=b.worker_id
    JOIN services s ON s.id=b.service_id
    WHERE b.id=? AND w.user_id=?
    LIMIT 1`;
  const [rows]=await pool.query(req.user.role==='WORKER'?workerSql:userSql,[bookingId,req.user.id]);
  return rows[0]||null;
}

router.get('/my',auth,async(req,res,next)=>{
  try{
    await ensureTable();
    const [rows]=await pool.query(`
      SELECT t.id,t.category,t.subject,t.message,t.booking_id,t.status,t.created_at,t.updated_at,
        (SELECT COUNT(*) FROM support_messages sm WHERE sm.ticket_id=t.id) message_count,
        (SELECT MAX(sm.created_at) FROM support_messages sm WHERE sm.ticket_id=t.id) last_message_at
      FROM support_tickets t
      WHERE t.user_id=? AND t.role=?
      ORDER BY COALESCE((SELECT MAX(sm2.created_at) FROM support_messages sm2 WHERE sm2.ticket_id=t.id),t.created_at) DESC
      LIMIT 50`,[req.user.id,req.user.role]);
    res.json({success:true,data:rows});
  }catch(e){next(e)}
});

router.get('/:id/messages',auth,async(req,res,next)=>{
  try{
    await ensureTable();
    const id=Number(req.params.id);
    if(!Number.isInteger(id)||id<=0)return res.status(400).json({success:false,message:'Invalid support ticket'});
    const ticket=await ownedTicket(req,id);
    if(!ticket)return res.status(404).json({success:false,message:'Support ticket not found'});
    const [rows]=await pool.query(`
      SELECT id,ticket_id,sender_type,message,created_at
      FROM support_messages
      WHERE ticket_id=?
      ORDER BY id ASC
      LIMIT 300`,[id]);
    res.json({success:true,data:{ticket,messages:rows}});
  }catch(e){next(e)}
});

router.post('/:id/messages',auth,async(req,res,next)=>{
  try{
    await ensureTable();
    const id=Number(req.params.id);
    const message=String(req.body.message||'').trim();
    if(!Number.isInteger(id)||id<=0)return res.status(400).json({success:false,message:'Invalid support ticket'});
    if(message.length<1||message.length>1500)return res.status(400).json({success:false,message:'Message must be 1 to 1,500 characters'});
    const ticket=await ownedTicket(req,id);
    if(!ticket)return res.status(404).json({success:false,message:'Support ticket not found'});
    const [result]=await pool.query(`
      INSERT INTO support_messages(ticket_id,sender_type,sender_user_id,message)
      VALUES(?,'MEMBER',?,?)`,[id,req.user.id,message]);
    if(String(ticket.status||'').toUpperCase()==='RESOLVED'){
      await pool.query("UPDATE support_tickets SET status='OPEN' WHERE id=?",[id]);
    }else{
      await pool.query('UPDATE support_tickets SET updated_at=CURRENT_TIMESTAMP WHERE id=?',[id]);
    }
    res.status(201).json({success:true,data:{id:result.insertId,ticketId:id,senderType:'MEMBER',message}});
  }catch(e){next(e)}
});

/* Support-specific AI endpoint. It deliberately bypasses the booking-agent state
   machine so a support question such as "booking payment issue" cannot start a
   new booking by accident. No polling/background calls: it runs only when the
   user presses Ask AI in Support Center. */
router.post('/ai',auth,async(req,res,next)=>{
  try{
    await ensureTable();
    const message=String(req.body.message||'').trim();
    const bookingIdRaw=req.body.bookingId;
    const bookingId=bookingIdRaw===undefined||bookingIdRaw===null||String(bookingIdRaw).trim()===''?null:Number(bookingIdRaw);
    if(!message||message.length>1600)return res.status(400).json({success:false,message:'Enter a support question up to 1,600 characters'});
    if(bookingId!==null&&(!Number.isInteger(bookingId)||bookingId<=0))return res.status(400).json({success:false,message:'Enter a valid booking number'});
    if(bookingId!==null&&!(await canReferenceBooking(req,bookingId)))return res.status(403).json({success:false,message:'That booking is not linked to your account'});

    const [recentTickets]=await pool.query(`
      SELECT category,subject,status,booking_id,created_at
      FROM support_tickets
      WHERE user_id=? AND role=?
      ORDER BY created_at DESC
      LIMIT 5`,[req.user.id,req.user.role]);
    const booking=await supportBookingContext(req,bookingId);

    const supportPrompt=`You are SevaHub Support AI. Help the ${req.user.role==='WORKER'?'worker':'customer'} troubleshoot or understand this support issue. Be concise, practical and specific to SevaHub. Do not ask for passwords, OTPs, UPI PINs, card PINs or other secrets. Never claim that a payment, refund, booking change, account change or ticket resolution has happened unless the supplied context explicitly says so. If the issue needs human/platform action, tell the user to submit a support ticket using the form on this page and then use Chat with Support on that ticket to speak with the cooperative admin. For immediate personal-safety danger, advise contacting local emergency help and a trusted person. User message: ${message}`;

    const text=await reply({
      message:supportPrompt,
      context:{
        mode:'SUPPORT',
        role:req.user.role,
        booking,
        recentSupportTickets:recentTickets,
        platform:{name:'SevaHub',currency:'INR',supportCategories:[...CATEGORIES]},
        sessionId:`support-${req.user.id}`,
        userId:String(req.user.id)
      }
    });
    res.json({success:true,data:{message:text}});
  }catch(e){next(e)}
});

router.post('/',auth,async(req,res,next)=>{
  try{
    await ensureTable();
    const category=String(req.body.category||'OTHER').trim().toUpperCase();
    const subject=String(req.body.subject||'').trim();
    const message=String(req.body.message||'').trim();
    const bookingIdRaw=req.body.bookingId;
    const bookingId=bookingIdRaw===undefined||bookingIdRaw===null||String(bookingIdRaw).trim()===''?null:Number(bookingIdRaw);

    if(!CATEGORIES.has(category))return res.status(400).json({success:false,message:'Choose a valid support category'});
    if(subject.length<3||subject.length>120)return res.status(400).json({success:false,message:'Subject must be 3 to 120 characters'});
    if(message.length<10||message.length>2000)return res.status(400).json({success:false,message:'Message must be 10 to 2,000 characters'});
    if(bookingId!==null&&(!Number.isInteger(bookingId)||bookingId<=0))return res.status(400).json({success:false,message:'Enter a valid booking number'});
    if(bookingId!==null&&!(await canReferenceBooking(req,bookingId)))return res.status(403).json({success:false,message:'That booking is not linked to your account'});

    const [result]=await pool.query(`
      INSERT INTO support_tickets(user_id,role,category,subject,message,booking_id,status)
      VALUES(?,?,?,?,?,?,'OPEN')`,[req.user.id,req.user.role,category,subject,message,bookingId]);

    res.status(201).json({success:true,data:{id:result.insertId,status:'OPEN'}});
  }catch(e){next(e)}
});

router.put('/:id/resolve',auth,async(req,res,next)=>{
  try{
    await ensureTable();
    const id=Number(req.params.id);
    if(!Number.isInteger(id)||id<=0)return res.status(400).json({success:false,message:'Invalid support ticket'});
    const [result]=await pool.query(`
      UPDATE support_tickets
      SET status='RESOLVED'
      WHERE id=? AND user_id=? AND role=? AND status<>'RESOLVED'`,[id,req.user.id,req.user.role]);
    if(!result.affectedRows)return res.status(404).json({success:false,message:'Open support ticket not found'});
    res.json({success:true,data:{id,status:'RESOLVED'}});
  }catch(e){next(e)}
});

module.exports=router;
