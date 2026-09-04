const pool=require('../config');

const SKILL_CERTIFICATE_TABLE='worker_skill_certificates_v2';
let ensurePromise=null;

async function ensureSkillCertificateTable(){
  if(ensurePromise)return ensurePromise;
  ensurePromise=(async()=>{
    // Use a clean v2 table so older/incomplete certificate schemas on deployed
    // databases cannot break the worker Profile screen with a generic 500.
    // No foreign keys are used here intentionally: the application already
    // validates worker/service ids and this keeps deployment portable.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${SKILL_CERTIFICATE_TABLE} (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        worker_id INT NOT NULL UNIQUE,
        service_id INT NULL,
        title VARCHAR(160) NOT NULL,
        issuer VARCHAR(160) NULL,
        file_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(80) NOT NULL,
        file_size INT NOT NULL,
        file_data LONGBLOB NOT NULL,
        status ENUM('PENDING','VERIFIED','REJECTED') NOT NULL DEFAULT 'PENDING',
        review_reason VARCHAR(500) NULL,
        reviewed_by VARCHAR(150) NULL,
        uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TIMESTAMP NULL DEFAULT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_skill_cert_v2_status (status,updated_at),
        INDEX idx_skill_cert_v2_service (service_id,status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Best-effort migration from the earlier table. It is intentionally ignored
    // when an old deployment has a partial/incompatible schema.
    try{
      const [tables]=await pool.query("SHOW TABLES LIKE 'worker_skill_certificates'");
      if(tables.length){
        const [cols]=await pool.query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='worker_skill_certificates'`);
        const names=new Set(cols.map(r=>String(r.COLUMN_NAME)));
        const required=['worker_id','service_id','title','issuer','file_name','mime_type','file_size','file_data','status','review_reason','reviewed_by','uploaded_at','reviewed_at','updated_at'];
        if(required.every(name=>names.has(name))){
          await pool.query(`
            INSERT IGNORE INTO ${SKILL_CERTIFICATE_TABLE}
              (worker_id,service_id,title,issuer,file_name,mime_type,file_size,file_data,status,review_reason,reviewed_by,uploaded_at,reviewed_at,updated_at)
            SELECT worker_id,service_id,title,issuer,file_name,mime_type,file_size,file_data,status,review_reason,reviewed_by,uploaded_at,reviewed_at,updated_at
            FROM worker_skill_certificates
          `);
        }
      }
    }catch(e){
      console.warn('[Skill Certificates] Legacy migration skipped:',e.message);
    }

    return true;
  })().catch(err=>{ensurePromise=null;throw err});
  return ensurePromise;
}

function certificateMeta(row){
  if(!row)return null;
  return {
    id:Number(row.id),
    workerId:Number(row.worker_id),
    serviceId:row.service_id==null?null:Number(row.service_id),
    serviceName:row.service_name||null,
    title:row.title,
    issuer:row.issuer||null,
    fileName:row.file_name,
    mimeType:row.mime_type,
    fileSize:Number(row.file_size||0),
    status:String(row.status||'PENDING').toUpperCase(),
    reviewReason:row.review_reason||null,
    reviewedBy:row.reviewed_by||null,
    uploadedAt:row.uploaded_at||null,
    reviewedAt:row.reviewed_at||null,
    updatedAt:row.updated_at||null
  };
}

function detectedMime(buffer){
  if(!Buffer.isBuffer(buffer)||buffer.length<4)return null;
  if(buffer.length>=5&&buffer.subarray(0,5).toString('ascii')==='%PDF-')return 'application/pdf';
  if(buffer[0]===0xff&&buffer[1]===0xd8&&buffer[2]===0xff)return 'image/jpeg';
  if(buffer.length>=8&&buffer[0]===0x89&&buffer[1]===0x50&&buffer[2]===0x4e&&buffer[3]===0x47&&buffer[4]===0x0d&&buffer[5]===0x0a&&buffer[6]===0x1a&&buffer[7]===0x0a)return 'image/png';
  return null;
}

function safeCertificateFilename(value,mime){
  const raw=String(value||'certificate').split(/[\\/]/).pop().replace(/[\x00-\x1f\x7f]/g,'').trim();
  const stem=(raw.replace(/\.[^.]+$/,'')||'certificate').replace(/[^A-Za-z0-9 _().-]/g,'_').slice(0,180).trim()||'certificate';
  const ext=mime==='application/pdf'?'.pdf':mime==='image/png'?'.png':'.jpg';
  return stem+ext;
}

module.exports={SKILL_CERTIFICATE_TABLE,ensureSkillCertificateTable,certificateMeta,detectedMime,safeCertificateFilename};
