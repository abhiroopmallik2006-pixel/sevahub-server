const express=require('express');
const pool=require('../config');
const {auth,authorize}=require('../middleware/auth');
const router=express.Router();

// 1 GEM = ₹2 when redeemed. Earn rate (1 GEM per ₹100 spent) is applied
// where bookings are completed — see backend/routes/bookings.js.
const GEM_TO_RUPEE=2;

// Repair/backfill missing rewards for already-completed bookings.
// This keeps GEMS correct even if an older build marked a booking complete
// before reward_transactions was written. Each completed booking earns
// floor(final service amount / 100) GEMS exactly once.
async function syncEarnRewards(userId){
  await pool.query(`
    INSERT INTO reward_transactions(user_id,booking_id,type,coins,description)
    SELECT b.user_id,b.id,'EARN',FLOOR(COALESCE(b.final_price,b.original_price)/100),
           CONCAT('Earned ',FLOOR(COALESCE(b.final_price,b.original_price)/100),' GEMS for ₹',COALESCE(b.final_price,b.original_price),' completed service')
    FROM bookings b
    WHERE b.user_id=? AND b.status='COMPLETED'
      AND FLOOR(COALESCE(b.final_price,b.original_price)/100)>0
      AND NOT EXISTS (
        SELECT 1 FROM reward_transactions rt
        WHERE rt.booking_id=b.id AND rt.type='EARN'
      )`,[userId]);
}

async function getBalance(userId){
  const [rows]=await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN type='REDEEM' THEN -coins ELSE coins END),0) balance
     FROM reward_transactions WHERE user_id=?`,[userId]
  );
  return Number(rows[0].balance)||0;
}

router.get('/balance',auth,authorize('USER'),async(req,res,next)=>{
  try{
    await syncEarnRewards(req.user.id);
    const balance=await getBalance(req.user.id);
    res.json({success:true,data:{gems:balance,rupeeValue:balance*GEM_TO_RUPEE,rate:{earn:'1 GEM per ₹100 spent',redeem:`1 GEM = ₹${GEM_TO_RUPEE}`}}});
  }catch(e){next(e)}
});

router.get('/history',auth,authorize('USER'),async(req,res,next)=>{
  try{
    await syncEarnRewards(req.user.id);
    const [rows]=await pool.query(
      `SELECT id,type,coins,description,created_at FROM reward_transactions
       WHERE user_id=? ORDER BY created_at DESC LIMIT 100`,[req.user.id]
    );
    res.json({success:true,data:rows});
  }catch(e){next(e)}
});

router.post('/redeem',auth,authorize('USER'),async(req,res,next)=>{
  const conn=await pool.getConnection();
  try{
    const gems=Number(req.body.gems);
    if(!Number.isInteger(gems)||gems<=0) return res.status(400).json({success:false,message:'Enter a whole number of GEMS to redeem'});
    await conn.beginTransaction();
    const [rows]=await conn.query(
      `SELECT COALESCE(SUM(CASE WHEN type='REDEEM' THEN -coins ELSE coins END),0) balance
       FROM reward_transactions WHERE user_id=? FOR UPDATE`,[req.user.id]
    );
    const balance=Number(rows[0].balance)||0;
    if(gems>balance){await conn.rollback();return res.status(400).json({success:false,message:`You only have ${balance} GEMS available`})}
    const rupeeValue=gems*GEM_TO_RUPEE;
    await conn.query(
      "INSERT INTO reward_transactions(user_id,type,coins,description) VALUES(?,?,?,?)",
      [req.user.id,'REDEEM',gems,`Redeemed ${gems} GEMS for ₹${rupeeValue} credit`]
    );
    await conn.commit();
    res.json({success:true,message:`Redeemed ${gems} GEMS for ₹${rupeeValue} credit`,data:{gemsRedeemed:gems,rupeeValue,newBalance:balance-gems}});
  }catch(e){await conn.rollback().catch(()=>{});next(e)}finally{conn.release()}
});

module.exports=router;
