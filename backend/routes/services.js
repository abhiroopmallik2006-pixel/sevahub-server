const express=require('express');
const pool=require('../config');
const {ensureSkillCertificateTable}=require('../utils/skillCertificates');
const router=express.Router();

router.get('/',async(req,res,next)=>{
  try{
    const [rows]=await pool.query(`
      SELECT s.id,s.name,s.description,s.icon,s.base_price,
      COUNT(ws.id) worker_count
      FROM services s LEFT JOIN worker_services ws ON ws.service_id=s.id
      GROUP BY s.id ORDER BY s.name`);
    res.json({success:true,data:rows});
  }catch(e){next(e)}
});

router.get('/:id/workers',async(req,res,next)=>{
  try{
    await ensureSkillCertificateTable();
    const [rows]=await pool.query(`
      SELECT w.id worker_id,u.id user_id,u.full_name,u.username,u.profile_image,
      w.experience_years,w.verification_status,w.service_area,w.service_radius,
      w.working_hours,w.rating,w.total_reviews,ws.price service_price,s.name service_name,
      c.status skill_certificate_status,c.title skill_certificate_title,c.issuer skill_certificate_issuer
      FROM worker_services ws
      JOIN workers w ON w.id=ws.worker_id
      JOIN users u ON u.id=w.user_id
      JOIN services s ON s.id=ws.service_id
      LEFT JOIN worker_skill_certificates c ON c.worker_id=w.id AND c.service_id=ws.service_id
      WHERE ws.service_id=? ORDER BY w.rating DESC,w.total_reviews DESC`,[req.params.id]);
    res.json({success:true,data:rows});
  }catch(e){next(e)}
});
module.exports=router;
