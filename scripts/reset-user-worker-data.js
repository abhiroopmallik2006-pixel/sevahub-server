require('dotenv').config();
const pool=require('../backend/config');

// One-time cleanup for test/demo data. This intentionally preserves the
// services catalogue and application schema so fresh users/workers can register.
const TABLES_IN_DELETE_ORDER=[
  'support_messages',
  'support_tickets',
  'ai_booking_sessions',
  'worker_skill_certificates_v3',
  'worker_skill_certificates_v2',
  'worker_skill_certificates',
  'worker_welfare',
  'worker_insurance',
  'emergency_offers',
  'emergency_requests',
  'payments',
  'booking_messages',
  'bargain_offers',
  'reviews',
  'reward_transactions',
  'notifications',
  'worker_availability',
  'worker_suspended_services',
  'worker_services',
  'user_locations',
  'bookings',
  'email_otps',
  'admin_worker_deletion_log',
  'workers',
  'users'
];

async function tableExists(conn,table){
  const [rows]=await conn.query(
    'SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? LIMIT 1',
    [table]
  );
  return Boolean(rows.length);
}

async function main(){
  const conn=await pool.getConnection();
  const cleared=[];
  const skipped=[];
  try{
    await conn.beginTransaction();
    for(const table of TABLES_IN_DELETE_ORDER){
      if(!(await tableExists(conn,table))){
        skipped.push(table);
        continue;
      }
      const [result]=await conn.query(`DELETE FROM \`${table}\``);
      cleared.push({table,rows:Number(result.affectedRows||0)});
    }
    await conn.commit();
    console.log('SevaHub user/worker data reset completed. Services catalogue was preserved.');
    for(const item of cleared)console.log(`- ${item.table}: ${item.rows} row(s) deleted`);
    if(skipped.length)console.log(`Skipped missing tables: ${skipped.join(', ')}`);
  }catch(err){
    await conn.rollback().catch(()=>{});
    console.error('Data reset failed; transaction rolled back:',err.message);
    process.exitCode=1;
  }finally{
    conn.release();
    await pool.end().catch(()=>{});
  }
}

main();
