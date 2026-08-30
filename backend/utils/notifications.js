const pool=require('../config');

async function notify(app,userId,title,message,type='BOOKING'){
  await pool.query('INSERT INTO notifications(user_id,type,title,message) VALUES(?,?,?,?)',[userId,type,title,message]);
  app.get('io').to(`user-${userId}`).emit('notification:new',{title,message,type});
}
module.exports={notify};
