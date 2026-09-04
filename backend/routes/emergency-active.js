const express=require('express');
const pool=require('../config');
const {auth,authorize}=require('../middleware/auth');
const router=express.Router();

async function tableExists(name){
  const [rows]=await pool.query('SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? LIMIT 1',[name]);
  return Boolean(rows.length);
}

router.get('/',auth,authorize('USER'),async(req,res,next)=>{try{
  if(!(await tableExists('emergency_requests')))return res.json({success:true,data:null});
  await pool.query("UPDATE emergency_requests SET status='NO_WORKER_FOUND' WHERE user_id=? AND status='SEARCHING' AND expires_at<=NOW()",[req.user.id]);
  const [rows]=await pool.query(`SELECT er.id request_id,er.status,er.expires_at,s.name service_name
    FROM emergency_requests er JOIN services s ON s.id=er.service_id
    WHERE er.user_id=? AND er.status='SEARCHING' AND er.expires_at>NOW()
    ORDER BY er.id DESC LIMIT 1`,[req.user.id]);
  const r=rows[0];
  res.json({success:true,data:r?{requestId:Number(r.request_id),status:r.status,serviceName:r.service_name,expiresAt:r.expires_at}:null});
}catch(e){next(e)}});

module.exports=router;
