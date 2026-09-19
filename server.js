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
const crypto=require('crypto');

(async()=>{
  const store=await createStore();
  const app=express();
  const server=http.createServer(app);
  const sessionMiddleware=session({secret:process.env.SESSION_SECRET||'connect-dev-secret-change-me',resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:'lax',maxAge:1000*60*60*24*7}});
  const io=new Server(server,{maxHttpBufferSize:8e6});
  io.engine.use(sessionMiddleware);
  const pendingCalls=new Map();

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

  const auth=async(req,res,next)=>{if(!req.session.user)return res.status(401).json({error:'Please log in first.'});try{const current=await store.getUser(req.session.user.id);if(!current||current.status!=='active'){delete req.session.user;return res.status(403).json({error:'This account is suspended or unavailable.'});}req.session.user=publicUser(current);next();}catch(e){res.status(500).json({error:'Could not verify account status.'});}};
  const admin=(req,res,next)=>{if(!req.session.admin)return res.status(401).json({error:'Admin login required.'});next();};
  const publicUser=u=>u?({id:u.id,username:u.username,email:u.email,avatar_url:u.avatar_url||null,bio:u.bio||'',status:u.status,created_at:u.created_at}):null;
  const strongPassword=p=>/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,128}$/.test(String(p||''));
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

  app.post('/api/signup',async(req,res)=>{try{let {username,email,password}=req.body;username=String(username||'').trim();email=String(email||'').trim().toLowerCase();password=String(password||'');if(username.length<3)return res.status(400).json({error:'Username must be at least 3 characters.'});if(!/^\S+@\S+\.\S+$/.test(email)||!(await emailDomainLooksValid(email)))return res.status(400).json({error:'Enter a valid email address with a working mail domain.'});if(!strongPassword(password))return res.status(400).json({error:'Password must be 8+ characters and include uppercase, lowercase, a number and a symbol.'});const password_hash=await bcrypt.hash(password,12);const user=await store.createUser({username,email,password_hash});req.session.user=publicUser(user);res.json({ok:true,user:req.session.user,next:'/profile'});}catch(e){const msg=e.message==='EMAIL_EXISTS'?'That email is already registered.':e.message==='USERNAME_EXISTS'?'That username is already taken.':'Could not create account.';res.status(409).json({error:msg});}});

  app.post('/api/login',async(req,res)=>{try{const id=String(req.body.id||'').trim();const password=String(req.body.password||'');const u=await store.findUserByLogin(id);if(!u||u.status!=='active'||!(await bcrypt.compare(password,u.password_hash)))return res.status(401).json({error:'Invalid username/email or password.'});req.session.user=publicUser(u);res.json({ok:true,user:req.session.user,next:u.avatar_url?'/dashboard':'/profile'});}catch(e){res.status(500).json({error:'Login failed.'});}});
  app.post('/api/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));
  app.get('/api/me',async(req,res)=>{if(!req.session.user)return res.json({user:null});const u=await store.getUser(req.session.user.id);if(u)req.session.user=publicUser(u);res.json({user:req.session.user||null,admin:req.session.admin||null});});

  app.post('/api/password/forgot',async(req,res)=>{try{const email=String(req.body.email||'').trim().toLowerCase();const generic={ok:true,message:'If that account exists, a verification code has been sent to the email address.'};const u=await store.findUserByEmail(email);if(!u)return res.json(generic);const code=String(Math.floor(100000+Math.random()*900000));const hash=await bcrypt.hash(code,10);await store.addReset(u.id,hash,Date.now()+10*60*1000);await sendEmail(email,'Connect password reset code',`<div style="font-family:Arial,sans-serif"><h2>Connect password reset</h2><p>Your verification code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:5px">${code}</p><p>This code expires in 10 minutes. If you did not request this, ignore this email.</p></div>`);res.json(generic);}catch(e){console.error('Password reset email:',e.message);res.status(503).json({error:'We could not send the verification email. Please try again later.'});}});
  app.post('/api/password/reset',async(req,res)=>{try{const email=String(req.body.email||'').trim().toLowerCase(),code=String(req.body.code||''),password=String(req.body.password||'');if(!strongPassword(password))return res.status(400).json({error:'New password must be 8+ characters and include uppercase, lowercase, a number and a symbol.'});const u=await store.findUserByEmail(email);if(!u)return res.status(400).json({error:'Invalid or expired code.'});if(await bcrypt.compare(password,u.password_hash))return res.status(400).json({error:'Choose a password different from your current password.'});const r=await store.latestReset(u.id);if(!r||r.used||new Date(r.expires_at).getTime()<Date.now()||!(await bcrypt.compare(code,r.code_hash)))return res.status(400).json({error:'Invalid or expired code.'});await store.updatePassword(u.id,await bcrypt.hash(password,12));await store.markResetUsed(r.id);res.json({ok:true,message:'Password updated. You can log in now.'});}catch(e){res.status(500).json({error:'Could not reset password.'});}});

  app.get('/api/profile',auth,async(req,res)=>res.json({user:await store.getUser(req.session.user.id)}));
  app.post('/api/profile',auth,async(req,res)=>{try{const avatar_url=req.body.avatarData?saveImageData(req.body.avatarData,req.body.avatarName):null;const user=await store.updateProfile(req.session.user.id,{username:String(req.body.username||'').trim(),bio:String(req.body.bio||'').slice(0,300),avatar_url});req.session.user=publicUser(user);res.json({ok:true,user:req.session.user});}catch(e){res.status(400).json({error:e.message==='USERNAME_EXISTS'?'Username is already taken.':e.message||'Could not update profile.'});}});

  app.get('/api/users',auth,async(req,res)=>{const blocked=new Set((await store.blockedIds(req.session.user.id)).map(Number));const users=(await store.searchUsers(req.query.q||'',req.session.user.id)).map(u=>({...u,blocked:blocked.has(Number(u.id))}));res.json({users});});
  app.post('/api/friends/request',auth,async(req,res)=>{try{const target=Number(req.body.userId);if(await store.isBlockedEitherWay(req.session.user.id,target))return res.status(403).json({error:'This connection is blocked.'});const f=await store.createFriendRequest(req.session.user.id,target);await store.addNotification(target,'friend_request',{requestId:f.id,fromId:req.session.user.id,fromUsername:req.session.user.username});io.to(`user:${target}`).emit('notification',{type:'friend_request',fromUsername:req.session.user.username});res.json({ok:true});}catch(e){res.status(400).json({error:'A request already exists, you are already connected, or the request is invalid.'});}});
  app.get('/api/friends/requests',auth,async(req,res)=>res.json({requests:await store.incomingRequests(req.session.user.id)}));
  app.post('/api/friends/respond',auth,async(req,res)=>{const status=req.body.status==='accepted'?'accepted':'rejected';const pending=(await store.incomingRequests(req.session.user.id)).find(x=>Number(x.id)===Number(req.body.requestId));if(status==='accepted'&&pending&&await store.isBlockedEitherWay(req.session.user.id,pending.sender_id))return res.status(403).json({error:'This user is blocked.'});const f=await store.respondFriendRequest(req.body.requestId,req.session.user.id,status);if(!f)return res.status(404).json({error:'Request not found.'});if(status==='accepted'){await store.addNotification(f.sender_id,'friend_accepted',{byId:req.session.user.id,byUsername:req.session.user.username});io.to(`user:${f.sender_id}`).emit('notification',{type:'friend_accepted',byUsername:req.session.user.username});}res.json({ok:true});});
  app.get('/api/friends',auth,async(req,res)=>res.json({friends:await store.friends(req.session.user.id)}));


  app.post('/api/users/:id/block',auth,async(req,res)=>{try{const target=Number(req.params.id);await store.blockUser(req.session.user.id,target);res.json({ok:true,message:'User blocked.'});}catch(e){res.status(400).json({error:'Could not block this user.'});}});
  app.delete('/api/users/:id/block',auth,async(req,res)=>{try{await store.unblockUser(req.session.user.id,Number(req.params.id));res.json({ok:true,message:'User unblocked.'});}catch(e){res.status(400).json({error:'Could not unblock this user.'});}});
  app.post('/api/users/:id/report',auth,async(req,res)=>{try{const reason=String(req.body.reason||'other').trim().slice(0,60);const description=String(req.body.description||'').trim().slice(0,1000);if(!reason)return res.status(400).json({error:'Select a report reason.'});const r=await store.reportUser(req.session.user.id,Number(req.params.id),{reason,description,conversation_id:req.body.conversationId||null,message_id:req.body.messageId||null});await store.addNotification(req.session.user.id,'report_submitted',{reportId:r.id,reportedUserId:Number(req.params.id)});res.json({ok:true,message:'Report submitted for administrator review.'});}catch(e){res.status(400).json({error:'Could not submit this report.'});}});

  app.post('/api/conversations/direct',auth,async(req,res)=>{const friendId=Number(req.body.friendId);if(await store.isBlockedEitherWay(req.session.user.id,friendId))return res.status(403).json({error:'You cannot start a private chat with a blocked user.'});const friends=await store.friends(req.session.user.id);if(!friends.some(f=>f.id===friendId))return res.status(403).json({error:'You can start a chat only with an accepted connection.'});const c=await store.createOrGetDirectConversation(req.session.user.id,friendId);res.json({ok:true,conversation:c});});
  app.post('/api/conversations/group',auth,async(req,res)=>{try{const title=String(req.body.title||'').trim();const memberIds=[...new Set((req.body.memberIds||[]).map(Number).filter(Boolean))];if(title.length<2)return res.status(400).json({error:'Enter a group name.'});if(memberIds.length<2)return res.status(400).json({error:'Select at least two connections for a group.'});const friends=await store.friends(req.session.user.id);const allowed=new Set(friends.map(x=>Number(x.id)));if(memberIds.some(id=>!allowed.has(id)))return res.status(403).json({error:'Groups can include accepted connections only.'});const c=await store.createGroupConversation(req.session.user.id,title,memberIds);res.json({ok:true,conversation:c});}catch(e){res.status(400).json({error:'Could not create group.'});}});
  app.get('/api/conversations',auth,async(req,res)=>res.json({conversations:await store.userConversations(req.session.user.id)}));
  app.get('/api/conversations/:id/messages',auth,async(req,res)=>{if(!(await store.isConversationMember(req.params.id,req.session.user.id)))return res.status(403).json({error:'Not allowed.'});res.json({messages:await store.getMessages(req.params.id,200,req.session.user.id)});});
  app.get('/api/conversations/:id/group-info',auth,async(req,res)=>{const cid=Number(req.params.id);if(!(await store.isConversationMember(cid,req.session.user.id)))return res.status(403).json({error:'Not allowed.'});const conv=(await store.userConversations(req.session.user.id)).find(c=>Number(c.id)===cid);if(!conv||conv.type!=='group')return res.status(400).json({error:'This is not a group conversation.'});const members=await store.conversationMemberDetails(cid);res.json({conversation:conv,members,isAdmin:members.some(m=>Number(m.id)===Number(req.session.user.id)&&m.role==='admin')});});
  app.post('/api/conversations/:id/members',auth,async(req,res)=>{try{const cid=Number(req.params.id),uid=Number(req.body.userId);const friends=await store.friends(req.session.user.id);if(!friends.some(f=>Number(f.id)===uid))return res.status(403).json({error:'You can add accepted connections only.'});await store.addConversationMember(cid,req.session.user.id,uid);res.json({ok:true});}catch(e){res.status(403).json({error:e.message==='ADMIN_REQUIRED'?'Only a group admin can add members.':'Could not add member.'});}});
  app.delete('/api/conversations/:id/members/:userId',auth,async(req,res)=>{try{await store.removeConversationMember(Number(req.params.id),req.session.user.id,Number(req.params.userId));res.json({ok:true});}catch(e){res.status(403).json({error:e.message==='ADMIN_REQUIRED'?'Only a group admin can remove members.':'Could not remove member.'});}});
  app.post('/api/conversations/:id/leave',auth,async(req,res)=>{const ok=await store.leaveConversation(Number(req.params.id),req.session.user.id);res.json({ok});});
  app.post('/api/conversations/:id/read',auth,async(req,res)=>{if(!(await store.isConversationMember(req.params.id,req.session.user.id)))return res.status(403).json({error:'Not allowed.'});const changed=await store.markConversationRead(Number(req.params.id),req.session.user.id);await store.markConversationNotifications(req.session.user.id,Number(req.params.id));for(const r of changed)io.to(`user:${r.sender_id}`).emit('message-receipt',{conversationId:Number(req.params.id),messageId:r.message_id,userId:req.session.user.id,status:'read'});res.json({ok:true,count:changed.length});});
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


  const GROQ_TRANSCRIBE_MODEL=String(process.env.GROQ_TRANSCRIBE_MODEL||'whisper-large-v3-turbo').trim();

  app.get('/api/transcription/status',auth,async(req,res)=>{
    const configured=!!String(process.env.GROQ_API_KEY||'').trim();
    res.json({
      configured,
      engine:'groq-whisper',
      local:false,
      model:GROQ_TRANSCRIBE_MODEL,
      error:configured?undefined:'GROQ_API_KEY is not configured on the Connect server.'
    });
  });

  app.post('/api/transcription/chunk',auth,async(req,res)=>{
    try{
      const room=String(req.body.room||'').slice(0,80);
      if(!room||!(await store.isMeetingParticipant(room,req.session.user.id)))return res.status(403).json({error:'Join the meeting before starting transcription.'});

      const apiKey=String(process.env.GROQ_API_KEY||'').trim();
      if(!apiKey)return res.status(503).json({error:'Groq transcription is not configured. Add GROQ_API_KEY to the server environment.'});

      const raw=String(req.body.audioData||'');
      const comma=raw.indexOf(',');
      const header=comma>=0?raw.slice(0,comma):'';
      const payload=comma>=0?raw.slice(comma+1):'';
      if(!header.startsWith('data:')||!header.toLowerCase().includes(';base64')||!payload)return res.status(400).json({error:'Invalid audio segment.'});
      const buf=Buffer.from(payload,'base64');
      if(buf.length<2500||buf.length>24*1024*1024)return res.status(400).json({error:'Audio segment is empty, too short, or too large.'});

      const headerMime=(header.slice(5).split(';')[0]||'audio/webm').toLowerCase();
      const requestedMime=String(req.body.mimeType||headerMime||'audio/webm').toLowerCase();
      const baseMime=requestedMime.split(';')[0].trim()||headerMime;
      const ext=baseMime.includes('mp4')?'m4a':baseMime.includes('ogg')?'ogg':baseMime.includes('wav')?'wav':'webm';
      const lang=String(req.body.language||'').split('-')[0].toLowerCase();

      const form=new FormData();
      form.append('file',new Blob([buf],{type:baseMime}),`segment.${ext}`);
      form.append('model',GROQ_TRANSCRIBE_MODEL);
      form.append('response_format','json');
      form.append('temperature','0');
      if(['en','hi','mr'].includes(lang))form.append('language',lang);

      let r;
      try{
        r=await fetch('https://api.groq.com/openai/v1/audio/transcriptions',{
          method:'POST',
          headers:{Authorization:`Bearer ${apiKey}`},
          body:form,
          signal:AbortSignal.timeout(60000)
        });
      }catch(e){
        console.error('Groq transcription network error:',e.message);
        return res.status(503).json({error:'Could not reach the Groq transcription service.'});
      }
      if(!r.ok){
        const body=(await r.text()).slice(0,1500);
        console.error('Groq transcription:',r.status,body);
        let message='Groq could not process this audio segment.';
        if(r.status===401)message='Groq rejected the API key. Check GROQ_API_KEY.';
        else if(r.status===429)message='Groq transcription rate limit was reached. Please wait and try again.';
        else if(r.status===413)message='This audio segment is too large for Groq.';
        return res.status(502).json({error:message});
      }
      const j=await r.json();
      const text=String(j.text||'').trim();
      if(!text)return res.json({ok:true,text:'',engine:'groq-whisper',local:false});

      const language=String(req.body.language||j.language||'').slice(0,20),conversationId=Number(req.body.conversationId)||null;
      const saved=await store.saveMeetingTranscript(room,{conversation_id:conversationId,speaker_id:req.session.user.id,speaker_name:req.session.user.username,language,text});
      const packet={id:saved.id,speakerId:req.session.user.id,speaker:req.session.user.username,text,final:true,language,at:new Date().toISOString()};
      io.to(`meeting:${room}`).emit('meeting-transcript',packet);
      res.json({ok:true,text,engine:'groq-whisper',local:false,model:GROQ_TRANSCRIBE_MODEL});
    }catch(e){console.error('Transcription chunk:',e);res.status(500).json({error:'Could not transcribe this audio segment.'});}
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
  async function makeMeetingSummary(lines,language='en'){
    const names={en:'English',hi:'Hindi',mr:'Marathi'}; language=names[language]?language:'en';
    const transcript=(lines||[]).map(x=>`${x.speaker_name||'Participant'}: ${String(x.text||'').trim()}`).filter(x=>!x.endsWith(': ')).slice(-500).join('\n').slice(0,30000);
    if(!transcript)return {summary:'No transcript is available for this meeting.',key_points:[],decisions:[],action_items:[],suggestions:[]};
    if(process.env.OPENAI_API_KEY){
      try{
        const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-4o-mini',temperature:0.15,response_format:{type:'json_object'},messages:[{role:'system',content:`You create concise meeting summaries. Write all output in ${names[language]}. Do not repeat the transcript line-by-line. Return JSON with summary (2-4 short sentences), key_points (array), decisions (array), action_items (array), suggestions (array). Preserve names when assigning action items. Omit empty or trivial information.`},{role:'user',content:transcript}]})});
        if(r.ok){const j=await r.json();const out=JSON.parse(j.choices[0].message.content);return {summary:String(out.summary||'').slice(0,2200),key_points:Array.isArray(out.key_points)?out.key_points.slice(0,8):[],decisions:Array.isArray(out.decisions)?out.decisions.slice(0,6):[],action_items:Array.isArray(out.action_items)?out.action_items.slice(0,8):[],suggestions:Array.isArray(out.suggestions)?out.suggestions.slice(0,5):[],_ai:true};}
      }catch(e){console.warn('Meeting AI summary fallback:',e.message);}
    }
    const raw=(lines||[]).map(x=>String(x.text||'').trim()).filter(Boolean);const words=raw.join(' ').split(/\s+/);const summary=words.slice(0,Math.min(85,Math.max(30,Math.ceil(words.length*.30)))).join(' ')+(words.length>85?'…':'');
    const decisions=raw.filter(t=>/\b(decided|agreed|confirmed|approved|final|decide|agree)\b/i.test(t)).slice(0,5);
    const action_items=raw.filter(t=>/\b(will|need to|must|should|send|finish|complete|review|prepare|update|करू|करणार|करना|करेंगे|करूया)\b/i.test(t)).slice(0,6);
    const note=language==='hi'?'AI API कॉन्फ़िगर होने पर सारांश की गुणवत्ता और भाषा बेहतर होगी।':language==='mr'?'AI API कॉन्फिगर केल्यावर सारांशाची गुणवत्ता आणि भाषा अधिक चांगली होईल.':'Configure the AI API for a more semantic multilingual summary.';
    return {summary,key_points:raw.slice(0,5),decisions,action_items,suggestions:[note],_ai:false};
  }

  app.get('/api/meetings/:room/transcript',auth,async(req,res)=>{const t=await store.meetingTranscript(req.params.room,req.session.user.id);if(t===null)return res.status(403).json({error:'Join this meeting before viewing its transcript.'});res.json({transcript:t});});
  app.delete('/api/meetings/:room/transcript',auth,async(req,res)=>{const ok=await store.clearMeetingTranscript(req.params.room,req.session.user.id);if(!ok)return res.status(403).json({error:'Not allowed.'});res.json({ok:true});});
  app.post('/api/meetings/:room/summary',auth,async(req,res)=>{try{const language=String(req.body.language||'en');const lines=await store.meetingTranscript(req.params.room,req.session.user.id);if(lines===null)return res.status(403).json({error:'You are not a participant in this meeting.'});if(!lines.length)return res.status(400).json({error:'There is no saved transcript to summarize. Start transcription first and speak for a few seconds.'});const out=await makeMeetingSummary(lines,language);const ai=!!out._ai;delete out._ai;const saved=await store.saveMeetingSummary(req.params.room,req.session.user.id,language,out);res.json({ok:true,summary:saved,ai});}catch(e){console.error('Meeting summary:',e);res.status(500).json({error:'Could not generate the meeting summary. Check the server logs and AI configuration.'});}});
  app.get('/api/meeting-summaries',auth,async(req,res)=>res.json({summaries:await store.meetingSummariesForUser(req.session.user.id)}));
  app.delete('/api/meeting-summaries/:id',auth,async(req,res)=>{const ok=await store.deleteMeetingSummary(req.params.id,req.session.user.id);if(!ok)return res.status(404).json({error:'Summary not found.'});res.json({ok:true});});

  app.post('/api/conversations/:id/summary',auth,async(req,res)=>{if(!(await store.isConversationMember(req.params.id,req.session.user.id)))return res.status(403).json({error:'Not allowed.'});const s=await makeSummary(await store.getMessages(req.params.id,500));const saved=await store.saveSummary(req.params.id,s);res.json({ok:true,summary:saved});});
  app.get('/api/summaries',auth,async(req,res)=>res.json({summaries:await store.summariesForUser(req.session.user.id)}));
  app.get('/api/notifications',auth,async(req,res)=>res.json({notifications:await store.notifications(req.session.user.id)}));
  app.post('/api/notifications/read',auth,async(req,res)=>{const types=Array.isArray(req.body?.types)?req.body.types.map(String).slice(0,10):null;await store.markNotifications(req.session.user.id,types);res.json({ok:true});});

  app.post('/api/admin/login',async(req,res)=>{const email=String(req.body.email||''),password=String(req.body.password||'');if(email===(process.env.ADMIN_EMAIL||'admin@connect.local')&&password===(process.env.ADMIN_PASSWORD||'ConnectAdmin@2026!')){req.session.admin={email};await store.audit(email,'ADMIN_LOGIN',null,{ip:req.ip});return res.json({ok:true});}res.status(401).json({error:'Invalid admin credentials.'});});
  app.post('/api/admin/logout',(req,res)=>{delete req.session.admin;res.json({ok:true});});
  app.get('/api/admin/stats',admin,async(req,res)=>res.json({stats:await store.adminStats()}));
  app.get('/api/admin/users',admin,async(req,res)=>{await store.audit(req.session.admin.email,'VIEW_USERS',null,{});res.json({users:await store.adminUsers()});});
  app.patch('/api/admin/users/:id/status',admin,async(req,res)=>{try{const status=String(req.body.status||'');if(!['active','suspended','deleted'].includes(status))return res.status(400).json({error:'Invalid account status.'});const user=await store.setUserStatus(Number(req.params.id),status);if(!user)return res.status(404).json({error:'User not found.'});await store.audit(req.session.admin.email,'SET_USER_STATUS',Number(req.params.id),{status});res.json({ok:true,user});}catch(e){res.status(400).json({error:'Could not update user status.'});}});
  app.delete('/api/admin/users/:id',admin,async(req,res)=>{try{const user=await store.setUserStatus(Number(req.params.id),'deleted');if(!user)return res.status(404).json({error:'User not found.'});await store.audit(req.session.admin.email,'SOFT_DELETE_USER',Number(req.params.id),{});res.json({ok:true,user});}catch(e){res.status(400).json({error:'Could not delete user.'});}});
  app.get('/api/admin/reports',admin,async(req,res)=>{await store.audit(req.session.admin.email,'VIEW_REPORTS',null,{});res.json({reports:await store.adminReports()});});
  app.patch('/api/admin/reports/:id',admin,async(req,res)=>{try{const status=String(req.body.status||'reviewed');if(!['open','reviewed','resolved','dismissed'].includes(status))return res.status(400).json({error:'Invalid report status.'});const report=await store.setReportStatus(Number(req.params.id),status,req.session.admin.email);if(!report)return res.status(404).json({error:'Report not found.'});await store.audit(req.session.admin.email,'UPDATE_REPORT',null,{reportId:Number(req.params.id),status});res.json({ok:true,report});}catch(e){res.status(400).json({error:'Could not update report.'});}});

  io.on('connection',socket=>{
    const session=socket.request.session; const user=session?.user; if(user)socket.join(`user:${user.id}`);
    socket.on('join-conversation',async cid=>{if(!user)return; if(await store.isConversationMember(cid,user.id))socket.join(`conversation:${cid}`);});
    socket.on('typing',async({conversationId,value})=>{if(!user)return;if(await store.isConversationMember(conversationId,user.id))socket.to(`conversation:${conversationId}`).emit('typing',{conversationId,user:user.username,value:!!value});});
    socket.on('chat-message',async({conversationId,text,attachmentUrl},ack)=>{try{if(!user)throw new Error('Login required');const live=await store.getUser(user.id);if(!live||live.status!=='active')throw new Error('Account suspended');if(!(await store.isConversationMember(conversationId,user.id)))throw new Error('Not allowed');const cms=await store.conversationMembers(conversationId);if(cms.length===2){const other=cms.find(m=>Number(m.id)!==Number(user.id));if(other&&await store.isBlockedEitherWay(user.id,other.id))throw new Error('Private messaging is blocked between these users.');}text=String(text||'').slice(0,4000);const msg=await store.addMessage({conversation_id:conversationId,sender_id:user.id,body:text,attachment_url:attachmentUrl||null});const members=await store.conversationMembers(conversationId);await store.initMessageReceipts(msg.id,user.id,members.map(m=>m.id));io.to(`conversation:${conversationId}`).emit('chat-message',msg);for(const m of members.filter(m=>m.id!==user.id)){await store.addNotification(m.id,'message',{conversationId,fromId:user.id,fromUsername:user.username,preview:text.slice(0,80)});const sockets=io.sockets.adapter.rooms.get(`user:${m.id}`);if(sockets?.size){await store.markMessageDelivered(msg.id,m.id);io.to(`user:${user.id}`).emit('message-receipt',{conversationId:Number(conversationId),messageId:msg.id,userId:m.id,status:'delivered'});}io.to(`user:${m.id}`).emit('notification',{type:'message',fromUsername:user.username,conversationId:Number(conversationId)});}ack&&ack({ok:true,msg});}catch(e){ack&&ack({ok:false,error:e.message});}});

    socket.on('call-request',async(payload,ack)=>{try{if(!user)throw new Error('Login required');const conversationId=Number(payload?.conversationId);const mode=payload?.mode==='audio'?'audio':'video';if(!conversationId||!(await store.isConversationMember(conversationId,user.id)))throw new Error('Conversation not found.');const members=await store.conversationMembers(conversationId);const recipients=members.filter(m=>Number(m.id)!==Number(user.id));if(!recipients.length)throw new Error('No participant is available for this call.');const callId=crypto.randomUUID();const room=`chat-${conversationId}-${callId.slice(0,8)}`;const call={callId,conversationId,mode,room,callerId:Number(user.id),callerName:user.username,callerAvatar:user.avatar_url||'',recipientIds:recipients.map(m=>Number(m.id)),createdAt:Date.now(),acceptedBy:null};pendingCalls.set(callId,call);for(const r of recipients)io.to(`user:${r.id}`).emit('incoming-call',{callId,conversationId,mode,room,callerId:user.id,callerName:user.username,callerAvatar:user.avatar_url||''});setTimeout(()=>{const c=pendingCalls.get(callId);if(c&&!c.acceptedBy){pendingCalls.delete(callId);io.to(`user:${c.callerId}`).emit('call-timeout',{callId});for(const rid of c.recipientIds)io.to(`user:${rid}`).emit('call-cancelled',{callId,reason:'timeout'});}},30000);ack&&ack({ok:true,callId,room,mode});}catch(e){ack&&ack({ok:false,error:e.message});}});
    socket.on('call-response',payload=>{if(!user)return;const call=pendingCalls.get(String(payload?.callId||''));if(!call||!call.recipientIds.includes(Number(user.id)))return;const accepted=!!payload?.accepted;if(!accepted){io.to(`user:${call.callerId}`).emit('call-declined',{callId:call.callId,by:user.username});socket.emit('call-cancelled',{callId:call.callId,reason:'declined'});return;}if(call.acceptedBy)return;call.acceptedBy=Number(user.id);pendingCalls.delete(call.callId);const data={callId:call.callId,conversationId:call.conversationId,mode:call.mode,room:call.room,acceptedBy:user.username};io.to(`user:${call.callerId}`).emit('call-accepted',data);io.to(`user:${user.id}`).emit('call-accepted',data);for(const rid of call.recipientIds.filter(id=>id!==Number(user.id)))io.to(`user:${rid}`).emit('call-cancelled',{callId:call.callId,reason:'answered'});});
    socket.on('cancel-call',payload=>{if(!user)return;const call=pendingCalls.get(String(payload?.callId||''));if(!call||call.callerId!==Number(user.id))return;pendingCalls.delete(call.callId);for(const rid of call.recipientIds)io.to(`user:${rid}`).emit('call-cancelled',{callId:call.callId,reason:'cancelled'});});

    socket.on('join-meeting',async payload=>{if(!user)return;const data=typeof payload==='object'&&payload?payload:{room:payload};const room=String(data.room||'').slice(0,80);if(!room)return;const conversationId=Number(data.conversationId)||null;if(conversationId&&!(await store.isConversationMember(conversationId,user.id)))return;const meeting=await store.ensureMeeting(room,conversationId);await store.addMeetingParticipant(meeting.id,user.id);const key=`meeting:${room}`;const existingIds=[...(io.sockets.adapter.rooms.get(key)||[])].filter(id=>id!==socket.id);const existing=existingIds.map(id=>{const s=io.sockets.sockets.get(id);return {socketId:id,username:s?.request?.session?.user?.username||'Participant',avatar_url:s?.request?.session?.user?.avatar_url||''}});const isHost=existingIds.length===0;socket.join(key);socket.data.meetingRoom=key;socket.data.meetingId=meeting.id;socket.data.meetingHost=isHost;socket.emit('meeting-peers',{peers:existing,isHost});socket.to(key).emit('peer-joined',{socketId:socket.id,username:user.username,avatar_url:user.avatar_url||''});});
    socket.on('webrtc-offer',({room,target,offer})=>socket.to(target).emit('webrtc-offer',{room,from:socket.id,offer,username:user?.username||'User',avatar_url:user?.avatar_url||''}));
    socket.on('webrtc-answer',({target,answer})=>socket.to(target).emit('webrtc-answer',{from:socket.id,answer}));
    socket.on('webrtc-ice',({target,candidate})=>socket.to(target).emit('webrtc-ice',{from:socket.id,candidate}));
    socket.on('meeting-transcription-status',({room,active,language})=>{if(!user)return;const key=`meeting:${String(room||'').slice(0,80)}`;if(!socket.rooms.has(key))return;socket.to(key).emit('meeting-transcription-status',{active:!!active,language:String(language||'').slice(0,20),username:user.username});});
    socket.on('meeting-transcript',async({room,text,final,language,conversationId})=>{if(!user)return;room=String(room||'').slice(0,80);const key=`meeting:${room}`;if(!socket.rooms.has(key))return;text=String(text||'').trim().slice(0,2000);if(!text)return;const packet={speakerId:user.id,speaker:user.username,text,final:!!final,language:String(language||'').slice(0,20),at:new Date().toISOString()};if(final){try{const saved=await store.saveMeetingTranscript(room,{conversation_id:Number(conversationId)||null,speaker_id:user.id,speaker_name:user.username,language:packet.language,text});packet.id=saved.id;}catch(e){console.warn('Transcript save:',e.message);}}io.to(key).emit('meeting-transcript',packet);});
    socket.on('end-meeting',room=>{const key=`meeting:${String(room||'').slice(0,80)}`;if(!socket.data.meetingHost||socket.data.meetingRoom!==key)return;io.to(key).emit('meeting-ended',{by:user?.username||'Host'});for(const id of [...(io.sockets.adapter.rooms.get(key)||[])])io.sockets.sockets.get(id)?.leave(key);});
    socket.on('leave-meeting',room=>{const key=`meeting:${String(room||'').slice(0,80)}`;socket.to(key).emit('peer-left',{socketId:socket.id});socket.leave(key);});
    socket.on('disconnecting',()=>{const key=socket.data.meetingRoom;if(key)socket.to(key).emit('peer-left',{socketId:socket.id});});
  });

  app.use((req,res)=>res.status(404).sendFile(path.join(__dirname,'public','pages','index.html')));
  const port=Number(process.env.PORT||3000);server.listen(port,()=>{console.log(`Connect running on http://localhost:${port}`);if(process.env.NODE_ENV!=='production')console.log('Development admin: '+(process.env.ADMIN_EMAIL||'admin@connect.local'));});
})();
