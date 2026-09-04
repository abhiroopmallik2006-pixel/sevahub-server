const express=require('express');
const jwt=require('jsonwebtoken');
const pool=require('../config');
const {notify}=require('../utils/notifications');
const {ensureWorkerModeration,suspendWorkerServices}=require('../utils/workerModeration');

const router=express.Router();

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

async function tableExists(db,name){
  const [rows]=await db.query('SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? LIMIT 1',[name]);
  return Boolean(rows.length);
}

async function columnExists(db,table,column){
  const [rows]=await db.query('SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=? LIMIT 1',[table,column]);
  return Boolean(rows.length);
}

async function ensureWorkerVerification(){
  if(!(await columnExists(pool,'workers','verification_status'))){
    await pool.query("ALTER TABLE workers ADD COLUMN verification_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'");
  }
}

async function ensureDeletionAudit(){
  await pool.query(`CREATE TABLE IF NOT EXISTS admin_worker_deletion_log (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    worker_id INT NOT NULL,
    action VARCHAR(40) NOT NULL,
    reason VARCHAR(500) NULL,
    admin_email VARCHAR(150) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_worker_delete_log_worker(worker_id),
    INDEX idx_worker_delete_log_action(action)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

function reasonValue(value){return String(value||'').trim().slice(0,500)}
function emitWorkerEvent(req,userId,payload){
  try{req.app.get('io')?.to(`user-${userId}`).emit('worker-moderation-changed',payload)}catch(e){}
}

async function runDeleteIfTable(conn,table,sql,params){
  if(await tableExists(conn,table))await conn.query(sql,params);
}

router.get('/workers',adminAuth,async(req,res,next)=>{try{
  await Promise.all([ensureWorkerVerification(),ensureWorkerModeration(pool)]);
  const [rows]=await pool.query(`
    SELECT w.id,w.user_id,u.full_name,u.username,u.email,u.phone,w.experience_years,w.service_area,w.service_radius,
      COALESCE(w.verification_status,'PENDING') verification_status,w.rating,w.total_reviews,
      w.is_banned,w.ban_reason,w.banned_at,w.profile_deleted_at,w.profile_deleted_reason,
      COALESCE(
        GROUP_CONCAT(DISTINCT CONCAT(s.name,' @ ₹',ws.price) ORDER BY s.name SEPARATOR ', '),
        (SELECT GROUP_CONCAT(DISTINCT CONCAT(ss.name,' @ ₹',sws.price) ORDER BY ss.name SEPARATOR ', ')
          FROM worker_suspended_services sws JOIN services ss ON ss.id=sws.service_id WHERE sws.worker_id=w.id)
      ) services
    FROM workers w
    JOIN users u ON u.id=w.user_id
    LEFT JOIN worker_services ws ON ws.worker_id=w.id
    LEFT JOIN services s ON s.id=ws.service_id
    GROUP BY w.id,u.id
    ORDER BY (w.profile_deleted_at IS NOT NULL) DESC,w.id DESC
    LIMIT 300`);
  res.json({success:true,data:rows});
}catch(e){next(e)}});

router.delete('/workers/:id/profile',adminAuth,async(req,res,next)=>{
  const workerId=Number(req.params.id);
  const reason=reasonValue(req.body.reason);
  if(!Number.isInteger(workerId)||workerId<1)return res.status(400).json({success:false,message:'Invalid worker'});
  if(reason.length<3)return res.status(400).json({success:false,message:'Enter a profile deletion reason of at least 3 characters'});

  await Promise.all([ensureWorkerVerification(),ensureWorkerModeration(pool),ensureDeletionAudit()]);
  const conn=await pool.getConnection();
  let worker=null;
  try{
    await conn.beginTransaction();
    const [rows]=await conn.query(`SELECT w.id,w.user_id,w.profile_deleted_at,u.full_name,u.email
      FROM workers w JOIN users u ON u.id=w.user_id WHERE w.id=? LIMIT 1 FOR UPDATE`,[workerId]);
    worker=rows[0];
    if(!worker){await conn.rollback();return res.status(404).json({success:false,message:'Worker not found'})}
    if(worker.profile_deleted_at){await conn.rollback();return res.status(409).json({success:false,message:'Worker profile is already deleted'})}

    await suspendWorkerServices(conn,workerId);
    await conn.query(`UPDATE workers SET
      verification_status='REJECTED',
      profile_deleted_at=CURRENT_TIMESTAMP,
      profile_deleted_reason=?,
      bio=NULL,introduction=NULL,service_area=NULL,working_hours=NULL
      WHERE id=?`,[reason,workerId]);
    await conn.query(`INSERT INTO admin_worker_deletion_log(worker_id,action,reason,admin_email)
      VALUES(?,'PROFILE_DELETE',?,?)`,[workerId,reason,req.admin.email||null]);
    await conn.commit();
  }catch(e){
    await conn.rollback().catch(()=>{});
    return next(e);
  }finally{conn.release()}

  await notify(req.app,worker.user_id,'Worker profile removed',`The cooperative removed your professional worker profile. Reason: ${reason}`,'ACCOUNT').catch(()=>{});
  emitWorkerEvent(req,worker.user_id,{type:'PROFILE_DELETED',reason});
  res.json({success:true,data:{workerId,profileDeleted:true,reason}});
});

router.delete('/workers/:id',adminAuth,async(req,res,next)=>{
  const workerId=Number(req.params.id);
  const confirmText=String(req.body.confirmText||'').trim();
  const reason=reasonValue(req.body.reason);
  if(!Number.isInteger(workerId)||workerId<1)return res.status(400).json({success:false,message:'Invalid worker'});
  if(confirmText!==`DELETE WORKER ${workerId}`){
    return res.status(400).json({success:false,message:`Type DELETE WORKER ${workerId} to confirm permanent deletion`});
  }
  if(reason.length<3)return res.status(400).json({success:false,message:'Enter a permanent deletion reason of at least 3 characters'});

  await Promise.all([ensureWorkerModeration(pool),ensureDeletionAudit()]);
  const conn=await pool.getConnection();
  let worker=null;
  try{
    await conn.beginTransaction();
    const [rows]=await conn.query(`SELECT w.id,w.user_id,u.email
      FROM workers w JOIN users u ON u.id=w.user_id WHERE w.id=? LIMIT 1 FOR UPDATE`,[workerId]);
    worker=rows[0];
    if(!worker){await conn.rollback();return res.status(404).json({success:false,message:'Worker not found'})}
    const userId=Number(worker.user_id);

    await runDeleteIfTable(conn,'support_messages','DELETE sm FROM support_messages sm JOIN support_tickets st ON st.id=sm.ticket_id WHERE st.user_id=?',[userId]);
    await runDeleteIfTable(conn,'support_messages','DELETE FROM support_messages WHERE sender_user_id=?',[userId]);
    await runDeleteIfTable(conn,'support_tickets','DELETE FROM support_tickets WHERE user_id=?',[userId]);

    await runDeleteIfTable(conn,'payments','DELETE p FROM payments p JOIN bookings b ON b.id=p.booking_id WHERE b.worker_id=?',[workerId]);
    await runDeleteIfTable(conn,'booking_messages','DELETE bm FROM booking_messages bm JOIN bookings b ON b.id=bm.booking_id WHERE b.worker_id=?',[workerId]);
    await runDeleteIfTable(conn,'booking_messages','DELETE FROM booking_messages WHERE sender_id=? OR receiver_id=?',[userId,userId]);
    await runDeleteIfTable(conn,'bargain_offers','DELETE bo FROM bargain_offers bo JOIN bookings b ON b.id=bo.booking_id WHERE b.worker_id=?',[workerId]);
    await runDeleteIfTable(conn,'bargain_offers','DELETE FROM bargain_offers WHERE sender_id=? OR receiver_id=?',[userId,userId]);
    await runDeleteIfTable(conn,'reviews','DELETE FROM reviews WHERE worker_id=?',[workerId]);
    await runDeleteIfTable(conn,'reward_transactions','DELETE rt FROM reward_transactions rt JOIN bookings b ON b.id=rt.booking_id WHERE b.worker_id=?',[workerId]);
    await runDeleteIfTable(conn,'bookings','DELETE FROM bookings WHERE worker_id=?',[workerId]);

    await runDeleteIfTable(conn,'worker_welfare','DELETE FROM worker_welfare WHERE worker_id=?',[workerId]);
    await runDeleteIfTable(conn,'worker_insurance','DELETE FROM worker_insurance WHERE worker_id=?',[workerId]);
    await runDeleteIfTable(conn,'worker_suspended_services','DELETE FROM worker_suspended_services WHERE worker_id=?',[workerId]);
    await runDeleteIfTable(conn,'worker_availability','DELETE FROM worker_availability WHERE worker_id=?',[workerId]);
    await runDeleteIfTable(conn,'worker_services','DELETE FROM worker_services WHERE worker_id=?',[workerId]);

    await runDeleteIfTable(conn,'user_locations','DELETE FROM user_locations WHERE user_id=?',[userId]);
    await runDeleteIfTable(conn,'notifications','DELETE FROM notifications WHERE user_id=?',[userId]);
    await runDeleteIfTable(conn,'reward_transactions','DELETE FROM reward_transactions WHERE user_id=?',[userId]);
    await runDeleteIfTable(conn,'email_otps','DELETE FROM email_otps WHERE email=?',[worker.email]);

    await conn.query('DELETE FROM workers WHERE id=?',[workerId]);
    const [userDelete]=await conn.query("DELETE FROM users WHERE id=? AND role='WORKER'",[userId]);
    if(!userDelete.affectedRows)throw new Error('Worker account could not be deleted');

    await conn.query(`INSERT INTO admin_worker_deletion_log(worker_id,action,reason,admin_email)
      VALUES(?,'PERMANENT_ERASE',?,?)`,[workerId,reason,req.admin.email||null]);
    await conn.commit();
  }catch(e){
    await conn.rollback().catch(()=>{});
    return next(e);
  }finally{conn.release()}

  emitWorkerEvent(req,worker.user_id,{type:'ACCOUNT_DELETED'});
  res.json({success:true,data:{workerId,permanentlyDeleted:true}});
});

module.exports=router;
