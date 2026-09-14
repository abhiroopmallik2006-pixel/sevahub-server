const express=require('express');
const jwt=require('jsonwebtoken');
const pool=require('../config');
const {notify}=require('../utils/notifications');
const {
  WELFARE_BENEFITS,
  ensureWelfareTables,
  welfareMemberId,
  effectiveInsuranceStatus,
  dateOnly
}=require('../utils/welfare');
const {
  ensureWorkerModeration,
  suspendWorkerServices,
  restoreWorkerServices
}=require('../utils/workerModeration');

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

function noteValue(value){return String(value||'').trim().slice(0,500)}
async function workerAccount(workerId){
  const [rows]=await pool.query(`SELECT w.id,w.user_id,u.full_name FROM workers w JOIN users u ON u.id=w.user_id WHERE w.id=? LIMIT 1`,[workerId]);
  return rows[0]||null;
}
function emitModeration(req,userId,payload){
  try{req.app.get('io')?.to(`user-${userId}`).emit('worker-moderation-changed',payload)}catch(e){}
}

router.get('/',adminAuth,async(req,res,next)=>{try{
  await Promise.all([ensureWelfareTables(pool),ensureWorkerModeration(pool)]);
  const [rows]=await pool.query(`
    SELECT w.id worker_id,w.user_id,u.full_name,u.username,u.email,u.phone,
      w.experience_years,w.bio,w.verification_status,w.service_area,w.service_radius,w.working_hours,w.introduction,w.rating,w.total_reviews,w.created_at worker_since,
      w.is_banned,w.ban_reason,w.banned_at,
      COALESCE(
        (SELECT GROUP_CONCAT(DISTINCT s.name ORDER BY s.name SEPARATOR ', ') FROM worker_services ws JOIN services s ON s.id=ws.service_id WHERE ws.worker_id=w.id),
        (SELECT GROUP_CONCAT(DISTINCT s.name ORDER BY s.name SEPARATOR ', ') FROM worker_suspended_services sws JOIN services s ON s.id=sws.service_id WHERE sws.worker_id=w.id)
      ) services,
      COALESCE(
        (SELECT s.name FROM worker_services ws JOIN services s ON s.id=ws.service_id WHERE ws.worker_id=w.id ORDER BY ws.id LIMIT 1),
        (SELECT s.name FROM worker_suspended_services sws JOIN services s ON s.id=sws.service_id WHERE sws.worker_id=w.id ORDER BY sws.service_id LIMIT 1)
      ) primary_service,
      COALESCE(
        (SELECT ws.price FROM worker_services ws WHERE ws.worker_id=w.id ORDER BY ws.id LIMIT 1),
        (SELECT sws.price FROM worker_suspended_services sws WHERE sws.worker_id=w.id ORDER BY sws.service_id LIMIT 1)
      ) starting_price,
      ww.status welfare_status,ww.member_id,ww.requested_at welfare_requested_at,ww.reviewed_at welfare_reviewed_at,ww.review_note welfare_review_note,
      wi.provider_name,wi.policy_number,wi.coverage_type,wi.valid_until,wi.status insurance_status,wi.submitted_at insurance_submitted_at,wi.reviewed_at insurance_reviewed_at,wi.review_note insurance_review_note,wi.removed_at insurance_removed_at,wi.removal_reason insurance_removal_reason
    FROM workers w
    JOIN users u ON u.id=w.user_id
    LEFT JOIN worker_welfare ww ON ww.worker_id=w.id
    LEFT JOIN worker_insurance wi ON wi.worker_id=w.id
    ORDER BY w.is_banned DESC,(COALESCE(ww.status,'NOT_ENROLLED')='PENDING') DESC,(COALESCE(wi.status,'NOT_ENROLLED')='PENDING') DESC,w.id DESC
    LIMIT 400
  `);

  const data=rows.map(row=>({
    workerId:Number(row.worker_id),
    userId:Number(row.user_id),
    fullName:row.full_name,
    username:row.username,
    email:row.email,
    phone:row.phone||'',
    services:row.services||'Not set',
    moderation:{
      isBanned:Boolean(row.is_banned),
      banReason:row.ban_reason||null,
      bannedAt:row.banned_at||null
    },
    profile:{
      primaryService:row.primary_service||'Not set',
      startingPrice:Number(row.starting_price||0),
      experienceYears:Number(row.experience_years||0),
      bio:row.bio||'',
      verificationStatus:String(row.verification_status||'PENDING').toUpperCase(),
      serviceArea:row.service_area||'',
      serviceRadius:Number(row.service_radius||0),
      workingHours:row.working_hours||'',
      introduction:row.introduction||'',
      rating:Number(row.rating||0),
      totalReviews:Number(row.total_reviews||0),
      workerSince:row.worker_since||null
    },
    welfare:{
      status:String(row.welfare_status||'NOT_ENROLLED').toUpperCase(),
      memberId:row.member_id||null,
      requestedAt:row.welfare_requested_at||null,
      reviewedAt:row.welfare_reviewed_at||null,
      reviewNote:row.welfare_review_note||null
    },
    insurance:{
      providerName:row.provider_name||'',
      policyNumber:row.policy_number||'',
      coverageType:row.coverage_type||'',
      validUntil:dateOnly(row.valid_until),
      status:effectiveInsuranceStatus({status:row.insurance_status,valid_until:row.valid_until}),
      submittedAt:row.insurance_submitted_at||null,
      reviewedAt:row.insurance_reviewed_at||null,
      reviewNote:row.insurance_review_note||null,
      removedAt:row.insurance_removed_at||null,
      removalReason:row.insurance_removal_reason||null
    }
  }));

  const summary={
    totalWorkers:data.length,
    bannedWorkers:data.filter(x=>x.moderation.isBanned).length,
    welfareActive:data.filter(x=>x.welfare.status==='ACTIVE').length,
    welfarePending:data.filter(x=>x.welfare.status==='PENDING').length,
    insuranceVerified:data.filter(x=>x.insurance.status==='VERIFIED').length,
    insurancePending:data.filter(x=>x.insurance.status==='PENDING').length,
    insuranceExpired:data.filter(x=>x.insurance.status==='EXPIRED').length,
    insuranceRemoved:data.filter(x=>x.insurance.status==='REMOVED').length
  };

  res.json({success:true,data:{summary,workers:data,benefits:WELFARE_BENEFITS}});
}catch(e){next(e)}});

router.put('/workers/:id/welfare',adminAuth,async(req,res,next)=>{try{
  await ensureWelfareTables(pool);
  const workerId=Number(req.params.id);
  const status=String(req.body.status||'').trim().toUpperCase();
  const note=noteValue(req.body.note);
  if(!Number.isInteger(workerId)||workerId<1)return res.status(400).json({success:false,message:'Invalid worker'});
  if(!['ACTIVE','REJECTED'].includes(status))return res.status(400).json({success:false,message:'Invalid welfare status'});
  const worker=await workerAccount(workerId);
  if(!worker)return res.status(404).json({success:false,message:'Worker not found'});
  const [requests]=await pool.query('SELECT id,status FROM worker_welfare WHERE worker_id=? LIMIT 1',[workerId]);
  if(!requests.length)return res.status(400).json({success:false,message:'Worker has not requested welfare enrollment'});

  const memberId=status==='ACTIVE'?welfareMemberId(workerId):null;
  await pool.query(`UPDATE worker_welfare SET status=?,member_id=?,reviewed_at=CURRENT_TIMESTAMP,review_note=? WHERE worker_id=?`,[status,memberId,note||null,workerId]);
  const title=status==='ACTIVE'?'Welfare enrollment approved':'Welfare enrollment update';
  const message=status==='ACTIVE'
    ?`Your SevaHub Cooperative Welfare membership is active. Member ID: ${memberId}.`
    :`Your welfare enrollment request was not approved${note?`: ${note}`:'.'}`;
  await notify(req.app,worker.user_id,title,message,'ACCOUNT').catch(()=>{});
  res.json({success:true,data:{workerId,status,memberId}});
}catch(e){next(e)}});

router.put('/workers/:id/insurance',adminAuth,async(req,res,next)=>{try{
  await ensureWelfareTables(pool);
  const workerId=Number(req.params.id);
  const status=String(req.body.status||'').trim().toUpperCase();
  const note=noteValue(req.body.note);
  if(!Number.isInteger(workerId)||workerId<1)return res.status(400).json({success:false,message:'Invalid worker'});
  if(!['VERIFIED','REJECTED'].includes(status))return res.status(400).json({success:false,message:'Invalid insurance review status'});
  const worker=await workerAccount(workerId);
  if(!worker)return res.status(404).json({success:false,message:'Worker not found'});
  const [records]=await pool.query('SELECT provider_name,policy_number,valid_until,status FROM worker_insurance WHERE worker_id=? LIMIT 1',[workerId]);
  if(!records.length||!records[0].provider_name||!records[0].policy_number)return res.status(400).json({success:false,message:'Worker has not submitted an insurance record'});
  if(String(records[0].status||'').toUpperCase()!=='PENDING')return res.status(400).json({success:false,message:'Only a pending insurance record can be reviewed'});
  if(status==='VERIFIED'){
    const expiry=new Date(`${dateOnly(records[0].valid_until)}T23:59:59`);
    if(!Number.isFinite(expiry.getTime())||expiry.getTime()<=Date.now())return res.status(400).json({success:false,message:'This policy record is already expired'});
  }

  await pool.query(`UPDATE worker_insurance SET status=?,reviewed_at=CURRENT_TIMESTAMP,review_note=?,removed_at=NULL,removal_reason=NULL WHERE worker_id=?`,[status,note||null,workerId]);
  const title=status==='VERIFIED'?'Insurance record reviewed':'Insurance record update';
  const message=status==='VERIFIED'
    ?'Your submitted insurance record has been reviewed and marked verified by the cooperative.'
    :`Your submitted insurance record was not approved${note?`: ${note}`:'.'}`;
  await notify(req.app,worker.user_id,title,message,'ACCOUNT').catch(()=>{});
  res.json({success:true,data:{workerId,status}});
}catch(e){next(e)}});

router.put('/workers/:id/insurance/remove',adminAuth,async(req,res,next)=>{try{
  await ensureWelfareTables(pool);
  const workerId=Number(req.params.id);
  const reason=noteValue(req.body.reason);
  if(!Number.isInteger(workerId)||workerId<1)return res.status(400).json({success:false,message:'Invalid worker'});
  if(reason.length<3)return res.status(400).json({success:false,message:'Enter a removal reason of at least 3 characters'});
  const worker=await workerAccount(workerId);
  if(!worker)return res.status(404).json({success:false,message:'Worker not found'});
  const [records]=await pool.query('SELECT provider_name,policy_number,status FROM worker_insurance WHERE worker_id=? LIMIT 1',[workerId]);
  if(!records.length||!records[0].provider_name||!records[0].policy_number)return res.status(400).json({success:false,message:'Worker has no insurance record to remove'});
  if(String(records[0].status||'').toUpperCase()==='REMOVED')return res.status(400).json({success:false,message:'Insurance record is already removed'});

  await pool.query(`UPDATE worker_insurance SET status='REMOVED',removed_at=CURRENT_TIMESTAMP,removal_reason=?,reviewed_at=CURRENT_TIMESTAMP,review_note=NULL WHERE worker_id=?`,[reason,workerId]);
  await notify(req.app,worker.user_id,'Insurance record removed',`The cooperative removed your insurance record. Reason: ${reason}`,'ACCOUNT').catch(()=>{});
  emitModeration(req,worker.user_id,{type:'INSURANCE_REMOVED',reason});
  res.json({success:true,data:{workerId,status:'REMOVED',reason}});
}catch(e){next(e)}});

router.put('/workers/:id/ban',adminAuth,async(req,res,next)=>{
  const workerId=Number(req.params.id);
  const banned=Boolean(req.body.banned);
  const reason=noteValue(req.body.reason);
  if(!Number.isInteger(workerId)||workerId<1)return res.status(400).json({success:false,message:'Invalid worker'});
  if(banned&&reason.length<3)return res.status(400).json({success:false,message:'Enter a ban reason of at least 3 characters'});

  await ensureWorkerModeration(pool);
  const worker=await workerAccount(workerId);
  if(!worker)return res.status(404).json({success:false,message:'Worker not found'});
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const [rows]=await conn.query('SELECT is_banned FROM workers WHERE id=? LIMIT 1 FOR UPDATE',[workerId]);
    if(!rows.length){await conn.rollback();return res.status(404).json({success:false,message:'Worker not found'})}
    const currentlyBanned=Boolean(rows[0].is_banned);

    if(banned){
      if(!currentlyBanned)await suspendWorkerServices(conn,workerId);
      await conn.query('UPDATE workers SET is_banned=1,ban_reason=?,banned_at=COALESCE(banned_at,CURRENT_TIMESTAMP) WHERE id=?',[reason,workerId]);
    }else{
      await restoreWorkerServices(conn,workerId);
      await conn.query('UPDATE workers SET is_banned=0,ban_reason=NULL,banned_at=NULL WHERE id=?',[workerId]);
    }
    await conn.commit();
  }catch(e){
    await conn.rollback().catch(()=>{});
    return next(e);
  }finally{conn.release()}

  const title=banned?'Worker account restricted':'Worker account restored';
  const message=banned
    ?`Your SevaHub worker account has been restricted by the cooperative. Reason: ${reason}`
    :'Your SevaHub worker account restriction has been removed. Your service listing is active again.';
  await notify(req.app,worker.user_id,title,message,'ACCOUNT').catch(()=>{});
  emitModeration(req,worker.user_id,{type:banned?'BANNED':'UNBANNED',reason:banned?reason:null});
  res.json({success:true,data:{workerId,isBanned:banned,banReason:banned?reason:null}});
});

module.exports=router;
