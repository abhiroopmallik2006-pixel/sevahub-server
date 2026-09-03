const express=require('express');
const pool=require('../config');
const {auth,authorize}=require('../middleware/auth');
const {
  WELFARE_BENEFITS,
  COVERAGE_TYPES,
  ensureWelfareTables,
  effectiveInsuranceStatus,
  dateOnly
}=require('../utils/welfare');

const router=express.Router();

async function currentWorker(userId){
  const [rows]=await pool.query('SELECT id,user_id FROM workers WHERE user_id=? LIMIT 1',[userId]);
  return rows[0]||null;
}

router.get('/me',auth,authorize('WORKER'),async(req,res,next)=>{try{
  await ensureWelfareTables(pool);
  const worker=await currentWorker(req.user.id);
  if(!worker)return res.status(404).json({success:false,message:'Worker profile not found'});

  const [[welfareRows],[insuranceRows]]=await Promise.all([
    pool.query(`SELECT status,member_id,requested_at,reviewed_at,review_note FROM worker_welfare WHERE worker_id=? LIMIT 1`,[worker.id]),
    pool.query(`SELECT provider_name,policy_number,coverage_type,valid_until,status,submitted_at,reviewed_at,review_note,removed_at,removal_reason FROM worker_insurance WHERE worker_id=? LIMIT 1`,[worker.id])
  ]);

  const welfare=welfareRows[0]||{};
  const insurance=insuranceRows[0]||{};
  res.json({
    success:true,
    data:{
      workerId:Number(worker.id),
      welfare:{
        status:String(welfare.status||'NOT_ENROLLED').toUpperCase(),
        memberId:welfare.member_id||null,
        requestedAt:welfare.requested_at||null,
        reviewedAt:welfare.reviewed_at||null,
        reviewNote:welfare.review_note||null,
        benefits:WELFARE_BENEFITS
      },
      insurance:{
        providerName:insurance.provider_name||'',
        policyNumber:insurance.policy_number||'',
        coverageType:insurance.coverage_type||'',
        validUntil:dateOnly(insurance.valid_until),
        status:effectiveInsuranceStatus(insurance),
        submittedAt:insurance.submitted_at||null,
        reviewedAt:insurance.reviewed_at||null,
        reviewNote:insurance.review_note||null,
        removedAt:insurance.removed_at||null,
        removalReason:insurance.removal_reason||null
      }
    }
  });
}catch(e){next(e)}});

router.post('/request',auth,authorize('WORKER'),async(req,res,next)=>{try{
  await ensureWelfareTables(pool);
  const worker=await currentWorker(req.user.id);
  if(!worker)return res.status(404).json({success:false,message:'Worker profile not found'});
  const [rows]=await pool.query('SELECT status,member_id FROM worker_welfare WHERE worker_id=? LIMIT 1',[worker.id]);
  const current=String(rows[0]?.status||'NOT_ENROLLED').toUpperCase();
  if(current==='ACTIVE')return res.json({success:true,data:{status:'ACTIVE',memberId:rows[0]?.member_id||null}});
  await pool.query(`
    INSERT INTO worker_welfare(worker_id,status,requested_at,reviewed_at,review_note)
    VALUES(?,'PENDING',CURRENT_TIMESTAMP,NULL,NULL)
    ON DUPLICATE KEY UPDATE status='PENDING',requested_at=CURRENT_TIMESTAMP,reviewed_at=NULL,review_note=NULL
  `,[worker.id]);
  res.json({success:true,data:{status:'PENDING'}});
}catch(e){next(e)}});

router.put('/insurance',auth,authorize('WORKER'),async(req,res,next)=>{try{
  await ensureWelfareTables(pool);
  const worker=await currentWorker(req.user.id);
  if(!worker)return res.status(404).json({success:false,message:'Worker profile not found'});

  const providerName=String(req.body.providerName||'').trim();
  const policyNumber=String(req.body.policyNumber||'').trim();
  const coverageType=String(req.body.coverageType||'').trim().toUpperCase();
  const validUntil=String(req.body.validUntil||'').trim();

  if(providerName.length<2||providerName.length>120)return res.status(400).json({success:false,message:'Provider name must be 2 to 120 characters'});
  if(policyNumber.length<2||policyNumber.length>120)return res.status(400).json({success:false,message:'Policy number must be 2 to 120 characters'});
  if(!COVERAGE_TYPES.has(coverageType))return res.status(400).json({success:false,message:'Select a valid coverage type'});
  if(!/^\d{4}-\d{2}-\d{2}$/.test(validUntil))return res.status(400).json({success:false,message:'Select a valid policy expiry date'});
  const expiry=new Date(`${validUntil}T23:59:59`);
  if(!Number.isFinite(expiry.getTime())||expiry.getTime()<=Date.now())return res.status(400).json({success:false,message:'Policy expiry date must be in the future'});

  await pool.query(`
    INSERT INTO worker_insurance(worker_id,provider_name,policy_number,coverage_type,valid_until,status,submitted_at,reviewed_at,review_note,removed_at,removal_reason)
    VALUES(?,?,?,?,?,'PENDING',CURRENT_TIMESTAMP,NULL,NULL,NULL,NULL)
    ON DUPLICATE KEY UPDATE provider_name=VALUES(provider_name),policy_number=VALUES(policy_number),coverage_type=VALUES(coverage_type),valid_until=VALUES(valid_until),status='PENDING',submitted_at=CURRENT_TIMESTAMP,reviewed_at=NULL,review_note=NULL,removed_at=NULL,removal_reason=NULL
  `,[worker.id,providerName,policyNumber,coverageType,validUntil]);
  res.json({success:true,data:{status:'PENDING'}});
}catch(e){next(e)}});

module.exports=router;
