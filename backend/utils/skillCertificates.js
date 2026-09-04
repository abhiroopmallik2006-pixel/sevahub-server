const pool=require('../config');

let ensurePromise=null;

async function columnNames(){
  const [rows]=await pool.query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='worker_skill_certificates'
  `);
  return new Set(rows.map(r=>String(r.COLUMN_NAME)));
}

async function indexNames(){
  const [rows]=await pool.query(`
    SELECT DISTINCT INDEX_NAME
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='worker_skill_certificates'
  `);
  return new Set(rows.map(r=>String(r.INDEX_NAME)));
}

async function ensureSkillCertificateTable(){
  if(ensurePromise)return ensurePromise;
  ensurePromise=(async()=>{
    await pool.query(`
      CREATE TABLE IF NOT EXISTS worker_skill_certificates (
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
        INDEX idx_skill_cert_status (status,updated_at),
        INDEX idx_skill_cert_service (service_id,status),
        CONSTRAINT fk_skill_cert_worker FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
        CONSTRAINT fk_skill_cert_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Render/older databases may already have an earlier version of the table.
    // CREATE TABLE IF NOT EXISTS does not add newer columns, so repair the schema
    // before the API reads it instead of returning a generic 500 Server error.
    const cols=await columnNames();
    const additions=[
      ['service_id',"ADD COLUMN service_id INT NULL AFTER worker_id"],
      ['title',"ADD COLUMN title VARCHAR(160) NOT NULL DEFAULT 'Skill Certificate' AFTER service_id"],
      ['issuer',"ADD COLUMN issuer VARCHAR(160) NULL AFTER title"],
      ['file_name',"ADD COLUMN file_name VARCHAR(255) NOT NULL DEFAULT 'certificate.pdf' AFTER issuer"],
      ['mime_type',"ADD COLUMN mime_type VARCHAR(80) NOT NULL DEFAULT 'application/pdf' AFTER file_name"],
      ['file_size',"ADD COLUMN file_size INT NOT NULL DEFAULT 0 AFTER mime_type"],
      ['file_data',"ADD COLUMN file_data LONGBLOB NULL AFTER file_size"],
      ['status',"ADD COLUMN status ENUM('PENDING','VERIFIED','REJECTED') NOT NULL DEFAULT 'PENDING' AFTER file_data"],
      ['review_reason',"ADD COLUMN review_reason VARCHAR(500) NULL AFTER status"],
      ['reviewed_by',"ADD COLUMN reviewed_by VARCHAR(150) NULL AFTER review_reason"],
      ['uploaded_at',"ADD COLUMN uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER reviewed_by"],
      ['reviewed_at',"ADD COLUMN reviewed_at TIMESTAMP NULL DEFAULT NULL AFTER uploaded_at"],
      ['updated_at',"ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER reviewed_at"]
    ];
    for(const [name,sql] of additions){
      if(!cols.has(name)){
        await pool.query(`ALTER TABLE worker_skill_certificates ${sql}`);
        cols.add(name);
      }
    }

    const indexes=await indexNames();
    if(!indexes.has('idx_skill_cert_status')){
      await pool.query('ALTER TABLE worker_skill_certificates ADD INDEX idx_skill_cert_status (status,updated_at)');
    }
    if(!indexes.has('idx_skill_cert_service')){
      await pool.query('ALTER TABLE worker_skill_certificates ADD INDEX idx_skill_cert_service (service_id,status)');
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

module.exports={ensureSkillCertificateTable,certificateMeta,detectedMime,safeCertificateFilename};
