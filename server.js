require('dotenv').config();
const path=require('path');
const fs=require('fs');
const http=require('http');
const express=require('express');
const session=require('express-session');
const bcrypt=require('bcryptjs');
const {Server}=require('socket.io');
const {createStore}=require('./store');
const nodemailer = require('nodemailer');

(async()=>{
  const store=await createStore();
  const app=express();
  const server=http.createServer(app);
  const sessionMiddleware=session({secret:process.env.SESSION_SECRET||'connect-dev-secret-change-me',resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:'lax',maxAge:1000*60*60*24*7}});
  const io=new Server(server,{maxHttpBufferSize:8e6});
  io.engine.use(sessionMiddleware);

  const uploadDir=path.join(__dirname,'public','uploads'); fs.mkdirSync(uploadDir,{recursive:true});
  function saveImageData(data,name='image'){
    if(!data)return null;
    const m=String(data).match(/^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,(.+)$/i);
    if(!m)throw new Error('Only PNG, JPEG, WEBP or GIF images are allowed.');
    const buf=Buffer.from(m[2],'base64');
    if(buf.length>5*1024*1024)throw new Error('Image must be 5 MB or smaller.');
    const ext=(m[1].split('/')[1]||'png').replace('jpeg','jpg');
    const file=Date.now()+'-'+Math.random().toString(36).slice(2,8)+'.'+ext;
    fs.writeFileSync(path.join(uploadDir,file),buf);
    return '/uploads/'+file;
  }

  app.use(express.json({limit:'8mb'}));
  app.use(express.urlencoded({extended:true}));
  app.use(sessionMiddleware);
  app.use(express.static(path.join(__dirname,'public')));

  const pages=['index','login','signup','forgot-password','profile','dashboard','discover','requests','chat','meeting','history','summary','notifications','settings','admin','terms','privacy','contact','help','features'];
  for(const p of pages){const route=p==='index'?'/':`/${p}`;app.get(route,(req,res)=>res.sendFile(path.join(__dirname,'public','pages',`${p}.html`)));}

  const auth=(req,res,next)=>{if(!req.session.user)return res.status(401).json({error:'Please log in first.'});next();};
  const admin=(req,res,next)=>{if(!req.session.admin)return res.status(401).json({error:'Admin login required.'});next();};
  const publicUser=u=>u?({id:u.id,username:u.username,email:u.email,avatar_url:u.avatar_url||null,bio:u.bio||'',status:u.status,created_at:u.created_at}):null;
  const strongPassword=p=>/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,128}$/.test(String(p||''));
  async function emailDomainLooksValid(email){try{const dns=require('dns').promises;const domain=String(email).split('@')[1];if(!domain)return false;const mx=await dns.resolveMx(domain);return Array.isArray(mx)&&mx.length>0;}catch{return false;}}
  async function sendEmail(to, subject, html) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('Gmail SMTP is not configured.');
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || `Connect <${process.env.SMTP_USER}>`,
    to,
    subject,
    html
  });

  return info;
}

  app.post('/api/signup',async(req,res)=>{try{let {username,email,password}=req.body;username=String(username||'').trim();email=String(email||'').trim().toLowerCase();password=String(password||'');if(username.length<3)return res.status(400).json({error:'Username must be at least 3 characters.'});if(!/^\S+@\S+\.\S+$/.test(email)||!(await emailDomainLooksValid(email)))return res.status(400).json({error:'Enter a valid email address with a working mail domain.'});if(!strongPassword(password))return res.status(400).json({error:'Password must be 12+ characters and include uppercase, lowercase, a number and a symbol.'});const password_hash=await bcrypt.hash(password,12);const user=await store.createUser({username,email,password_hash});req.session.user=publicUser(user);res.json({ok:true,user:req.session.user,next:'/profile'});}catch(e){const msg=e.message==='EMAIL_EXISTS'?'That email is already registered.':e.message==='USERNAME_EXISTS'?'That username is already taken.':'Could not create account.';res.status(409).json({error:msg});}});

  app.post('/api/login',async(req,res)=>{try{const id=String(req.body.id||'').trim();const password=String(req.body.password||'');const u=await store.findUserByLogin(id);if(!u||u.status!=='active'||!(await bcrypt.compare(password,u.password_hash)))return res.status(401).json({error:'Invalid username/email or password.'});req.session.user=publicUser(u);res.json({ok:true,user:req.session.user,next:u.avatar_url?'/dashboard':'/profile'});}catch(e){res.status(500).json({error:'Login failed.'});}});
  app.post('/api/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));
  app.get('/api/me',async(req,res)=>{if(!req.session.user)return res.json({user:null});const u=await store.getUser(req.session.user.id);if(u)req.session.user=publicUser(u);res.json({user:req.session.user||null,admin:req.session.admin||null});});

  app.post('/api/password/forgot',async(req,res)=>{try{const email=String(req.body.email||'').trim().toLowerCase();const generic={ok:true,message:'If that account exists, a verification code has been sent to the email address.'};const u=await store.findUserByEmail(email);if(!u)return res.json(generic);const code=String(Math.floor(100000+Math.random()*900000));const hash=await bcrypt.hash(code,10);await store.addReset(u.id,hash,Date.now()+10*60*1000);await sendEmail(email,'Connect password reset code',`<div style="font-family:Arial,sans-serif"><h2>Connect password reset</h2><p>Your verification code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:5px">${code}</p><p>This code expires in 10 minutes. If you did not request this, ignore this email.</p></div>`);res.json(generic);}catch(e){console.error('Password reset email:',e.message);res.status(503).json({error:'We could not send the verification email. Please try again later.'});}});
  app.post('/api/password/reset',async(req,res)=>{try{const email=String(req.body.email||'').trim().toLowerCase(),code=String(req.body.code||''),password=String(req.body.password||'');if(!strongPassword(password))return res.status(400).json({error:'New password must be 12+ characters and include uppercase, lowercase, a number and a symbol.'});const u=await store.findUserByEmail(email);if(!u)return res.status(400).json({error:'Invalid or expired code.'});if(await bcrypt.compare(password,u.password_hash))return res.status(400).json({error:'Choose a password different from your current password.'});const r=await store.latestReset(u.id);if(!r||r.used||new Date(r.expires_at).getTime()<Date.now()||!(await bcrypt.compare(code,r.code_hash)))return res.status(400).json({error:'Invalid or expired code.'});await store.updatePassword(u.id,await bcrypt.hash(password,12));await store.markResetUsed(r.id);res.json({ok:true,message:'Password updated. You can log in now.'});}catch(e){res.status(500).json({error:'Could not reset password.'});}});

  app.get('/api/profile',auth,async(req,res)=>res.json({user:await store.getUser(req.session.user.id)}));
  app.post('/api/profile',auth,async(req,res)=>{try{const avatar_url=req.body.avatarData?saveImageData(req.body.avatarData,req.body.avatarName):null;const user=await store.updateProfile(req.session.user.id,{username:String(req.body.username||'').trim(),bio:String(req.body.bio||'').slice(0,300),avatar_url});req.session.user=publicUser(user);res.json({ok:true,user:req.session.user});}catch(e){res.status(400).json({error:e.message==='USERNAME_EXISTS'?'Username is already taken.':e.message||'Could not update profile.'});}});

  app.get('/api/users',auth,async(req,res)=>res.json({users:await store.searchUsers(req.query.q||'',req.session.user.id)}));
  app.post('/api/friends/request',auth,async(req,res)=>{try{const target=Number(req.body.userId);const f=await store.createFriendRequest(req.session.user.id,target);await store.addNotification(target,'friend_request',{requestId:f.id,fromId:req.session.user.id,fromUsername:req.session.user.username});res.json({ok:true});}catch(e){res.status(400).json({error:'A request already exists, you are already connected, or the request is invalid.'});}});
  app.get('/api/friends/requests',auth,async(req,res)=>res.json({requests:await store.incomingRequests(req.session.user.id)}));
  app.post('/api/friends/respond',auth,async(req,res)=>{const status=req.body.status==='accepted'?'accepted':'rejected';const f=await store.respondFriendRequest(req.body.requestId,req.session.user.id,status);if(!f)return res.status(404).json({error:'Request not found.'});if(status==='accepted')await store.addNotification(f.sender_id,'friend_accepted',{byId:req.session.user.id,byUsername:req.session.user.username});res.json({ok:true});});
  app.get('/api/friends',auth,async(req,res)=>res.json({friends:await store.friends(req.session.user.id)}));

  app.post('/api/conversations/direct',auth,async(req,res)=>{const friendId=Number(req.body.friendId);const friends=await store.friends(req.session.user.id);if(!friends.some(f=>f.id===friendId))return res.status(403).json({error:'You can start a chat only with an accepted connection.'});const c=await store.createOrGetDirectConversation(req.session.user.id,friendId);res.json({ok:true,conversation:c});});
  app.post('/api/conversations/group',auth,async(req,res)=>{try{const title=String(req.body.title||'').trim();const memberIds=[...new Set((req.body.memberIds||[]).map(Number).filter(Boolean))];if(title.length<2)return res.status(400).json({error:'Enter a group name.'});if(memberIds.length<2)return res.status(400).json({error:'Select at least two connections for a group.'});const friends=await store.friends(req.session.user.id);const allowed=new Set(friends.map(x=>Number(x.id)));if(memberIds.some(id=>!allowed.has(id)))return res.status(403).json({error:'Groups can include accepted connections only.'});const c=await store.createGroupConversation(req.session.user.id,title,memberIds);res.json({ok:true,conversation:c});}catch(e){res.status(400).json({error:'Could not create group.'});}});
  app.get('/api/conversations',auth,async(req,res)=>res.json({conversations:await store.userConversations(req.session.user.id)}));
  app.get('/api/conversations/:id/messages',auth,async(req,res)=>{if(!(await store.isConversationMember(req.params.id,req.session.user.id)))return res.status(403).json({error:'Not allowed.'});res.json({messages:await store.getMessages(req.params.id)});});
  app.post('/api/upload',auth,(req,res)=>{try{const url=saveImageData(req.body.imageData,req.body.imageName);if(!url)return res.status(400).json({error:'Select an image.'});res.json({ok:true,url});}catch(e){res.status(400).json({error:e.message});}});

  app.get('/api/webrtc/config', auth, async (req, res) => {
  try {
    const tokenId = process.env.CLOUDFLARE_TURN_TOKEN_ID;
    const apiToken = process.env.CLOUDFLARE_TURN_API_TOKEN;

    if (!tokenId || !apiToken) {
      return res.status(500).json({
        error: 'Cloudflare TURN is not configured.'
      });
    }

    const response = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${tokenId}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ttl: 86400
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();

      console.error('Cloudflare TURN error:', errorText);

      return res.status(502).json({
        error: 'Could not generate TURN credentials.'
      });
    }

    const data = await response.json();

    res.json({
      iceServers: data.iceServers,
      turnConfigured: true
    });

  } catch (error) {
    console.error('TURN configuration error:', error);

    res.status(500).json({
      error: 'Could not load WebRTC configuration.'
    });
  }
});

  async function makeSummary(messages){
    const texts=messages.map(m=>`${m.sender?.username||'User'}: ${String(m.body||'').trim()}`).filter(x=>!x.endsWith(': '));
    if(!texts.length)return {summary:'No text messages were available to summarize.',decisions:[],action_items:[],suggestions:['Continue the conversation before generating a summary.']};
    const transcript=texts.slice(-200).join('\n').slice(0,18000);
    if(process.env.OPENAI_API_KEY){try{const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-4o-mini',temperature:0.2,response_format:{type:'json_object'},messages:[{role:'system',content:'Summarize conversations concisely. Do not repeat messages verbatim. Return JSON with summary (2-4 short sentences), decisions (array), action_items (array), suggestions (array). Keep only meaningful information.'},{role:'user',content:transcript}]})});if(r.ok){const j=await r.json();const out=JSON.parse(j.choices[0].message.content);return {summary:String(out.summary||'').slice(0,1800),decisions:Array.isArray(out.decisions)?out.decisions.slice(0,6):[],action_items:Array.isArray(out.action_items)?out.action_items.slice(0,8):[],suggestions:Array.isArray(out.suggestions)?out.suggestions.slice(0,5):[]};}}catch(e){console.warn('AI summary fallback:',e.message);}}
    const raw=messages.map(m=>String(m.body||'').trim()).filter(Boolean), joined=raw.join(' '), words=joined.split(/\s+/);const short=words.slice(0,Math.min(70,Math.max(25,Math.ceil(words.length*.35)))).join(' ')+(words.length>70?'…':'');
    const decisions=raw.filter(t=>/\b(decided|agreed|confirmed|approved|final)\b/i.test(t)).slice(0,4);const action_items=raw.filter(t=>/\b(will|need to|must|should|send|finish|complete|review|prepare|update)\b/i.test(t)).slice(0,5);
    return {summary:short,decisions,action_items,suggestions:['Confirm owners and deadlines for any action items.']};
  }
  app.post('/api/conversations/:id/summary',auth,async(req,res)=>{if(!(await store.isConversationMember(req.params.id,req.session.user.id)))return res.status(403).json({error:'Not allowed.'});const s=await makeSummary(await store.getMessages(req.params.id,500));const saved=await store.saveSummary(req.params.id,s);res.json({ok:true,summary:saved});});
  app.get('/api/summaries',auth,async(req,res)=>res.json({summaries:await store.summariesForUser(req.session.user.id)}));
  app.get('/api/notifications',auth,async(req,res)=>res.json({notifications:await store.notifications(req.session.user.id)}));
  app.post('/api/notifications/read',auth,async(req,res)=>{await store.markNotifications(req.session.user.id);res.json({ok:true});});

  app.post('/api/admin/login',async(req,res)=>{const email=String(req.body.email||''),password=String(req.body.password||'');if(email===(process.env.ADMIN_EMAIL||'admin@connect.local')&&password===(process.env.ADMIN_PASSWORD||'ConnectAdmin@2026!')){req.session.admin={email};await store.audit(email,'ADMIN_LOGIN',null,{ip:req.ip});return res.json({ok:true});}res.status(401).json({error:'Invalid admin credentials.'});});
  app.post('/api/admin/logout',(req,res)=>{delete req.session.admin;res.json({ok:true});});
  app.get('/api/admin/stats',admin,async(req,res)=>res.json({stats:await store.adminStats()}));
  app.get('/api/admin/users',admin,async(req,res)=>{await store.audit(req.session.admin.email,'VIEW_USERS',null,{});res.json({users:await store.adminUsers()});});
  app.get('/api/admin/conversations',admin,async(req,res)=>{await store.audit(req.session.admin.email,'VIEW_CONVERSATIONS',null,{reason:'admin dashboard review'});res.json({conversations:await store.adminConversations()});});

  io.on('connection',socket=>{
    const session=socket.request.session; const user=session?.user; if(user)socket.join(`user:${user.id}`);
    socket.on('join-conversation',async cid=>{if(!user)return; if(await store.isConversationMember(cid,user.id))socket.join(`conversation:${cid}`);});
    socket.on('typing',async({conversationId,value})=>{if(!user)return;if(await store.isConversationMember(conversationId,user.id))socket.to(`conversation:${conversationId}`).emit('typing',{conversationId,user:user.username,value:!!value});});
    socket.on('chat-message',async({conversationId,text,attachmentUrl},ack)=>{try{if(!user)throw new Error('Login required');if(!(await store.isConversationMember(conversationId,user.id)))throw new Error('Not allowed');text=String(text||'').slice(0,4000);const msg=await store.addMessage({conversation_id:conversationId,sender_id:user.id,body:text,attachment_url:attachmentUrl||null});io.to(`conversation:${conversationId}`).emit('chat-message',msg);const members=await store.conversationMembers(conversationId);for(const m of members.filter(m=>m.id!==user.id)){await store.addNotification(m.id,'message',{conversationId,fromId:user.id,fromUsername:user.username,preview:text.slice(0,80)});io.to(`user:${m.id}`).emit('notification',{type:'message',fromUsername:user.username});}ack&&ack({ok:true,msg});}catch(e){ack&&ack({ok:false,error:e.message});}});

    socket.on('join-meeting',async room=>{if(!user)return;room=String(room||'').slice(0,80);const key=`meeting:${room}`;const existing=[...(io.sockets.adapter.rooms.get(key)||[])].filter(id=>id!==socket.id);socket.join(key);socket.data.meetingRoom=key;socket.emit('meeting-peers',{peers:existing});socket.to(key).emit('peer-joined',{socketId:socket.id,username:user.username});});
    socket.on('webrtc-offer',({room,target,offer})=>socket.to(target).emit('webrtc-offer',{room,from:socket.id,offer,username:user?.username||'User'}));
    socket.on('webrtc-answer',({target,answer})=>socket.to(target).emit('webrtc-answer',{from:socket.id,answer}));
    socket.on('webrtc-ice',({target,candidate})=>socket.to(target).emit('webrtc-ice',{from:socket.id,candidate}));
    socket.on('leave-meeting',room=>socket.leave(`meeting:${String(room||'')}`));
  });

  app.use((req,res)=>res.status(404).sendFile(path.join(__dirname,'public','pages','index.html')));
  const port=Number(process.env.PORT||3000);server.listen(port,()=>{console.log(`Connect running on http://localhost:${port}`);if(process.env.NODE_ENV!=='production')console.log('Development admin: '+(process.env.ADMIN_EMAIL||'admin@connect.local'));});
})();
