const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

class LocalStore {
  constructor(file) {
    this.file = file;
    this.data = { users: [], friendships: [], conversations: [], conversationMembers: [], messages: [], summaries: [], notifications: [], passwordResets: [], auditLogs: [], counters: {} };
    this.load();
  }
  load(){
    try { if (fs.existsSync(this.file)) this.data = JSON.parse(fs.readFileSync(this.file,'utf8')); } catch(e){ console.error('Local DB load error:', e.message); }
  }
  save(){ fs.mkdirSync(path.dirname(this.file), {recursive:true}); fs.writeFileSync(this.file, JSON.stringify(this.data,null,2)); }
  next(key){ this.data.counters[key]=(this.data.counters[key]||0)+1; return this.data.counters[key]; }
  cleanUser(u){ if(!u) return null; const {password_hash,...safe}=u; return safe; }
  async createUser({username,email,password_hash}){
    if(this.data.users.some(u=>u.email.toLowerCase()===email.toLowerCase())) throw new Error('EMAIL_EXISTS');
    if(this.data.users.some(u=>u.username.toLowerCase()===username.toLowerCase())) throw new Error('USERNAME_EXISTS');
    const u={id:this.next('users'),username,email,password_hash,avatar_url:null,bio:'',status:'active',created_at:new Date().toISOString()}; this.data.users.push(u); this.save(); return this.cleanUser(u);
  }
  async findUserByLogin(id){ return this.data.users.find(u=>u.email.toLowerCase()===String(id).toLowerCase()||u.username.toLowerCase()===String(id).toLowerCase())||null; }
  async findUserByEmail(email){ return this.data.users.find(u=>u.email.toLowerCase()===String(email).toLowerCase())||null; }
  async getUser(id){ return this.cleanUser(this.data.users.find(u=>u.id===Number(id))); }
  async updateProfile(id,{username,bio,avatar_url}){
    const u=this.data.users.find(u=>u.id===Number(id)); if(!u) return null;
    if(username && this.data.users.some(x=>x.id!==u.id&&x.username.toLowerCase()===username.toLowerCase())) throw new Error('USERNAME_EXISTS');
    if(username)u.username=username; if(bio!==undefined)u.bio=bio; if(avatar_url)u.avatar_url=avatar_url; this.save(); return this.cleanUser(u);
  }
  async updatePassword(id,password_hash){ const u=this.data.users.find(u=>u.id===Number(id)); if(!u)return false; u.password_hash=password_hash; this.save(); return true; }
  async searchUsers(query,currentId){ const q=String(query||'').toLowerCase(); return this.data.users.filter(u=>u.id!==Number(currentId)&&u.status==='active'&&(u.username.toLowerCase().includes(q)||u.email.toLowerCase().includes(q))).slice(0,20).map(u=>this.cleanUser(u)); }
  async createFriendRequest(sender,receiver){
    sender=Number(sender);receiver=Number(receiver); if(sender===receiver)throw new Error('SELF');
    const accepted=this.data.friendships.find(f=>f.status==='accepted'&&((f.sender_id===sender&&f.receiver_id===receiver)||(f.sender_id===receiver&&f.receiver_id===sender))); if(accepted)throw new Error('ALREADY_FRIENDS');
    const pending=this.data.friendships.find(f=>f.status==='pending'&&((f.sender_id===sender&&f.receiver_id===receiver)||(f.sender_id===receiver&&f.receiver_id===sender))); if(pending)throw new Error('REQUEST_EXISTS');
    const f={id:this.next('friendships'),sender_id:sender,receiver_id:receiver,status:'pending',created_at:new Date().toISOString()}; this.data.friendships.push(f); this.save(); return f;
  }
  async incomingRequests(userId){ return this.data.friendships.filter(f=>f.receiver_id===Number(userId)&&f.status==='pending').map(f=>({...f,sender:this.cleanUser(this.data.users.find(u=>u.id===f.sender_id))})); }
  async respondFriendRequest(id,userId,status){ const f=this.data.friendships.find(f=>f.id===Number(id)&&f.receiver_id===Number(userId)&&f.status==='pending'); if(!f)return null; f.status=status; this.save(); return f; }
  async friends(userId){ const id=Number(userId); return this.data.friendships.filter(f=>f.status==='accepted'&&(f.sender_id===id||f.receiver_id===id)).map(f=>{const other=f.sender_id===id?f.receiver_id:f.sender_id;return this.cleanUser(this.data.users.find(u=>u.id===other));}).filter(Boolean); }
  async createOrGetDirectConversation(a,b){
    a=Number(a);b=Number(b);
    for(const c of this.data.conversations.filter(c=>c.type==='direct')){
      const members=this.data.conversationMembers.filter(m=>m.conversation_id===c.id).map(m=>m.user_id).sort((x,y)=>x-y); if(members.length===2&&members[0]===Math.min(a,b)&&members[1]===Math.max(a,b))return c;
    }
    const c={id:this.next('conversations'),title:null,type:'direct',created_at:new Date().toISOString()}; this.data.conversations.push(c); this.data.conversationMembers.push({conversation_id:c.id,user_id:a,role:'member'},{conversation_id:c.id,user_id:b,role:'member'}); this.save(); return c;
  }
  async createGroupConversation(ownerId,title,memberIds){
    ownerId=Number(ownerId); const unique=[...new Set([ownerId,...memberIds.map(Number)])];
    const c={id:this.next('conversations'),title:String(title||'Group').slice(0,150),type:'group',created_at:new Date().toISOString()};
    this.data.conversations.push(c); unique.forEach(uid=>this.data.conversationMembers.push({conversation_id:c.id,user_id:uid,role:uid===ownerId?'admin':'member'})); this.save(); return c;
  }
  async userConversations(userId){
    const id=Number(userId), ids=this.data.conversationMembers.filter(m=>m.user_id===id).map(m=>m.conversation_id);
    return ids.map(cid=>{const c=this.data.conversations.find(x=>x.id===cid); const memberIds=this.data.conversationMembers.filter(m=>m.conversation_id===cid&&m.user_id!==id).map(m=>m.user_id); const others=memberIds.map(uid=>this.cleanUser(this.data.users.find(u=>u.id===uid))).filter(Boolean); const last=[...this.data.messages].reverse().find(m=>m.conversation_id===cid)||null; return {...c,others,lastMessage:last};}).sort((a,b)=>new Date(b.lastMessage?.created_at||b.created_at)-new Date(a.lastMessage?.created_at||a.created_at));
  }
  async isConversationMember(cid,uid){ return this.data.conversationMembers.some(m=>m.conversation_id===Number(cid)&&m.user_id===Number(uid)); }
  async addMessage({conversation_id,sender_id,body,attachment_url}){ const m={id:this.next('messages'),conversation_id:Number(conversation_id),sender_id:Number(sender_id),body:body||'',attachment_url:attachment_url||null,created_at:new Date().toISOString()}; this.data.messages.push(m); this.save(); const user=this.cleanUser(this.data.users.find(u=>u.id===m.sender_id)); return {...m,sender:user}; }
  async getMessages(cid,limit=200){ return this.data.messages.filter(m=>m.conversation_id===Number(cid)).slice(-limit).map(m=>({...m,sender:this.cleanUser(this.data.users.find(u=>u.id===m.sender_id))})); }
  async conversationMembers(cid){ return this.data.conversationMembers.filter(m=>m.conversation_id===Number(cid)).map(m=>this.cleanUser(this.data.users.find(u=>u.id===m.user_id))).filter(Boolean); }
  async saveSummary(conversation_id,summary){ const s={id:this.next('summaries'),conversation_id:Number(conversation_id),...summary,created_at:new Date().toISOString()}; this.data.summaries.push(s); this.save(); return s; }
  async summariesForUser(uid){ const ids=this.data.conversationMembers.filter(m=>m.user_id===Number(uid)).map(m=>m.conversation_id); return this.data.summaries.filter(s=>ids.includes(s.conversation_id)).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)); }
  async addNotification(user_id,type,payload){ const n={id:this.next('notifications'),user_id:Number(user_id),type,payload,is_read:false,created_at:new Date().toISOString()}; this.data.notifications.push(n); this.save(); return n; }
  async notifications(uid){ return this.data.notifications.filter(n=>n.user_id===Number(uid)).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)); }
  async markNotifications(uid){ this.data.notifications.filter(n=>n.user_id===Number(uid)).forEach(n=>n.is_read=true); this.save(); }
  async addReset(user_id,code_hash,expires_at){ const r={id:this.next('passwordResets'),user_id:Number(user_id),code_hash,expires_at,used:false,created_at:new Date().toISOString()}; this.data.passwordResets.push(r); this.save(); return r; }
  async latestReset(user_id){ return [...this.data.passwordResets].reverse().find(r=>r.user_id===Number(user_id)&&!r.used)||null; }
  async markResetUsed(id){ const r=this.data.passwordResets.find(r=>r.id===Number(id)); if(r){r.used=true;this.save();} }
  async adminStats(){ return {users:this.data.users.length,activeUsers:this.data.users.filter(u=>u.status==='active').length,friendships:this.data.friendships.filter(f=>f.status==='accepted').length,conversations:this.data.conversations.length,messages:this.data.messages.length,summaries:this.data.summaries.length}; }
  async adminUsers(){ return this.data.users.map(u=>this.cleanUser(u)); }
  async adminConversations(){ return Promise.all(this.data.conversations.map(async c=>({...c,members:await this.conversationMembers(c.id),messages:await this.getMessages(c.id,50)}))); }
  async audit(admin_email,action,target_user_id,details){ const a={id:this.next('auditLogs'),admin_email,action,target_user_id:target_user_id||null,details:details||{},created_at:new Date().toISOString()}; this.data.auditLogs.push(a);this.save();return a; }
}

class MySQLStore {
  constructor(pool){this.pool=pool;}
  cleanUser(u){if(!u)return null;const {password_hash,...safe}=u;return safe;}
  async createUser({username,email,password_hash}){try{const [r]=await this.pool.execute('INSERT INTO users(username,email,password_hash) VALUES(?,?,?)',[username,email,password_hash]);return this.getUser(r.insertId);}catch(e){if(e.code==='ER_DUP_ENTRY')throw new Error(String(e.message).includes('email')?'EMAIL_EXISTS':'USERNAME_EXISTS');throw e;}}
  async findUserByLogin(id){const [r]=await this.pool.execute('SELECT * FROM users WHERE email=? OR username=? LIMIT 1',[id,id]);return r[0]||null;}
  async findUserByEmail(email){const [r]=await this.pool.execute('SELECT * FROM users WHERE email=? LIMIT 1',[email]);return r[0]||null;}
  async getUser(id){const [r]=await this.pool.execute('SELECT * FROM users WHERE id=?',[id]);return this.cleanUser(r[0]);}
  async updateProfile(id,{username,bio,avatar_url}){await this.pool.execute('UPDATE users SET username=COALESCE(?,username), bio=?, avatar_url=COALESCE(?,avatar_url) WHERE id=?',[username||null,bio||'',avatar_url||null,id]);return this.getUser(id);}
  async updatePassword(id,password_hash){await this.pool.execute('UPDATE users SET password_hash=? WHERE id=?',[password_hash,id]);return true;}
  async searchUsers(q,currentId){const like=`%${q}%`;const [r]=await this.pool.execute('SELECT id,username,email,avatar_url,bio,status,created_at FROM users WHERE id<>? AND status="active" AND (username LIKE ? OR email LIKE ?) LIMIT 20',[currentId,like,like]);return r;}
  async createFriendRequest(sender,receiver){try{const [r]=await this.pool.execute('INSERT INTO friendships(sender_id,receiver_id,status) VALUES(?,?,"pending")',[sender,receiver]);return {id:r.insertId,sender_id:sender,receiver_id:receiver,status:'pending'};}catch(e){throw new Error('REQUEST_EXISTS');}}
  async incomingRequests(uid){const [r]=await this.pool.execute('SELECT f.*,u.id as u_id,u.username,u.email,u.avatar_url,u.bio,u.status,u.created_at as u_created FROM friendships f JOIN users u ON u.id=f.sender_id WHERE f.receiver_id=? AND f.status="pending" ORDER BY f.created_at DESC',[uid]);return r.map(x=>({id:x.id,sender_id:x.sender_id,receiver_id:x.receiver_id,status:x.status,created_at:x.created_at,sender:{id:x.u_id,username:x.username,email:x.email,avatar_url:x.avatar_url,bio:x.bio,status:x.status,created_at:x.u_created}}));}
  async respondFriendRequest(id,uid,status){const [before]=await this.pool.execute('SELECT * FROM friendships WHERE id=? AND receiver_id=? AND status="pending" LIMIT 1',[id,uid]);if(!before[0])return null;await this.pool.execute('UPDATE friendships SET status=? WHERE id=?',[status,id]);return {...before[0],status};}
  async friends(uid){const [r]=await this.pool.execute('SELECT u.id,u.username,u.email,u.avatar_url,u.bio,u.status,u.created_at FROM friendships f JOIN users u ON u.id=IF(f.sender_id=?,f.receiver_id,f.sender_id) WHERE f.status="accepted" AND (f.sender_id=? OR f.receiver_id=?)',[uid,uid,uid]);return r;}
  async createOrGetDirectConversation(a,b){const [r]=await this.pool.execute('SELECT c.* FROM conversations c JOIN conversation_members m1 ON m1.conversation_id=c.id AND m1.user_id=? JOIN conversation_members m2 ON m2.conversation_id=c.id AND m2.user_id=? WHERE c.type="direct" LIMIT 1',[a,b]);if(r[0])return r[0];const conn=await this.pool.getConnection();try{await conn.beginTransaction();const [cr]=await conn.execute('INSERT INTO conversations(type) VALUES("direct")');await conn.execute('INSERT INTO conversation_members(conversation_id,user_id) VALUES(?,?),(?,?)',[cr.insertId,a,cr.insertId,b]);await conn.commit();return {id:cr.insertId,type:'direct',created_at:new Date()};}catch(e){await conn.rollback();throw e;}finally{conn.release();}}
  async createGroupConversation(ownerId,title,memberIds){const ids=[...new Set([Number(ownerId),...memberIds.map(Number)])];const conn=await this.pool.getConnection();try{await conn.beginTransaction();const [cr]=await conn.execute('INSERT INTO conversations(title,type) VALUES(?,"group")',[String(title||'Group').slice(0,150)]);for(const uid of ids)await conn.execute('INSERT INTO conversation_members(conversation_id,user_id,role) VALUES(?,?,?)',[cr.insertId,uid,uid===Number(ownerId)?'admin':'member']);await conn.commit();return {id:cr.insertId,title:String(title||'Group').slice(0,150),type:'group',created_at:new Date()};}catch(e){await conn.rollback();throw e;}finally{conn.release();}}
  async userConversations(uid){const [r]=await this.pool.execute('SELECT DISTINCT c.* FROM conversations c JOIN conversation_members cm ON cm.conversation_id=c.id WHERE cm.user_id=? ORDER BY c.created_at DESC',[uid]);for(const c of r){const [o]=await this.pool.execute('SELECT u.id,u.username,u.email,u.avatar_url,u.bio FROM conversation_members cm JOIN users u ON u.id=cm.user_id WHERE cm.conversation_id=? AND cm.user_id<>?',[c.id,uid]);c.others=o;const [lm]=await this.pool.execute('SELECT * FROM messages WHERE conversation_id=? ORDER BY id DESC LIMIT 1',[c.id]);c.lastMessage=lm[0]||null;}return r;}
  async isConversationMember(cid,uid){const [r]=await this.pool.execute('SELECT 1 FROM conversation_members WHERE conversation_id=? AND user_id=?',[cid,uid]);return !!r[0];}
  async addMessage({conversation_id,sender_id,body,attachment_url}){const [r]=await this.pool.execute('INSERT INTO messages(conversation_id,sender_id,body,attachment_url) VALUES(?,?,?,?)',[conversation_id,sender_id,body||'',attachment_url||null]);const [m]=await this.pool.execute('SELECT m.*,u.username,u.avatar_url FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.id=?',[r.insertId]);const x=m[0];return {...x,sender:{id:x.sender_id,username:x.username,avatar_url:x.avatar_url}};}
  async getMessages(cid,limit=200){limit=Math.min(500,Number(limit)||200);const [r]=await this.pool.query(`SELECT m.*,u.username,u.avatar_url FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.conversation_id=? ORDER BY m.id DESC LIMIT ${limit}`,[cid]);return r.reverse().map(x=>({...x,sender:{id:x.sender_id,username:x.username,avatar_url:x.avatar_url}}));}
  async conversationMembers(cid){const [r]=await this.pool.execute('SELECT u.id,u.username,u.email,u.avatar_url,u.bio FROM conversation_members cm JOIN users u ON u.id=cm.user_id WHERE cm.conversation_id=?',[cid]);return r;}
  async saveSummary(cid,s){const [r]=await this.pool.execute('INSERT INTO summaries(conversation_id,summary,decisions,action_items,suggestions) VALUES(?,?,?,?,?)',[cid,s.summary,JSON.stringify(s.decisions),JSON.stringify(s.action_items),JSON.stringify(s.suggestions)]);return {id:r.insertId,conversation_id:cid,...s,created_at:new Date()};}
  async summariesForUser(uid){const [r]=await this.pool.execute('SELECT s.* FROM summaries s JOIN conversation_members cm ON cm.conversation_id=s.conversation_id WHERE cm.user_id=? ORDER BY s.created_at DESC',[uid]);return r.map(x=>({...x,decisions:typeof x.decisions==='string'?JSON.parse(x.decisions):x.decisions,action_items:typeof x.action_items==='string'?JSON.parse(x.action_items):x.action_items,suggestions:typeof x.suggestions==='string'?JSON.parse(x.suggestions):x.suggestions}));}
  async addNotification(uid,type,payload){const [r]=await this.pool.execute('INSERT INTO notifications(user_id,type,payload) VALUES(?,?,?)',[uid,type,JSON.stringify(payload)]);return {id:r.insertId,user_id:uid,type,payload,is_read:false,created_at:new Date()};}
  async notifications(uid){const [r]=await this.pool.execute('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC',[uid]);return r.map(x=>({...x,payload:typeof x.payload==='string'?JSON.parse(x.payload):x.payload}));}
  async markNotifications(uid){await this.pool.execute('UPDATE notifications SET is_read=TRUE WHERE user_id=?',[uid]);}
  async addReset(uid,hash,expires){const [r]=await this.pool.execute('INSERT INTO password_resets(user_id,code_hash,expires_at) VALUES(?,?,?)',[uid,hash,new Date(expires)]);return {id:r.insertId,user_id:uid,code_hash:hash,expires_at:expires,used:false};}
  async latestReset(uid){const [r]=await this.pool.execute('SELECT * FROM password_resets WHERE user_id=? AND used=FALSE ORDER BY id DESC LIMIT 1',[uid]);return r[0]||null;}
  async markResetUsed(id){await this.pool.execute('UPDATE password_resets SET used=TRUE WHERE id=?',[id]);}
  async adminStats(){const q=async s=>(await this.pool.query(s))[0][0].n;return {users:await q('SELECT COUNT(*) n FROM users'),activeUsers:await q('SELECT COUNT(*) n FROM users WHERE status="active"'),friendships:await q('SELECT COUNT(*) n FROM friendships WHERE status="accepted"'),conversations:await q('SELECT COUNT(*) n FROM conversations'),messages:await q('SELECT COUNT(*) n FROM messages'),summaries:await q('SELECT COUNT(*) n FROM summaries')};}
  async adminUsers(){const [r]=await this.pool.query('SELECT id,username,email,avatar_url,bio,status,created_at FROM users ORDER BY id DESC');return r;}
  async adminConversations(){const [r]=await this.pool.query('SELECT * FROM conversations ORDER BY id DESC LIMIT 100');for(const c of r){c.members=await this.conversationMembers(c.id);c.messages=await this.getMessages(c.id,50);}return r;}
  async audit(admin_email,action,target_user_id,details){await this.pool.execute('INSERT INTO audit_logs(admin_email,action,target_user_id,details) VALUES(?,?,?,?)',[admin_email,action,target_user_id||null,JSON.stringify(details||{})]);}
}

async function createStore(){
  if((process.env.DB_MODE||'local').toLowerCase()==='mysql'){
    const pool=mysql.createPool({host:process.env.MYSQL_HOST||'127.0.0.1',port:Number(process.env.MYSQL_PORT||3306),user:process.env.MYSQL_USER||'root',password:process.env.MYSQL_PASSWORD||'',database:process.env.MYSQL_DATABASE||'connect',waitForConnections:true,connectionLimit:10});
    await pool.query('SELECT 1'); console.log('Storage: MySQL'); return new MySQLStore(pool);
  }
  console.log('Storage: local JSON demo database'); return new LocalStore(path.join(__dirname,'data','db.json'));
}
module.exports={createStore};
