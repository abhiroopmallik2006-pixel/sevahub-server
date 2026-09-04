const express=require('express');
const pool=require('../config');
const {auth,authorize}=require('../middleware/auth');
const {ensureWorkerModeration}=require('../utils/workerModeration');
const {ensureSkillCertificateTable,certificateMeta,detectedMime,safeCertificateFilename}=require('../utils/skillCertificates');

const router=express.Router();
const MAX_CERT_BYTES=3*1024*1024;

function decodeHeader(value){
  try{return decodeURIComponent(String(value||''))}catch(e){return String(value||'')}
}

function rawCertificate(req,res,next){
  express.raw({type:'application/octet-stream',limit:MAX_CERT_BYTES})(req,res,err=>{
    if(!err)return next();
    if(err.type==='entity.too.large')return res.status(413).json({success:false,message:'Certificate file must be 3 MB or smaller'});
    next(err);
  });
}

async function workerRowByUser(userId){
  await ensureWorkerModeration(pool);
  const [rows]=await pool.query(`
    SELECT w.id,w.user_id,w.is_banned,w.ban_reason,w.profile_deleted_at,w.profile_deleted_reason,
      (SELECT ws.service_id FROM worker_services ws WHERE ws.worker_id=w.id ORDER BY ws.id LIMIT 1) service_id
    FROM workers w WHERE w.user_id=? LIMIT 1`,[userId]);
  return rows[0]||null;
}

async function certificateByWorker(workerId,withData=false){
  await ensureSkillCertificateTable();
  const [rows]=await pool.query(`
    SELECT c.${withData?'file_data,':''}c.id,c.worker_id,c.service_id,c.title,c.issuer,c.file_name,c.mime_type,c.file_size,
      c.status,c.review_reason,c.reviewed_by,c.uploaded_at,c.reviewed_at,c.updated_at,s.name service_name
    FROM worker_skill_certificates c
    LEFT JOIN services s ON s.id=c.service_id
    WHERE c.worker_id=? LIMIT 1`,[workerId]);
  return rows[0]||null;
}

router.get('/me',auth,authorize('WORKER'),async(req,res,next)=>{
  try{
    const worker=await workerRowByUser(req.user.id);
    if(!worker)return res.status(404).json({success:false,message:'Worker profile not found'});
    const cert=await certificateByWorker(worker.id,false);
    res.json({success:true,data:certificateMeta(cert)});
  }catch(e){next(e)}
});

router.post('/me',auth,authorize('WORKER'),rawCertificate,async(req,res,next)=>{
  try{
    await ensureSkillCertificateTable();
    const worker=await workerRowByUser(req.user.id);
    if(!worker)return res.status(404).json({success:false,message:'Worker profile not found'});
    if(worker.profile_deleted_at)return res.status(403).json({success:false,message:`Certificate upload is disabled because your worker profile was deleted${worker.profile_deleted_reason?`: ${worker.profile_deleted_reason}`:''}`});
    if(Boolean(worker.is_banned))return res.status(403).json({success:false,message:`Certificate upload is disabled while your worker account is restricted${worker.ban_reason?`: ${worker.ban_reason}`:''}`});
    if(!worker.service_id)return res.status(400).json({success:false,message:'Configure your worker service before uploading a skill certificate'});

    const buffer=req.body;
    if(!Buffer.isBuffer(buffer)||buffer.length<1)return res.status(400).json({success:false,message:'Choose a certificate file to upload'});
    if(buffer.length>MAX_CERT_BYTES)return res.status(413).json({success:false,message:'Certificate file must be 3 MB or smaller'});

    const mime=detectedMime(buffer);
    if(!mime)return res.status(415).json({success:false,message:'Only genuine PDF, JPG or PNG certificate files are allowed'});

    const title=decodeHeader(req.headers['x-certificate-title']).trim();
    const issuer=decodeHeader(req.headers['x-certificate-issuer']).trim();
    const originalFilename=decodeHeader(req.headers['x-certificate-filename']).trim();
    if(title.length<2||title.length>160)return res.status(400).json({success:false,message:'Certificate title must be 2 to 160 characters'});
    if(issuer.length>160)return res.status(400).json({success:false,message:'Issuer name must be 160 characters or less'});
    const fileName=safeCertificateFilename(originalFilename||title,mime);

    await pool.query(`
      INSERT INTO worker_skill_certificates
        (worker_id,service_id,title,issuer,file_name,mime_type,file_size,file_data,status,review_reason,reviewed_by,uploaded_at,reviewed_at)
      VALUES(?,?,?,?,?,?,?,?,'PENDING',NULL,NULL,CURRENT_TIMESTAMP,NULL)
      ON DUPLICATE KEY UPDATE
        service_id=VALUES(service_id),title=VALUES(title),issuer=VALUES(issuer),file_name=VALUES(file_name),mime_type=VALUES(mime_type),
        file_size=VALUES(file_size),file_data=VALUES(file_data),status='PENDING',review_reason=NULL,reviewed_by=NULL,
        uploaded_at=CURRENT_TIMESTAMP,reviewed_at=NULL`,[
      worker.id,worker.service_id,title,issuer||null,fileName,mime,buffer.length,buffer
    ]);

    const cert=await certificateByWorker(worker.id,false);
    res.status(201).json({success:true,message:'Certificate submitted for cooperative verification',data:certificateMeta(cert)});
  }catch(e){next(e)}
});

router.get('/me/file',auth,authorize('WORKER'),async(req,res,next)=>{
  try{
    const worker=await workerRowByUser(req.user.id);
    if(!worker)return res.status(404).json({success:false,message:'Worker profile not found'});
    const cert=await certificateByWorker(worker.id,true);
    if(!cert)return res.status(404).json({success:false,message:'No certificate uploaded'});
    res.setHeader('Content-Type',cert.mime_type);
    res.setHeader('Content-Length',String(cert.file_size));
    res.setHeader('Content-Disposition',`inline; filename="${cert.file_name.replace(/["\\]/g,'_')}"`);
    res.setHeader('Cache-Control','private, no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.send(cert.file_data);
  }catch(e){next(e)}
});

router.get('/public/:workerId',async(req,res,next)=>{
  try{
    const workerId=Number(req.params.workerId);
    if(!Number.isInteger(workerId)||workerId<1)return res.status(400).json({success:false,message:'Invalid worker'});
    const cert=await certificateByWorker(workerId,false);
    if(!cert||String(cert.status).toUpperCase()!=='VERIFIED')return res.json({success:true,data:null});
    const meta=certificateMeta(cert);
    res.json({success:true,data:{workerId:meta.workerId,serviceId:meta.serviceId,serviceName:meta.serviceName,title:meta.title,issuer:meta.issuer,status:'VERIFIED',reviewedAt:meta.reviewedAt}});
  }catch(e){next(e)}
});

module.exports=router;
