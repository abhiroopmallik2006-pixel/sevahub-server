const express=require('express');
const pool=require('../config');
const {auth,authorize}=require('../middleware/auth');
const {ensureWorkerModeration}=require('../utils/workerModeration');
const router=express.Router();

async function workerProfileByUser(userId,db=pool){
  await ensureWorkerModeration(db);
  const [rows]=await db.query(`
    SELECT w.*,u.full_name,u.username,u.email,u.phone,
      COALESCE(
        (SELECT ws.service_id FROM worker_services ws WHERE ws.worker_id=w.id ORDER BY ws.id LIMIT 1),
        (SELECT sws.service_id FROM worker_suspended_services sws WHERE sws.worker_id=w.id ORDER BY sws.service_id LIMIT 1)
      ) service_id,
      COALESCE(
        (SELECT s.name FROM worker_services ws JOIN services s ON s.id=ws.service_id WHERE ws.worker_id=w.id ORDER BY ws.id LIMIT 1),
        (SELECT s.name FROM worker_suspended_services sws JOIN services s ON s.id=sws.service_id WHERE sws.worker_id=w.id ORDER BY sws.service_id LIMIT 1)
      ) service_name,
      COALESCE(
        (SELECT ws.price FROM worker_services ws WHERE ws.worker_id=w.id ORDER BY ws.id LIMIT 1),
        (SELECT sws.price FROM worker_suspended_services sws WHERE sws.worker_id=w.id ORDER BY sws.service_id LIMIT 1)
      ) service_price
    FROM workers w JOIN users u ON u.id=w.user_id WHERE w.user_id=?`,[userId]);
  return rows[0]||null;
}

router.get('/me',auth,authorize('WORKER'),async(req,res,next)=>{
  try{
    res.json({success:true,data:await workerProfileByUser(req.user.id)});
  }catch(e){next(e)}
});

router.put('/me',auth,authorize('WORKER'),async(req,res,next)=>{
  const fullName=String(req.body.fullName||'').trim();
  const phone=String(req.body.phone||'').trim();
  const experienceYears=Number(req.body.experienceYears);
  const serviceArea=String(req.body.serviceArea||'').trim();
  const serviceRadius=Number(req.body.serviceRadius);
  const workingHours=String(req.body.workingHours||'').trim();
  const bio=String(req.body.bio||'').trim();
  const introduction=String(req.body.introduction||'').trim();
  const price=Number(req.body.price);

  if(fullName.length<2||fullName.length>100)return res.status(400).json({success:false,message:'Name must be 2 to 100 characters'});
  if(phone.length>30)return res.status(400).json({success:false,message:'Phone number is too long'});
  if(!Number.isInteger(experienceYears)||experienceYears<0||experienceYears>60)return res.status(400).json({success:false,message:'Experience must be between 0 and 60 years'});
  if(serviceArea.length<2||serviceArea.length>255)return res.status(400).json({success:false,message:'Working area must be 2 to 255 characters'});
  if(!Number.isInteger(serviceRadius)||serviceRadius<1||serviceRadius>100)return res.status(400).json({success:false,message:'Service radius must be between 1 and 100 km'});
  if(workingHours.length<2||workingHours.length>100)return res.status(400).json({success:false,message:'Working hours must be 2 to 100 characters'});
  if(bio.length>1200)return res.status(400).json({success:false,message:'Bio must be 1200 characters or less'});
  if(introduction.length>1200)return res.status(400).json({success:false,message:'Introduction must be 1200 characters or less'});
  if(!Number.isFinite(price)||price<1||price>1000000)return res.status(400).json({success:false,message:'Starting price must be between ₹1 and ₹10,00,000'});

  await ensureWorkerModeration(pool);
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const [workers]=await conn.query('SELECT id,is_banned,ban_reason FROM workers WHERE user_id=? LIMIT 1 FOR UPDATE',[req.user.id]);
    if(!workers.length){await conn.rollback();return res.status(404).json({success:false,message:'Worker profile not found'})}
    if(Boolean(workers[0].is_banned)){
      await conn.rollback();
      return res.status(403).json({success:false,message:`Profile editing is disabled while your worker account is restricted${workers[0].ban_reason?`: ${workers[0].ban_reason}`:''}`});
    }
    const workerId=Number(workers[0].id);
    const [serviceRows]=await conn.query('SELECT id FROM worker_services WHERE worker_id=? ORDER BY id LIMIT 1 FOR UPDATE',[workerId]);
    if(!serviceRows.length){await conn.rollback();return res.status(400).json({success:false,message:'Worker service is not configured yet'})}

    await conn.query('UPDATE users SET full_name=?,phone=? WHERE id=?',[fullName,phone||null,req.user.id]);
    await conn.query(`UPDATE workers SET experience_years=?,bio=?,service_area=?,service_radius=?,working_hours=?,introduction=? WHERE id=?`,[
      experienceYears,bio||null,serviceArea,serviceRadius,workingHours,introduction||null,workerId
    ]);
    await conn.query('UPDATE worker_services SET price=? WHERE id=?',[price,serviceRows[0].id]);
    await conn.commit();
    res.json({success:true,data:await workerProfileByUser(req.user.id)});
  }catch(e){
    try{await conn.rollback()}catch(_e){}
    next(e);
  }finally{conn.release()}
});

router.get('/me/bargains',auth,authorize('WORKER'),async(req,res,next)=>{
  try{
    const [rows]=await pool.query(`
      SELECT b.id,b.booking_id,b.amount,b.message,b.status,b.created_at,
      b.sender_role,u.full_name customer_name,s.name service_name,
      bk.original_price,bk.final_price,bk.status booking_status
      FROM bargain_offers b
      JOIN bookings bk ON bk.id=b.booking_id
      JOIN users u ON u.id=b.sender_id
      JOIN services s ON s.id=bk.service_id
      JOIN workers w ON w.id=bk.worker_id
      WHERE w.user_id=? ORDER BY b.created_at DESC`,[req.user.id]);
    res.json({success:true,data:rows});
  }catch(e){next(e)}
});

router.get('/:id',async(req,res,next)=>{
  try{
    await ensureWorkerModeration(pool);
    const [rows]=await pool.query(`
      SELECT w.*,u.full_name,u.username,u.profile_image,u.email,u.phone
      FROM workers w JOIN users u ON u.id=w.user_id WHERE w.id=? AND COALESCE(w.is_banned,0)=0`,[req.params.id]);
    if(!rows.length) return res.status(404).json({success:false,message:'Worker not found'});
    const [services]=await pool.query(`
      SELECT s.id,s.name,ws.price FROM worker_services ws JOIN services s ON s.id=ws.service_id WHERE ws.worker_id=?`,[req.params.id]);
    res.json({success:true,data:{...rows[0],services}});
  }catch(e){next(e)}
});

module.exports=router;
