const pool=require('../config');

let readyPromise=null;

async function columnExists(db,table,column){
  const [rows]=await db.query(
    'SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=? LIMIT 1',
    [table,column]
  );
  return Boolean(rows.length);
}

async function ensureWorkerModeration(db=pool){
  if(!readyPromise){
    readyPromise=(async()=>{
      if(!(await columnExists(db,'workers','is_banned'))){
        await db.query("ALTER TABLE workers ADD COLUMN is_banned TINYINT(1) NOT NULL DEFAULT 0");
      }
      if(!(await columnExists(db,'workers','ban_reason'))){
        await db.query("ALTER TABLE workers ADD COLUMN ban_reason VARCHAR(500) NULL");
      }
      if(!(await columnExists(db,'workers','banned_at'))){
        await db.query("ALTER TABLE workers ADD COLUMN banned_at TIMESTAMP NULL DEFAULT NULL");
      }
      await db.query(`CREATE TABLE IF NOT EXISTS worker_suspended_services (
        worker_id INT NOT NULL,
        service_id INT NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        suspended_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(worker_id,service_id),
        INDEX idx_suspended_service(service_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    })();
  }
  return readyPromise.catch(err=>{readyPromise=null;throw err});
}

async function moderationByUser(userId,db=pool){
  await ensureWorkerModeration(db);
  const [rows]=await db.query(
    'SELECT id,user_id,is_banned,ban_reason,banned_at FROM workers WHERE user_id=? LIMIT 1',
    [userId]
  );
  const row=rows[0];
  if(!row)return null;
  return {
    workerId:Number(row.id),
    userId:Number(row.user_id),
    isBanned:Boolean(row.is_banned),
    banReason:row.ban_reason||null,
    bannedAt:row.banned_at||null
  };
}

async function moderationByWorker(workerId,db=pool){
  await ensureWorkerModeration(db);
  const [rows]=await db.query(
    'SELECT id,user_id,is_banned,ban_reason,banned_at FROM workers WHERE id=? LIMIT 1',
    [workerId]
  );
  const row=rows[0];
  if(!row)return null;
  return {
    workerId:Number(row.id),
    userId:Number(row.user_id),
    isBanned:Boolean(row.is_banned),
    banReason:row.ban_reason||null,
    bannedAt:row.banned_at||null
  };
}

async function assertWorkerActive(userId,db=pool){
  const moderation=await moderationByUser(userId,db);
  if(!moderation)return {ok:false,message:'Worker profile not found',moderation:null};
  if(moderation.isBanned){
    return {ok:false,message:`Worker account is restricted${moderation.banReason?`: ${moderation.banReason}`:''}`,moderation};
  }
  return {ok:true,moderation};
}

async function suspendWorkerServices(conn,workerId){
  await conn.query(`INSERT INTO worker_suspended_services(worker_id,service_id,price)
    SELECT worker_id,service_id,price FROM worker_services WHERE worker_id=?
    ON DUPLICATE KEY UPDATE price=VALUES(price),suspended_at=CURRENT_TIMESTAMP`,[workerId]);
  await conn.query('DELETE FROM worker_services WHERE worker_id=?',[workerId]);
}

async function restoreWorkerServices(conn,workerId){
  await conn.query(`INSERT INTO worker_services(worker_id,service_id,price)
    SELECT worker_id,service_id,price FROM worker_suspended_services WHERE worker_id=?
    ON DUPLICATE KEY UPDATE price=VALUES(price)`,[workerId]);
  await conn.query('DELETE FROM worker_suspended_services WHERE worker_id=?',[workerId]);
}

module.exports={
  ensureWorkerModeration,
  moderationByUser,
  moderationByWorker,
  assertWorkerActive,
  suspendWorkerServices,
  restoreWorkerServices
};
