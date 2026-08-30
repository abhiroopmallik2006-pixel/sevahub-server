const express=require('express');
const bcrypt=require('bcryptjs');
const jwt=require('jsonwebtoken');
const pool=require('../config');
const {sendOtpEmail}=require('../utils/mailer');
const {generateOtp,hashOtp,otpExpiryDate,MAX_ATTEMPTS,RESEND_COOLDOWN_SECONDS}=require('../utils/otp');
const router=express.Router();

const makeUsername=async(name)=>{
  const base=name.trim();
  let u=base, n=1;
  while(true){
    const [rows]=await pool.query('SELECT id FROM users WHERE username=?',[u]);
    if(!rows.length) return u;
    u=`${base}${n++}`;
  }
};

const isValidEmail=(email)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email||'').trim());

// --- Email OTP -------------------------------------------------------------

router.post('/send-otp',async(req,res,next)=>{
  try{
    const email=String(req.body.email||'').trim().toLowerCase();
    const purpose=['REGISTER','LOGIN','RESET'].includes(req.body.purpose)?req.body.purpose:'REGISTER';
    if(!isValidEmail(email)) return res.status(400).json({success:false,message:'Enter a valid email address'});

    if(purpose==='REGISTER'){
      const [existing]=await pool.query('SELECT id FROM users WHERE email=?',[email]);
      if(existing.length) return res.status(409).json({success:false,message:'This email is already registered. Please login instead.'});
    }

    // Throttle resends per email+purpose
    const [recent]=await pool.query(
      'SELECT created_at FROM email_otps WHERE email=? AND purpose=? ORDER BY created_at DESC LIMIT 1',
      [email,purpose]
    );
    if(recent.length){
      const secondsSince=(Date.now()-new Date(recent[0].created_at).getTime())/1000;
      if(secondsSince<RESEND_COOLDOWN_SECONDS){
        return res.status(429).json({success:false,message:`Please wait ${Math.ceil(RESEND_COOLDOWN_SECONDS-secondsSince)}s before requesting another code`});
      }
    }

    const otp=generateOtp();
    await pool.query(
      'INSERT INTO email_otps(email,otp_hash,purpose,expires_at) VALUES(?,?,?,?)',
      [email,hashOtp(otp),purpose,otpExpiryDate()]
    );
    const {simulated}=await sendOtpEmail(email,otp,{purpose});
    res.json({success:true,message:'Verification code sent to your email',...(simulated?{devOtp:otp}:{})});
  }catch(e){next(e)}
});

router.post('/verify-otp',async(req,res,next)=>{
  try{
    const email=String(req.body.email||'').trim().toLowerCase();
    const otp=String(req.body.otp||'').trim();
    const purpose=['REGISTER','LOGIN','RESET'].includes(req.body.purpose)?req.body.purpose:'REGISTER';
    if(!isValidEmail(email)||!otp) return res.status(400).json({success:false,message:'Email and code are required'});

    const [rows]=await pool.query(
      `SELECT * FROM email_otps WHERE email=? AND purpose=? AND verified=FALSE
       ORDER BY created_at DESC LIMIT 1`,[email,purpose]
    );
    if(!rows.length) return res.status(400).json({success:false,message:'No pending verification for this email. Please request a new code.'});
    const record=rows[0];

    if(new Date(record.expires_at).getTime()<Date.now()){
      return res.status(400).json({success:false,message:'This code has expired. Please request a new one.'});
    }
    if(record.attempts>=MAX_ATTEMPTS){
      return res.status(429).json({success:false,message:'Too many incorrect attempts. Please request a new code.'});
    }
    if(hashOtp(otp)!==record.otp_hash){
      await pool.query('UPDATE email_otps SET attempts=attempts+1 WHERE id=?',[record.id]);
      return res.status(400).json({success:false,message:'Incorrect code. Please try again.'});
    }
    await pool.query('UPDATE email_otps SET verified=TRUE WHERE id=?',[record.id]);
    res.json({success:true,message:'Email verified'});
  }catch(e){next(e)}
});

router.post('/register',async(req,res,next)=>{
  const {fullName,email:rawEmail,phone,password='admin',role='USER',experience=0,bio='',serviceArea='Delhi NCR',serviceRadius=10,workingHours='09:00 - 18:00',introduction='',services=[]}=req.body;
  const email=String(rawEmail||'').trim().toLowerCase();
  if(!fullName||!email) return res.status(400).json({success:false,message:'Name and email are required'});
  if(!['USER','WORKER'].includes(role)) return res.status(400).json({success:false,message:'Invalid role'});

  // Require a verified email OTP from the last 30 minutes before allowing registration
  const [verifiedOtp]=await pool.query(
    `SELECT id FROM email_otps WHERE email=? AND purpose='REGISTER' AND verified=TRUE
     AND created_at > (NOW() - INTERVAL 30 MINUTE) ORDER BY created_at DESC LIMIT 1`,[email]
  );
  if(!verifiedOtp.length) return res.status(400).json({success:false,message:'Please verify your email with the code sent to it before creating an account'});

  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const username=await makeUsername(fullName);
    const hash=await bcrypt.hash(password,10);
    const [u]=await conn.query('INSERT INTO users(full_name,username,email,phone,password_hash,role,email_verified) VALUES(?,?,?,?,?,?,TRUE)',
      [fullName,username,email,phone||null,hash,role]);
    const userId=u.insertId;
    if(role==='WORKER'){
      const [w]=await conn.query('INSERT INTO workers(user_id,experience_years,bio,service_area,service_radius,working_hours,introduction) VALUES(?,?,?,?,?,?,?)',
        [userId,Number(experience)||0,bio,serviceArea,Number(serviceRadius)||10,workingHours,introduction]);
      for(const item of Array.isArray(services)?services:[]){
        if(item.serviceId && Number(item.price)>0){
          await conn.query('INSERT INTO worker_services(worker_id,service_id,price) VALUES(?,?,?)',[w.insertId,item.serviceId,Number(item.price)]);
        }
      }
    }
    await conn.commit();
    await pool.query("DELETE FROM email_otps WHERE email=? AND purpose='REGISTER'",[email]);
    const token=jwt.sign({id:userId,role,username},process.env.JWT_SECRET,{expiresIn:'7d'});
    res.status(201).json({success:true,data:{user:{id:userId,fullName,username,email,role},token}});
  }catch(e){await conn.rollback(); next(e)} finally{conn.release()}
});

router.post('/login',async(req,res,next)=>{
  try{
    const {username,password}=req.body;
    const [rows]=await pool.query('SELECT id,full_name,username,email,role,password_hash FROM users WHERE username=?',[username]);
    if(!rows.length || !(await bcrypt.compare(password,rows[0].password_hash))) return res.status(401).json({success:false,message:'Invalid username or password'});
    const u=rows[0];
    const token=jwt.sign({id:u.id,role:u.role,username:u.username},process.env.JWT_SECRET,{expiresIn:'7d'});
    res.json({success:true,data:{user:{id:u.id,fullName:u.full_name,username:u.username,email:u.email,role:u.role},token}});
  }catch(e){next(e)}
});

module.exports=router;
