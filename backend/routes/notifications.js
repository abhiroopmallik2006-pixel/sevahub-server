const express=require('express');
const pool=require('../config');
const {auth}=require('../middleware/auth');
const router=express.Router();

router.get('/',auth,async(req,res,next)=>{try{
  const limit=Math.max(1,Math.min(200,Number(req.query.limit||100)));
  const [rows]=await pool.query(`SELECT id,type,title,message,is_read,created_at
    FROM notifications
    WHERE user_id=?
    ORDER BY created_at DESC,id DESC
    LIMIT ?`,[req.user.id,limit]);
  const [countRows]=await pool.query('SELECT COUNT(*) unread FROM notifications WHERE user_id=? AND is_read=FALSE',[req.user.id]);
  res.json({success:true,data:{rows,unread:Number(countRows[0]?.unread||0)}});
}catch(e){next(e)}});

// Keep the specific bulk route before /:id/read so Express does not treat "all" as a notification id.
router.put('/all/read',auth,async(req,res,next)=>{try{
  await pool.query('UPDATE notifications SET is_read=TRUE WHERE user_id=? AND is_read=FALSE',[req.user.id]);
  res.json({success:true});
}catch(e){next(e)}});

router.put('/:id/read',auth,async(req,res,next)=>{try{
  const id=Number(req.params.id);
  if(!Number.isInteger(id)||id<1)return res.status(400).json({success:false,message:'Invalid notification'});
  const [r]=await pool.query('UPDATE notifications SET is_read=TRUE WHERE id=? AND user_id=?',[id,req.user.id]);
  if(!r.affectedRows)return res.status(404).json({success:false,message:'Notification not found'});
  res.json({success:true});
}catch(e){next(e)}});

module.exports=router;
