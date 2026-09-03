const WELFARE_BENEFITS=[
  {key:'ACCIDENT_ASSISTANCE',label:'Accident assistance'},
  {key:'MEDICAL_SUPPORT',label:'Medical support'},
  {key:'EMERGENCY_ASSISTANCE',label:'Emergency financial assistance'},
  {key:'COOPERATIVE_SUPPORT',label:'Cooperative worker support'}
];

const COVERAGE_TYPES=new Set(['ACCIDENT','HEALTH','HOSPITALIZATION','DISABILITY','LIFE','OTHER']);
let readyPromise=null;

async function columnExists(pool,table,column){
  const [rows]=await pool.query(
    'SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=? LIMIT 1',
    [table,column]
  );
  return Boolean(rows.length);
}

function ensureWelfareTables(pool){
  if(!readyPromise){
    readyPromise=(async()=>{
      await pool.query(`
        CREATE TABLE IF NOT EXISTS worker_welfare (
          id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          worker_id BIGINT NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'NOT_ENROLLED',
          member_id VARCHAR(32) NULL,
          requested_at TIMESTAMP NULL DEFAULT NULL,
          reviewed_at TIMESTAMP NULL DEFAULT NULL,
          review_note VARCHAR(500) NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_worker_welfare_worker (worker_id),
          UNIQUE KEY uq_worker_welfare_member (member_id),
          INDEX idx_worker_welfare_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS worker_insurance (
          id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          worker_id BIGINT NOT NULL,
          provider_name VARCHAR(120) NULL,
          policy_number VARCHAR(120) NULL,
          coverage_type VARCHAR(40) NULL,
          valid_until DATE NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'NOT_ENROLLED',
          submitted_at TIMESTAMP NULL DEFAULT NULL,
          reviewed_at TIMESTAMP NULL DEFAULT NULL,
          review_note VARCHAR(500) NULL,
          removed_at TIMESTAMP NULL DEFAULT NULL,
          removal_reason VARCHAR(500) NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_worker_insurance_worker (worker_id),
          INDEX idx_worker_insurance_status (status),
          INDEX idx_worker_insurance_valid_until (valid_until)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      if(!(await columnExists(pool,'worker_insurance','removed_at'))){
        await pool.query('ALTER TABLE worker_insurance ADD COLUMN removed_at TIMESTAMP NULL DEFAULT NULL');
      }
      if(!(await columnExists(pool,'worker_insurance','removal_reason'))){
        await pool.query('ALTER TABLE worker_insurance ADD COLUMN removal_reason VARCHAR(500) NULL');
      }
    })();
  }
  return readyPromise.catch(err=>{readyPromise=null;throw err});
}

function welfareMemberId(workerId){
  return `SWF-${String(Number(workerId)||0).padStart(6,'0')}`;
}

function dateOnly(value){
  if(!value)return null;
  if(value instanceof Date&&!Number.isNaN(value.getTime())){
    const y=value.getFullYear(),m=String(value.getMonth()+1).padStart(2,'0'),d=String(value.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }
  const match=String(value).match(/\d{4}-\d{2}-\d{2}/);
  return match?match[0]:null;
}

function effectiveInsuranceStatus(row){
  const status=String(row?.status||'NOT_ENROLLED').toUpperCase();
  const expiryDate=dateOnly(row?.valid_until);
  if(status==='VERIFIED'&&expiryDate){
    const expiry=new Date(`${expiryDate}T23:59:59`);
    if(Number.isFinite(expiry.getTime())&&expiry.getTime()<Date.now())return 'EXPIRED';
  }
  return status;
}

module.exports={
  WELFARE_BENEFITS,
  COVERAGE_TYPES,
  ensureWelfareTables,
  welfareMemberId,
  effectiveInsuranceStatus,
  dateOnly
};
