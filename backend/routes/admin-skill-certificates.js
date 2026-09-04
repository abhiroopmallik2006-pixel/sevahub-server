const express=require('express');
const jwt=require('jsonwebtoken');
const pool=require('../config');
const {notify}=require('../utils/notifications');
const {ensureSkillCertificateTable,certificateMeta}=require('../utils/skillCertificates');

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

router.get('/skill-certificates',adminAuth,async(req,res,next)=>{
  try{
    await ensureSkillCertificateTable();
    const [rows]=await pool.query(`
      SELECT c.id,c.worker_id,c.service_id,c.title,c.issuer,c.file_name,c.mime_type,c.file_size,c.status,c.review_reason,
        c.reviewed_by,c.uploaded_at,c.reviewed_at,c.updated_at,
        s.name service_name,w.user_id,w.verification_status worker_verification_status,w.is_banned,w.profile_deleted_at,
        u.full_name worker_name,u.email worker_email
      FROM worker_skill_certificates c
      JOIN workers w ON w.id=c.worker_id
      JOIN users u ON u.id=w.user_id
      LEFT JOIN services s ON s.id=c.service_id
      ORDER BY FIELD(c.status,'PENDING','REJECTED','VERIFIED'),c.updated_at DESC
      LIMIT 300`);
    res.json({success:true,data:rows.map(row=>({...certificateMeta(row),workerName:row.worker_name,workerEmail:row.worker_email,workerVerificationStatus:row.worker_verification_status,isBanned:Boolean(row.is_banned),profileDeletedAt:row.profile_deleted_at||null}))});
  }catch(e){next(e)}
});

router.get('/skill-certificates/:id/file',adminAuth,async(req,res,next)=>{
  try{
    await ensureSkillCertificateTable();
    const id=Number(req.params.id);
    if(!Number.isInteger(id)||id<1)return res.status(400).json({success:false,message:'Invalid certificate'});
    const [rows]=await pool.query('SELECT file_name,mime_type,file_size,file_data FROM worker_skill_certificates WHERE id=? LIMIT 1',[id]);
    if(!rows.length)return res.status(404).json({success:false,message:'Certificate not found'});
    const cert=rows[0];
    res.setHeader('Content-Type',cert.mime_type);
    res.setHeader('Content-Length',String(cert.file_size));
    res.setHeader('Content-Disposition',`inline; filename="${cert.file_name.replace(/["\\]/g,'_')}"`);
    res.setHeader('Cache-Control','private, no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.send(cert.file_data);
  }catch(e){next(e)}
});

router.put('/skill-certificates/:id/status',adminAuth,async(req,res,next)=>{
  const id=Number(req.params.id);
  const status=String(req.body.status||'').trim().toUpperCase();
  const reason=String(req.body.reason||'').trim();
  if(!Number.isInteger(id)||id<1)return res.status(400).json({success:false,message:'Invalid certificate'});
  if(!['PENDING','VERIFIED','REJECTED'].includes(status))return res.status(400).json({success:false,message:'Invalid certificate status'});
  if(status==='REJECTED'&&(reason.length<3||reason.length>500))return res.status(400).json({success:false,message:'Rejection reason must be 3 to 500 characters'});
  if(reason.length>500)return res.status(400).json({success:false,message:'Review reason must be 500 characters or less'});

  await ensureSkillCertificateTable();
  const conn=await pool.getConnection();
  let member=null;
  try{
    await conn.beginTransaction();
    const [rows]=await conn.query(`
      SELECT c.id,c.title,c.status,c.worker_id,w.user_id,u.full_name
      FROM worker_skill_certificates c
      JOIN workers w ON w.id=c.worker_id
      JOIN users u ON u.id=w.user_id
      WHERE c.id=? LIMIT 1 FOR UPDATE`,[id]);
    if(!rows.length){await conn.rollback();return res.status(404).json({success:false,message:'Certificate not found'})}
    member=rows[0];
    if(status==='PENDING'){
      await conn.query(`UPDATE worker_skill_certificates SET status='PENDING',review_reason=NULL,reviewed_by=NULL,reviewed_at=NULL WHERE id=?`,[id]);
    }else{
      await conn.query(`UPDATE worker_skill_certificates SET status=?,review_reason=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?`,[
        status,status==='REJECTED'?reason:(reason||null),String(req.admin.email||'ADMIN').slice(0,150),id
      ]);
    }
    await conn.commit();
  }catch(e){try{await conn.rollback()}catch(_e){};throw e}
  finally{conn.release()}

  const title=status==='VERIFIED'?'Skill certificate verified':status==='REJECTED'?'Skill certificate needs changes':'Skill certificate review reset';
  const message=status==='VERIFIED'
    ?`Your ${member.title} certificate was verified by the cooperative. Your skill badge is now active.`
    :status==='REJECTED'
      ?`Your ${member.title} certificate was rejected: ${reason}`
      :`Your ${member.title} certificate is pending cooperative review again.`;
  await notify(req.app,member.user_id,title,message,'VERIFICATION').catch(()=>{});
  req.app.get('io')?.to(`user-${member.user_id}`).emit('skill-certificate:updated',{certificateId:id,status});
  res.json({success:true,data:{id,status,reason:status==='REJECTED'?reason:null}});
});

module.exports=router;
