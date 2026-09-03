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

router.get('/',adminAuth,async(req,res,next)=>{try{
  await ensureWelfareTables(pool);
  const [rows]=await pool.query(`
    SELECT w.id worker_id,w.user_id,u.full_name,u.email,
      (SELECT GROUP_CONCAT(DISTINCT s.name ORDER BY s.name SEPARATOR ', ') FROM worker_services ws JOIN services s ON s.id=ws.service_id WHERE ws.worker_id=w.id) services,
      ww.status welfare_status,ww.member_id,ww.requested_at welfare_requested_at,ww.reviewed_at welfare_reviewed_at,ww.review_note welfare_review_note,
      wi.provider_name,wi.policy_number,wi.coverage_type,wi.valid_until,wi.status insurance_status,wi.submitted_at insurance_submitted_at,wi.reviewed_at insurance_reviewed_at,wi.review_note insurance_review_note
    FROM workers w
    JOIN users u ON u.id=w.user_id
    LEFT JOIN worker_welfare ww ON ww.worker_id=w.id
    LEFT JOIN worker_insurance wi ON wi.worker_id=w.id
    ORDER BY (COALESCE(ww.status,'NOT_ENROLLED')='PENDING') DESC,(COALESCE(wi.status,'NOT_ENROLLED')='PENDING') DESC,w.id DESC
    LIMIT 400
  `);

  const data=rows.map(row=>({
    workerId:Number(row.worker_id),
    userId:Number(row.user_id),
    fullName:row.full_name,
    email:row.email,
    services:row.services||'Not set',
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
      reviewNote:row.insurance_review_note||null
    }
  }));

  const summary={
    totalWorkers:data.length,
    welfareActive:data.filter(x=>x.welfare.status==='ACTIVE').length,
    welfarePending:data.filter(x=>x.welfare.status==='PENDING').length,
    insuranceVerified:data.filter(x=>x.insurance.status==='VERIFIED').length,
    insurancePending:data.filter(x=>x.insurance.status==='PENDING').length,
    insuranceExpired:data.filter(x=>x.insurance.status==='EXPIRED').length
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
  if(status==='VERIFIED'){
    const expiry=new Date(`${dateOnly(records[0].valid_until)}T23:59:59`);
    if(!Number.isFinite(expiry.getTime())||expiry.getTime()<=Date.now())return res.status(400).json({success:false,message:'This policy record is already expired'});
  }

  await pool.query(`UPDATE worker_insurance SET status=?,reviewed_at=CURRENT_TIMESTAMP,review_note=? WHERE worker_id=?`,[status,note||null,workerId]);
  const title=status==='VERIFIED'?'Insurance record reviewed':'Insurance record update';
  const message=status==='VERIFIED'
    ?'Your submitted insurance record has been reviewed and marked verified by the cooperative.'
    :`Your submitted insurance record was not approved${note?`: ${note}`:'.'}`;
  await notify(req.app,worker.user_id,title,message,'ACCOUNT').catch(()=>{});
  res.json({success:true,data:{workerId,status}});
}catch(e){next(e)}});

module.exports=router;
