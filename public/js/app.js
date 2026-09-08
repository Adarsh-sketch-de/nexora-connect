const qs=(s,r=document)=>r.querySelector(s), qsa=(s,r=document)=>[...r.querySelectorAll(s)];
async function api(url,options={}){const r=await fetch(url,{headers:options.body instanceof FormData?undefined:{'Content-Type':'application/json'},...options});let j={};try{j=await r.json()}catch{}if(!r.ok)throw new Error(j.error||'Request failed');return j;}
function escapeHtml(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function avatar(u){if(u?.avatar_url)return u.avatar_url;const initials=(u?.username||'User').slice(0,2).toUpperCase();const svg=`<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><rect width='100%' height='100%' rx='60' fill='%23242a46'/><text x='50%' y='54%' text-anchor='middle' dominant-baseline='middle' fill='white' font-size='40' font-family='Arial'>${initials.replace(/[^A-Z0-9]/g,'')}</text></svg>`;return 'data:image/svg+xml,'+encodeURIComponent(svg)}
function flash(el,msg,type='success'){if(!el)return;el.textContent=msg;el.className='message-box '+type;}
function fileToData(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)})}
async function me(){return (await api('/api/me')).user}
async function requireUser(){const u=await me();if(!u){location.href='/login';throw new Error('LOGIN_REQUIRED')}return u}
async function bindGlobal(){
  const logout=qs('[data-logout]');
  if(logout)logout.onclick=async()=>{await api('/api/logout',{method:'POST'});location.href='/'};
  const user=await me().catch(()=>null);
  qsa('[data-user-name]').forEach(el=>el.textContent=user?.username||'Guest');
  qsa('[data-user-avatar]').forEach(el=>el.src=avatar(user));

  // Mobile navigation: generated centrally so every page works on phones
  const topbar=qs('.topbar'),nav=qs('.navlinks');
  if(topbar&&nav&&!qs('.mobile-menu-toggle')){
    const toggle=document.createElement('button');toggle.className='mobile-menu-toggle';toggle.type='button';toggle.setAttribute('aria-label','Open navigation');toggle.setAttribute('aria-expanded','false');toggle.textContent='☰';
    const menu=document.createElement('div');menu.className='mobile-menu';menu.setAttribute('aria-label','Mobile navigation');
    const links=[['Dashboard','/dashboard'],['Discover users','/discover'],['Requests','/requests'],['Messages','/chat'],['Meeting room','/meeting'],['History','/history'],['Summaries','/summary'],['Notifications','/notifications'],['Profile','/profile'],['Settings','/settings']];
    if(user)links.forEach(([label,href])=>{const a=document.createElement('a');a.href=href;a.textContent=label;menu.appendChild(a)});
    else [['Features','/features'],['Help','/help'],['Login','/login'],['Sign up','/signup']].forEach(([label,href])=>{const a=document.createElement('a');a.href=href;a.textContent=label;menu.appendChild(a)});
    if(user){const b=document.createElement('button');b.type='button';b.textContent='Logout';b.onclick=async()=>{await api('/api/logout',{method:'POST'});location.href='/'};menu.appendChild(b)}
    toggle.onclick=()=>{const open=menu.classList.toggle('open');toggle.setAttribute('aria-expanded',String(open));toggle.textContent=open?'✕':'☰'};
    document.addEventListener('click',e=>{if(menu.classList.contains('open')&&!menu.contains(e.target)&&e.target!==toggle){menu.classList.remove('open');toggle.setAttribute('aria-expanded','false');toggle.textContent='☰'}});
    nav.prepend(toggle);topbar.after(menu);
  }

  if(user){
    const toggle=qs('.mobile-menu-toggle');
    if(toggle&&!toggle.querySelector('.global-unread-badge')){const b=document.createElement('span');b.className='global-unread-badge';b.hidden=true;toggle.appendChild(b)}
    const updateBadges=async()=>{try{const j=await api('/api/notifications');const unread=(j.notifications||[]).filter(n=>!n.is_read);const total=unread.length, messages=unread.filter(n=>n.type==='message').length, requests=unread.filter(n=>n.type==='friend_request'||n.type==='friend_accepted').length;const b=qs('.global-unread-badge');if(b){b.textContent=total>99?'99+':String(total);b.hidden=!total}qsa('.mobile-menu a').forEach(a=>{const base=a.textContent.replace(/\s*\(\d+\+?\)$/,'');if(base==='Messages'&&messages)a.textContent=`Messages (${messages})`;else if(base==='Requests'&&requests)a.textContent=`Requests (${requests})`;else a.textContent=base});}catch{}};
    let audioUnlocked=false;const unlock=()=>{audioUnlocked=true;document.removeEventListener('pointerdown',unlock)};document.addEventListener('pointerdown',unlock,{once:true});
    const playAlert=()=>{if(localStorage.getItem('connectNotificationSound')==='off'||!audioUnlocked)return;try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const c=new C(),o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.frequency.value=740;g.gain.setValueAtTime(.0001,c.currentTime);g.gain.exponentialRampToValueAtTime(.12,c.currentTime+.02);g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+.22);o.start();o.stop(c.currentTime+.24)}catch{}};
    const globalSocket=io();globalSocket.on('notification',n=>{playAlert();updateBadges();});window.connectGlobalSocket=globalSocket;window.connectUpdateBadges=updateBadges;updateBadges();
  }
}

document.addEventListener('DOMContentLoaded',async()=>{await bindGlobal();const page=document.body.dataset.page;try{({login:initLogin,signup:initSignup,forgot:initForgot,profile:initProfile,dashboard:initDashboard,discover:initDiscover,requests:initRequests,chat:initChat,meeting:initMeeting,history:initHistory,summary:initSummary,notifications:initNotifications,settings:initSettings,admin:initAdmin}[page]||(()=>{}))();}catch(e){console.error(e)}});

function initLogin(){const f=qs('#loginForm'),msg=qs('#formMsg');f.onsubmit=async e=>{e.preventDefault();try{const j=await api('/api/login',{method:'POST',body:JSON.stringify({id:f.id.value,password:f.password.value})});flash(msg,'Login successful.');setTimeout(()=>location.href=j.next||'/dashboard',350)}catch(err){flash(msg,err.message,'error')}};}
function initSignup(){const f=qs('#signupForm'),msg=qs('#formMsg');f.onsubmit=async e=>{e.preventDefault();if(f.password.value!==f.confirm.value)return flash(msg,'Passwords do not match.','error');try{const j=await api('/api/signup',{method:'POST',body:JSON.stringify({username:f.username.value,email:f.email.value,password:f.password.value})});flash(msg,'Account created. Complete your profile.');setTimeout(()=>location.href=j.next||'/profile',350)}catch(err){flash(msg,err.message,'error')}};}
function initForgot(){const request=qs('#requestReset'),reset=qs('#resetPassword'),msg=qs('#formMsg');request.onsubmit=async e=>{e.preventDefault();try{const j=await api('/api/password/forgot',{method:'POST',body:JSON.stringify({email:request.email.value})});flash(msg,j.message);reset.email.value=request.email.value;reset.hidden=false}catch(err){flash(msg,err.message,'error')}};reset.onsubmit=async e=>{e.preventDefault();if(reset.password.value!==reset.confirm.value)return flash(msg,'Passwords do not match.','error');try{const j=await api('/api/password/reset',{method:'POST',body:JSON.stringify({email:reset.email.value,code:reset.code.value,password:reset.password.value})});flash(msg,j.message);setTimeout(()=>location.href='/login',700)}catch(err){flash(msg,err.message,'error')}};}
async function initProfile(){const u=await requireUser(),f=qs('#profileForm'),msg=qs('#formMsg'),preview=qs('#avatarPreview');f.username.value=u.username;f.email.value=u.email;f.bio.value=u.bio||'';preview.src=avatar(u);f.avatar.onchange=()=>{const file=f.avatar.files[0];if(file)preview.src=URL.createObjectURL(file)};f.onsubmit=async e=>{e.preventDefault();try{const file=f.avatar.files[0];const body={username:f.username.value,bio:f.bio.value,avatarData:file?await fileToData(file):null,avatarName:file?.name||null};const j=await api('/api/profile',{method:'POST',body:JSON.stringify(body)});preview.src=avatar(j.user);flash(msg,'Profile saved successfully.')}catch(err){flash(msg,err.message,'error')}};}
async function initDashboard(){const u=await requireUser();qs('#welcome').textContent=`Welcome back, ${u.username}`;const [friends,convos,notes,sums]=await Promise.all([api('/api/friends'),api('/api/conversations'),api('/api/notifications'),api('/api/summaries')]);qs('#friendCount').textContent=friends.friends.length;qs('#conversationCount').textContent=convos.conversations.length;qs('#notificationCount').textContent=notes.notifications.filter(n=>!n.is_read).length;qs('#summaryCount').textContent=sums.summaries.length;}
async function initDiscover(){
  await requireUser();const input=qs('#searchUsers'),list=qs('#results'),msg=qs('#formMsg');
  async function reportUser(id,name){
    const reason=prompt(`Report ${name}
Reason (harassment, spam, abusive behavior, fake account, suspicious activity, other):`,'other');if(!reason)return;
    const description=prompt('Describe what happened (optional):','')||'';
    try{const j=await api(`/api/users/${id}/report`,{method:'POST',body:JSON.stringify({reason,description})});flash(msg,j.message||'Report submitted.')}catch(e){flash(msg,e.message,'error')}
  }
  async function run(){
    const q=input.value.trim();if(!q){list.innerHTML='<p class="muted">Search by username or email.</p>';return}
    const j=await api('/api/users?q='+encodeURIComponent(q));
    list.innerHTML=j.users.length?j.users.map(u=>`<div class="list-item"><div class="row"><img class="avatar" src="${avatar(u)}"><div><b>${escapeHtml(u.username)}</b><div class="muted">${escapeHtml(u.email)}</div>${u.blocked?'<span class="chip danger-chip">Blocked</span>':''}</div></div><div class="row moderation-actions"><button data-add="${u.id}" ${u.blocked?'disabled':''}>Add connection</button><button data-block="${u.id}" data-name="${escapeHtml(u.username)}">${u.blocked?'Unblock':'Block'}</button><button class="danger" data-report="${u.id}" data-name="${escapeHtml(u.username)}">Report</button></div></div>`).join(''):'<p class="muted">No users found.</p>';
    qsa('[data-add]',list).forEach(b=>b.onclick=async()=>{try{await api('/api/friends/request',{method:'POST',body:JSON.stringify({userId:Number(b.dataset.add)})});b.textContent='Request sent';b.disabled=true;flash(msg,'Connection request sent.')}catch(err){flash(msg,err.message,'error')}});
    qsa('[data-block]',list).forEach(b=>b.onclick=async()=>{try{const id=Number(b.dataset.block),unblock=b.textContent==='Unblock';const j=await api(`/api/users/${id}/block`,{method:unblock?'DELETE':'POST'});flash(msg,j.message);await run()}catch(e){flash(msg,e.message,'error')}});
    qsa('[data-report]',list).forEach(b=>b.onclick=()=>reportUser(Number(b.dataset.report),b.dataset.name));
  }
  input.oninput=()=>{clearTimeout(input._t);input._t=setTimeout(run,250)};run();
}
async function initRequests(){
  await requireUser();const list=qs('#requestList');
  // Opening Requests acknowledges request-related notices only; message notices stay unread.
  await api('/api/notifications/read',{method:'POST',body:JSON.stringify({types:['friend_request','friend_accepted']})}).catch(()=>{});window.connectUpdateBadges?.();
  async function load(){const j=await api('/api/friends/requests');list.innerHTML=j.requests.length?j.requests.map(r=>`<div class="list-item"><div class="row"><img class="avatar" src="${avatar(r.sender)}"><div><b>${escapeHtml(r.sender.username)}</b><div class="muted">${escapeHtml(r.sender.email)}</div></div></div><div class="row"><button class="primary" data-accept="${r.id}">Accept</button><button data-reject="${r.id}">Reject</button></div></div>`).join(''):'<p class="muted">No pending requests.</p>';qsa('[data-accept]',list).forEach(b=>b.onclick=()=>respond(b.dataset.accept,'accepted'));qsa('[data-reject]',list).forEach(b=>b.onclick=()=>respond(b.dataset.reject,'rejected'));}
  async function respond(id,status){await api('/api/friends/respond',{method:'POST',body:JSON.stringify({requestId:Number(id),status})});await load();await api('/api/notifications/read',{method:'POST',body:JSON.stringify({types:['friend_request','friend_accepted']})}).catch(()=>{});window.connectUpdateBadges?.();}
  load();
}
async function initChat(){
  const user=await requireUser(),socket=io(),convList=qs('#conversationList'),messages=qs('#messages'),title=qs('#chatTitle'),membersEl=qs('#chatMembers'),typing=qs('#typing'),form=qs('#composer'),file=qs('#chatImage'),summaryBtn=qs('#generateSummary'),meetingBtn=qs('#startChatMeeting'),audioBtn=qs('#startAudioCall'),moderateBtn=qs('#chatModerate'),moreBtn=qs('#chatMoreBtn'),moreMenu=qs('#chatMoreMenu'),mobileAudioBtn=qs('#mobileAudioCall'),mobileVideoBtn=qs('#mobileVideoCall'),emojiBtn=qs('#emojiBtn'),emojiPicker=qs('#emojiPicker'),mobileChatBack=qs('#mobileChatBack');
  let current=null,currentOther=null,conversationCache=[];
  async function loadConvos(){
    const [cj,fj]=await Promise.all([api('/api/conversations'),api('/api/friends')]);
    conversationCache=cj.conversations||[];
    convList.innerHTML='';
    const directFriendIds=new Set(conversationCache.filter(c=>c.type==='direct').flatMap(c=>(c.others||[]).map(o=>Number(o.id))));
    if(conversationCache.length){
      const heading=document.createElement('div');heading.className='muted';heading.style.padding='8px 12px';heading.textContent='RECENT CHATS';convList.appendChild(heading);
      conversationCache.forEach(c=>{
        const other=c.others?.[0],el=document.createElement('div');el.className='conversation';el.dataset.cid=c.id;
        const label=c.type==='group'?(c.title||'Group'):(other?.username||'Conversation');
        const participant=c.type==='group'?`${(c.others?.length||0)+1} members`:'Private chat';
        el.innerHTML=`<b>${c.type==='group'?'👥 ':'💬 '}${escapeHtml(label)}</b><div class="muted">${escapeHtml(c.lastMessage?.body||participant)}</div>`;
        el.onclick=()=>openConversation(c.id);convList.appendChild(el);
      });
    }
    const available=(fj.friends||[]).filter(f=>!directFriendIds.has(Number(f.id)));
    if(available.length){
      const heading=document.createElement('div');heading.className='muted';heading.style.padding='14px 12px 8px';heading.textContent='START A NEW CHAT';convList.appendChild(heading);
      available.forEach(f=>{const el=document.createElement('div');el.className='conversation';el.innerHTML=`<b>＋ ${escapeHtml(f.username)}</b><div class="muted">Connected · click to chat</div>`;el.onclick=async()=>{const r=await api('/api/conversations/direct',{method:'POST',body:JSON.stringify({friendId:Number(f.id)})});await loadConvos();await openConversation(r.conversation.id)};convList.appendChild(el)});
    }
    if(!conversationCache.length&&!available.length)convList.innerHTML='<p class="muted" style="padding:12px">Add a connection first.</p>';
    if(!current&&conversationCache.length){const requested=Number(new URLSearchParams(location.search).get('id'));if(requested&&conversationCache.some(c=>c.id===requested))await openConversation(requested);else if(!matchMedia('(max-width:620px)').matches)await openConversation(conversationCache[0].id)}
    qsa('.conversation[data-cid]',convList).forEach(x=>x.classList.toggle('active',Number(x.dataset.cid)===current));
  }
  async function openConversation(id){
    current=Number(id);document.body.classList.add('chat-conversation-open');socket.emit('join-conversation',current);
    const [m,c]=await Promise.all([api(`/api/conversations/${current}/messages`),api('/api/conversations')]);conversationCache=c.conversations||[];
    const convo=conversationCache.find(x=>Number(x.id)===current),other=convo?.others?.[0];currentOther=convo?.type==='direct'?other:null;
    if(moderateBtn){moderateBtn.disabled=!currentOther;moderateBtn.textContent=currentOther?'⋮ Safety':'Group safety'}
    title.textContent=convo?.type==='group'?(convo.title||'Group'):(other?.username||'Conversation');
    if(membersEl)membersEl.textContent=convo?.type==='group'?`${(convo.others?.length||0)+1} participants · group chat`:'Private conversation';
    if(meetingBtn){meetingBtn.disabled=false;meetingBtn.textContent=convo?.type==='group'?'📹 Group video':'📹 Video call'}if(audioBtn){audioBtn.disabled=false;audioBtn.textContent=convo?.type==='group'?'📞 Group audio':'📞 Audio call'}if(moreBtn)moreBtn.disabled=false
    messages.innerHTML=m.messages.map(renderMsg).join('');messages.scrollTop=messages.scrollHeight;await api(`/api/conversations/${current}/read`,{method:'POST'}).catch(()=>{});window.connectUpdateBadges?.();
    qsa('.conversation[data-cid]',convList).forEach(x=>x.classList.toggle('active',Number(x.dataset.cid)===current));
  }
  function renderMsg(m){const mine=m.sender_id===user.id,status=m.receipt_status||'sent',ticks=status==='sent'?'✓':'✓✓';return `<div class="msg ${mine?'mine':''}" data-message-id="${m.id}"><b>${escapeHtml(m.sender?.username||'User')}</b>${m.body?`<div>${escapeHtml(m.body)}</div>`:''}${m.attachment_url?`<a href="${escapeHtml(m.attachment_url)}" download target="_blank" title="Download image"><img src="${escapeHtml(m.attachment_url)}"><small>Download image ↓</small></a>`:''}<small>${new Date(m.created_at).toLocaleString()} ${mine?`<span class="receipt receipt-${status}" title="${status[0].toUpperCase()+status.slice(1)}">${ticks}</span>`:''}</small></div>`}
  form.onsubmit=async e=>{e.preventDefault();if(!current)return;let attachmentUrl=null;if(file.files[0]){const imageData=await fileToData(file.files[0]);attachmentUrl=(await api('/api/upload',{method:'POST',body:JSON.stringify({imageData,imageName:file.files[0].name})})).url}const text=form.message.value.trim();if(!text&&!attachmentUrl)return;socket.emit('chat-message',{conversationId:current,text,attachmentUrl},r=>{if(!r?.ok)alert(r?.error||'Could not send')});form.message.value='';file.value='';socket.emit('typing',{conversationId:current,value:false});};
  form.message.oninput=()=>current&&socket.emit('typing',{conversationId:current,value:true});
  socket.on('chat-message',async m=>{if(Number(m.conversation_id)===current){messages.insertAdjacentHTML('beforeend',renderMsg(m));messages.scrollTop=messages.scrollHeight;if(Number(m.sender_id)!==Number(user.id)){await api(`/api/conversations/${current}/read`,{method:'POST'}).catch(()=>{});window.connectUpdateBadges?.();}}loadConvos()});socket.on('message-receipt',r=>{const el=qs(`[data-message-id=\"${r.messageId}\"] .receipt`);if(el){el.className=`receipt receipt-${r.status}`;el.textContent=r.status==='sent'?'✓':'✓✓';el.title=r.status[0].toUpperCase()+r.status.slice(1)}});
  socket.on('typing',d=>{if(Number(d.conversationId)===current){typing.textContent=d.value?`${d.user} is typing…`:'';if(d.value)setTimeout(()=>typing.textContent='',1800)}});
  summaryBtn.onclick=async()=>{if(!current)return;const j=await api(`/api/conversations/${current}/summary`,{method:'POST'});localStorage.setItem('lastSummary',JSON.stringify(j.summary));location.href='/summary'};
  if(meetingBtn)meetingBtn.onclick=()=>{if(!current)return;location.href=`/meeting?room=chat-${current}&conversation=${current}&mode=video`};if(audioBtn)audioBtn.onclick=()=>{if(!current)return;location.href=`/meeting?room=chat-${current}&conversation=${current}&mode=audio`};if(mobileAudioBtn)mobileAudioBtn.onclick=()=>audioBtn?.click();if(mobileVideoBtn)mobileVideoBtn.onclick=()=>meetingBtn?.click();if(moreBtn&&moreMenu){moreBtn.onclick=()=>{const open=moreMenu.classList.toggle('open');moreBtn.setAttribute('aria-expanded',String(open))};document.addEventListener('click',e=>{if(!e.target.closest('.chat-actions')){moreMenu.classList.remove('open');moreBtn.setAttribute('aria-expanded','false')}})}
  if(moderateBtn)moderateBtn.onclick=async()=>{if(!currentOther)return;const choice=prompt(`Safety options for ${currentOther.username}:\n1 = Block user\n2 = Report user`,'2');if(choice==='1'){if(!confirm(`Block ${currentOther.username}? Private messaging will be disabled between you.`))return;try{await api(`/api/users/${currentOther.id}/block`,{method:'POST'});alert('User blocked.');await loadConvos()}catch(e){alert(e.message)}}else if(choice==='2'){const reason=prompt('Reason (harassment, spam, abusive behavior, fake account, suspicious activity, other):','other');if(!reason)return;const description=prompt('Describe what happened (optional):','')||'';try{const j=await api(`/api/users/${currentOther.id}/report`,{method:'POST',body:JSON.stringify({reason,description,conversationId:current})});alert(j.message||'Report submitted.')}catch(e){alert(e.message)}}};
  if(mobileChatBack)mobileChatBack.onclick=()=>{document.body.classList.remove('chat-conversation-open');moreMenu?.classList.remove('open')};
  const groupBtn=qs('#createGroup'),groupModal=qs('#groupModal'),closeGroupModal=qs('#closeGroupModal'),groupName=qs('#groupName'),groupSearch=qs('#groupSearch'),groupMemberList=qs('#groupMemberList'),groupSelectedWrap=qs('#groupSelectedWrap'),groupSelectedCount=qs('#groupSelectedCount'),groupSelectedPreview=qs('#groupSelectedPreview'),groupSelectAll=qs('#groupSelectAll'),groupClearAll=qs('#groupClearAll'),confirmCreateGroup=qs('#confirmCreateGroup');
  let groupFriends=[],groupSelected=new Set();
  function closeGroup(){if(groupModal){groupModal.hidden=true;document.body.classList.remove('modal-open')}}
  function renderGroupPicker(){if(!groupMemberList)return;const term=(groupSearch?.value||'').trim().toLowerCase(),visible=groupFriends.filter(f=>!term||f.username.toLowerCase().includes(term)||String(f.email||'').toLowerCase().includes(term));groupMemberList.innerHTML=visible.map(f=>`<label class="group-member-card ${groupSelected.has(Number(f.id))?'selected':''}"><img src="${avatar(f)}" class="avatar"><span class="group-member-copy"><b>${escapeHtml(f.username)}</b><small>${escapeHtml(f.email||'Connected user')}</small></span><input type="checkbox" value="${f.id}" ${groupSelected.has(Number(f.id))?'checked':''}><span class="modern-check">✓</span></label>`).join('')||'<p class="muted group-empty">No matching connections.</p>';qsa('input[type=checkbox]',groupMemberList).forEach(box=>box.onchange=()=>{const id=Number(box.value);box.checked?groupSelected.add(id):groupSelected.delete(id);renderGroupPicker();renderSelected()});}
  function renderSelected(){const chosen=groupFriends.filter(f=>groupSelected.has(Number(f.id)));if(groupSelectedCount)groupSelectedCount.textContent=String(chosen.length);if(groupSelectedWrap)groupSelectedWrap.hidden=!chosen.length;if(groupSelectedPreview)groupSelectedPreview.innerHTML=chosen.map(f=>`<button type="button" class="selected-person" data-remove-member="${f.id}"><img src="${avatar(f)}"><span>${escapeHtml(f.username)}</span><i>×</i></button>`).join('');qsa('[data-remove-member]',groupSelectedPreview).forEach(b=>b.onclick=()=>{groupSelected.delete(Number(b.dataset.removeMember));renderGroupPicker();renderSelected()});if(confirmCreateGroup)confirmCreateGroup.disabled=groupSelected.size<2||!(groupName?.value||'').trim();if(groupSelectAll)groupSelectAll.textContent=groupSelected.size===groupFriends.length&&groupFriends.length?'Clear all':'Select all';}
  if(groupBtn)groupBtn.onclick=async()=>{try{const f=await api('/api/friends');groupFriends=f.friends||[];if(groupFriends.length<2)return alert('You need at least two accepted connections to create a group.');groupSelected.clear();if(groupName)groupName.value='';if(groupSearch)groupSearch.value='';renderGroupPicker();renderSelected();groupModal.hidden=false;document.body.classList.add('modal-open');setTimeout(()=>groupName?.focus(),50)}catch(e){alert(e.message)}};
  closeGroupModal?.addEventListener('click',closeGroup);groupModal?.addEventListener('click',e=>{if(e.target===groupModal)closeGroup()});groupSearch?.addEventListener('input',renderGroupPicker);groupName?.addEventListener('input',renderSelected);groupSelectAll?.addEventListener('click',()=>{if(groupSelected.size===groupFriends.length)groupSelected.clear();else groupFriends.forEach(f=>groupSelected.add(Number(f.id)));renderGroupPicker();renderSelected()});groupClearAll?.addEventListener('click',()=>{groupSelected.clear();renderGroupPicker();renderSelected()});confirmCreateGroup?.addEventListener('click',async()=>{const title=(groupName?.value||'').trim();if(title.length<1||groupSelected.size<2)return;confirmCreateGroup.disabled=true;confirmCreateGroup.textContent='Creating…';try{const r=await api('/api/conversations/group',{method:'POST',body:JSON.stringify({title,memberIds:[...groupSelected]})});closeGroup();await loadConvos();await openConversation(r.conversation.id)}catch(e){alert(e.message)}finally{confirmCreateGroup.textContent='Create group';renderSelected()}});
  if(emojiBtn&&emojiPicker){const emojis=['😀','😂','😊','😍','🥰','😎','🤔','😢','😡','👍','👎','👏','🙏','💪','❤️','🔥','🎉','✅','⭐','💯','😅','😉','🤝','👋','🚀','📌','💡','🎯'];emojiPicker.innerHTML=emojis.map(e=>`<button type="button" aria-label="${e}">${e}</button>`).join('');emojiBtn.onclick=()=>{emojiPicker.hidden=!emojiPicker.hidden};emojiPicker.onclick=e=>{if(e.target.tagName!=='BUTTON')return;const input=form.message;const start=input.selectionStart??input.value.length,end=input.selectionEnd??input.value.length;input.value=input.value.slice(0,start)+e.target.textContent+input.value.slice(end);input.focus();input.selectionStart=input.selectionEnd=start+e.target.textContent.length;emojiPicker.hidden=true};document.addEventListener('click',e=>{if(!e.target.closest('.message-input-wrap'))emojiPicker.hidden=true})}
  await loadConvos();
}
async function initMeeting(){
  const user=await requireUser(),socket=io(),local=qs('#localVideo'),grid=qs('#videoGrid'),roomInput=qs('#roomId'),joinBtn=qs('#joinMeeting'),muteBtn=qs('#muteBtn'),cameraBtn=qs('#cameraBtn'),screenBtn=qs('#screenBtn'),status=qs('#meetingStatus');
  const transcriptionBtn=qs('#transcriptionBtn'),languageSelect=qs('#transcriptionLanguage'),transcriptEl=qs('#liveTranscript'),supportEl=qs('#transcriptionSupport'),indicator=qs('#transcriptionIndicator'),clearTranscriptBtn=qs('#clearTranscriptBtn');
  const summaryLanguage=qs('#meetingSummaryLanguage'),summaryBtn=qs('#generateMeetingSummary'),summaryStatus=qs('#meetingSummaryStatus'),summaryResult=qs('#meetingSummaryResult'),loadTranscriptBtn=qs('#loadSavedTranscript'),deleteTranscriptBtn=qs('#deleteSavedTranscript');
  const params=new URLSearchParams(location.search),conversationId=Number(params.get('conversation'))||null,callMode=params.get('mode')==='audio'?'audio':'video',modeBadge=qs('#callModeBadge'),screenStatus=qs('#screenShareStatus');if(params.get('room'))roomInput.value=params.get('room');if(modeBadge)modeBadge.textContent=callMode==='audio'?'Audio call':'Video call';if(callMode==='audio'){cameraBtn.disabled=true;cameraBtn.textContent='Camera unavailable';local.closest('.video-wrap')?.classList.add('audio-only')}if(!navigator.mediaDevices?.getDisplayMedia){screenBtn.disabled=true;if(screenStatus)screenStatus.textContent='Screen sharing is not supported by this browser/device.'}
  let stream=null,screenStream=null,room='',config={iceServers:[{urls:'stun:stun.l.google.com:19302'}]},recognition=null,transcribing=false,manualStop=false;const peers=new Map();
  try{config=await api('/api/webrtc/config')}catch(e){console.warn('ICE config fallback',e)}
  async function ensureMedia(){
    if(stream)return stream;
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera/microphone requires HTTPS and a supported browser.');
    const wanted={video:callMode==='video',audio:true};
    try{stream=await navigator.mediaDevices.getUserMedia(wanted)}
    catch(e){
      if(e.name==='NotFoundError'||e.name==='DevicesNotFoundError'){
        // A meeting may still be joined from a device with no camera/microphone.
        stream=new MediaStream();
        status.textContent='No camera/microphone found. Joined in receive-only mode; screen sharing can still be used.';
      }else throw e;
    }
    local.srcObject=stream;
    return stream
  }
  function remoteBox(id){let box=qs(`[data-peer="${id}"]`);if(!box){box=document.createElement('div');box.className='video-wrap';box.dataset.peer=id;box.innerHTML='<video autoplay playsinline></video><span>Participant</span>';grid.appendChild(box)}return box}
  function removePeer(id){const pc=peers.get(id);if(pc){pc.close();peers.delete(id)}qs(`[data-peer="${id}"]`)?.remove()}
  function createPeer(id){if(peers.has(id))return peers.get(id);const pc=new RTCPeerConnection(config);peers.set(id,pc);if(stream)stream.getTracks().forEach(t=>pc.addTrack(t,stream));pc.ontrack=e=>{remoteBox(id).querySelector('video').srcObject=e.streams[0]};pc.onicecandidate=e=>{if(e.candidate)socket.emit('webrtc-ice',{target:id,candidate:e.candidate})};pc.onconnectionstatechange=()=>{if(['failed','closed','disconnected'].includes(pc.connectionState)){if(pc.connectionState!=='disconnected')removePeer(id)}};return pc}
  async function callPeer(id){const pc=createPeer(id);const offer=await pc.createOffer();await pc.setLocalDescription(offer);socket.emit('webrtc-offer',{room,target:id,offer})}
  joinBtn.onclick=async()=>{try{
    room=roomInput.value.trim()||'connect-demo';
    await ensureMedia();
    socket.emit('join-meeting',{room,conversationId});
    if(stream?.getTracks().length)status.textContent='Joined room: '+room;
    joinBtn.disabled=true;
    await loadSavedTranscript()
  }catch(e){status.textContent=e.name==='NotAllowedError'?'Camera/microphone permission was denied. You can allow it and try again.':e.message}};
  socket.on('meeting-peers',async d=>{for(const p of d.peers||[])await callPeer(p)});socket.on('peer-joined',d=>{status.textContent=`${d.username} joined the meeting`});socket.on('peer-left',d=>removePeer(d.socketId));
  socket.on('webrtc-offer',async d=>{if(!stream)await ensureMedia();const pc=createPeer(d.from);await pc.setRemoteDescription(d.offer);const answer=await pc.createAnswer();await pc.setLocalDescription(answer);socket.emit('webrtc-answer',{target:d.from,answer});status.textContent=`Connected with ${d.username}`});socket.on('webrtc-answer',async d=>{const pc=peers.get(d.from);if(pc)await pc.setRemoteDescription(d.answer)});socket.on('webrtc-ice',async d=>{try{const pc=peers.get(d.from)||createPeer(d.from);await pc.addIceCandidate(d.candidate)}catch(e){console.warn(e)}});
  muteBtn.onclick=async()=>{try{await ensureMedia();const t=stream.getAudioTracks()[0];if(!t)return;t.enabled=!t.enabled;muteBtn.textContent=t.enabled?'Mute':'Unmute'}catch(e){status.textContent=e.message}};cameraBtn.onclick=async()=>{try{await ensureMedia();const t=stream.getVideoTracks()[0];if(!t)return;t.enabled=!t.enabled;cameraBtn.textContent=t.enabled?'Camera off':'Camera on'}catch(e){status.textContent=e.message}};async function stopScreenShare(){
    const cam=stream?.getVideoTracks()[0]||null;
    for(const pc of peers.values()){
      const sender=pc.getSenders().find(s=>s.track?.kind==='video');
      if(sender)await sender.replaceTrack(cam); // null cleanly stops outgoing screen video when there is no camera
    }
    local.srcObject=cam?stream:null;
    if(screenStream){screenStream.getTracks().forEach(t=>t.stop());screenStream=null}
    screenBtn.textContent='Share screen';
    if(screenStatus)screenStatus.textContent=cam?'Screen sharing stopped. Camera restored.':'Screen sharing stopped.'
  }
  screenBtn.onclick=async()=>{
    if(screenStream)return stopScreenShare();
    try{
      if(!window.isSecureContext)throw new Error('Screen sharing requires HTTPS (or localhost) in this browser.');
      if(!navigator.mediaDevices?.getDisplayMedia)throw new Error('Screen sharing is not supported on this browser/device.');
      // Screen capture is intentionally independent of camera/microphone.
      screenStream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});
      const track=screenStream.getVideoTracks()[0];
      if(!track)throw new Error('No screen was selected.');
      for(const pc of peers.values()){
        let sender=pc.getSenders().find(s=>s.track?.kind==='video');
        if(sender)await sender.replaceTrack(track);else pc.addTrack(track,screenStream)
      }
      local.srcObject=screenStream;
      screenBtn.textContent='Stop sharing';
      if(screenStatus)screenStatus.textContent='You are sharing your screen.';
      track.onended=()=>stopScreenShare()
    }catch(e){
      if(screenStream){screenStream.getTracks().forEach(t=>t.stop());screenStream=null}
      if(screenStatus)screenStatus.textContent=e.name==='NotAllowedError'?'Screen sharing was cancelled or not allowed.':e.message
    }
  };
  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SpeechRecognition){supportEl.textContent='Live speech recognition is not supported by this browser. Try a current Chromium-based browser. Audio/video calling still works.';transcriptionBtn.disabled=true;languageSelect.disabled=true}
  else supportEl.textContent='Transcription is optional. Start it only with the knowledge of the people in your meeting.';
  function setIndicator(active,label){indicator.textContent=label||(active?'On':'Off');indicator.classList.toggle('status-active',active)}
  function addTranscript(d){const placeholder=transcriptEl.querySelector('.muted');if(placeholder)transcriptEl.innerHTML='';const line=document.createElement('div');line.className='transcript-line'+(d.final===false?' interim':'');line.innerHTML=`<b>${escapeHtml(d.speaker||d.speaker_name||'Participant')}</b><span>${escapeHtml(d.text)}</span><small>${escapeHtml(d.language||'')}</small>`;if(d.final===false){const prior=transcriptEl.querySelector(`[data-interim="${d.speakerId||'local'}"]`);if(prior)prior.remove();line.dataset.interim=d.speakerId||'local'}else{transcriptEl.querySelector(`[data-interim="${d.speakerId||'local'}"]`)?.remove()}transcriptEl.appendChild(line);transcriptEl.scrollTop=transcriptEl.scrollHeight}
  async function loadSavedTranscript(){if(!room)return;try{const j=await api(`/api/meetings/${encodeURIComponent(room)}/transcript`);transcriptEl.innerHTML=j.transcript.length?'':'<p class="muted">No saved transcript yet.</p>';j.transcript.forEach(x=>addTranscript({...x,final:true,speaker:x.speaker_name}));supportEl.textContent=j.transcript.length?`${j.transcript.length} saved transcript line(s) loaded.`:supportEl.textContent}catch(e){supportEl.textContent=e.message}}
  function stopTranscription(announce=true){manualStop=true;transcribing=false;if(recognition){try{recognition.stop()}catch{}}transcriptionBtn.textContent='Start transcription';setIndicator(false);if(announce&&room)socket.emit('meeting-transcription-status',{room,active:false,language:languageSelect.value})}
  function startTranscription(){if(!SpeechRecognition)return;if(!room){alert('Join the meeting room first.');return}manualStop=false;recognition=new SpeechRecognition();recognition.lang=languageSelect.value;recognition.continuous=true;recognition.interimResults=true;recognition.maxAlternatives=1;recognition.onresult=e=>{for(let i=e.resultIndex;i<e.results.length;i++){const text=e.results[i][0]?.transcript?.trim();if(!text)continue;socket.emit('meeting-transcript',{room,text,final:e.results[i].isFinal,language:recognition.lang,conversationId})}};recognition.onerror=e=>{supportEl.textContent=`Transcription error: ${e.error}. You can restart transcription.`};recognition.onend=()=>{if(transcribing&&!manualStop){try{recognition.start()}catch{}}};try{recognition.start();transcribing=true;transcriptionBtn.textContent='Stop transcription';setIndicator(true,'On • '+languageSelect.options[languageSelect.selectedIndex].text);socket.emit('meeting-transcription-status',{room,active:true,language:recognition.lang})}catch(e){supportEl.textContent='Could not start transcription: '+e.message}}
  transcriptionBtn.onclick=()=>transcribing?stopTranscription():startTranscription();languageSelect.onchange=()=>{if(transcribing){stopTranscription(false);setTimeout(startTranscription,250)}};clearTranscriptBtn.onclick=()=>{transcriptEl.innerHTML='<p class="muted">Transcript cleared on this device. Saved transcript remains available.</p>'};
  socket.on('meeting-transcript',addTranscript);socket.on('meeting-transcription-status',d=>{if(!transcribing)setIndicator(!!d.active,d.active?`On • ${d.username}`:'Off');supportEl.textContent=d.active?`${d.username} enabled live transcription (${d.language||'selected language'}).`: `${d.username} stopped live transcription.`});
  function arr(items){return items?.length?`<ul>${items.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul>`:'<p class="muted">None detected.</p>'}
  function showMeetingSummary(s){summaryResult.innerHTML=`<div class="chips"><span class="chip">Room ${escapeHtml(s.room_id||room)}</span><span class="chip">${escapeHtml((s.language||'en').toUpperCase())}</span></div><h3>Summary</h3><div class="summary-box">${escapeHtml(s.summary||'')}</div><h3>Key points</h3>${arr(s.key_points)}<h3>Decisions</h3>${arr(s.decisions)}<h3>Action items</h3>${arr(s.action_items)}<h3>Suggestions</h3>${arr(s.suggestions)}<div class="row"><a class="button-link" href="/summary">View summary history</a></div>`}
  summaryBtn.onclick=async()=>{if(!room){alert('Join a meeting room first.');return}summaryBtn.disabled=true;summaryStatus.textContent='Generating a concise meeting summary…';try{const j=await api(`/api/meetings/${encodeURIComponent(room)}/summary`,{method:'POST',body:JSON.stringify({language:summaryLanguage.value})});showMeetingSummary(j.summary);summaryStatus.textContent='Summary generated and saved.'}catch(e){summaryStatus.textContent=e.message}finally{summaryBtn.disabled=false}};
  loadTranscriptBtn.onclick=()=>room?loadSavedTranscript():alert('Join a meeting room first.');deleteTranscriptBtn.onclick=async()=>{if(!room)return alert('Join a meeting room first.');if(!confirm('Delete the saved transcript for this meeting? Existing summaries will remain saved.'))return;try{await api(`/api/meetings/${encodeURIComponent(room)}/transcript`,{method:'DELETE'});transcriptEl.innerHTML='<p class="muted">Saved transcript deleted.</p>';summaryStatus.textContent='Saved transcript deleted.'}catch(e){summaryStatus.textContent=e.message}};
  window.addEventListener('beforeunload',()=>{if(transcribing)stopTranscription();if(room)socket.emit('leave-meeting',room)});
}
async function initHistory(){
  await requireUser();
  const list=qs('#historyList'),j=await api('/api/conversations');
  if(!j.conversations.length){list.innerHTML='<p class="muted">No conversation history yet.</p>';return}
  list.innerHTML=j.conversations.map(c=>{
    const label=c.type==='group'?(c.title||'Group conversation'):(c.others?.[0]?.username||'Conversation');
    return `<div class="list-item"><div><b>${escapeHtml(label)}</b><div class="muted">${escapeHtml(c.lastMessage?.body||'No messages yet')}</div></div><a class="btn" href="/chat?id=${c.id}">Open chat</a></div>`;
  }).join('');
}

async function initSummary(){await requireUser();const list=qs('#summaryList');const last=localStorage.getItem('lastSummary');const [chatJ,meetingJ]=await Promise.all([api('/api/summaries'),api('/api/meeting-summaries')]);const chats=chatJ.summaries||[],meetings=meetingJ.summaries||[];if(last){try{const s=JSON.parse(last);if(!chats.some(x=>x.id===s.id))chats.unshift(s)}catch{}}function arr(a){if(typeof a==='string'){try{a=JSON.parse(a)}catch{a=[a]}}return a?.length?`<ul>${a.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul>`:'<p class="muted">None detected.</p>'}const chatHtml=chats.map(s=>`<div class="card"><div class="chips"><span class="chip">Chat summary</span><span class="chip">Conversation #${s.conversation_id}</span><span class="chip">${new Date(s.created_at).toLocaleString()}</span></div><h3>Summary</h3><div class="summary-box">${escapeHtml(s.summary)}</div><h3>Decisions</h3>${arr(s.decisions)}<h3>Action items</h3>${arr(s.action_items)}<h3>Suggestions</h3>${arr(s.suggestions)}</div>`).join('');const meetingHtml=meetings.map(s=>`<div class="card" data-meeting-summary-card="${s.id}"><div class="chips"><span class="chip">Meeting summary</span><span class="chip">Room ${escapeHtml(s.room_id||'')}</span><span class="chip">${escapeHtml((s.language||'en').toUpperCase())}</span><span class="chip">${new Date(s.created_at).toLocaleString()}</span></div><h3>Summary</h3><div class="summary-box">${escapeHtml(s.summary)}</div><h3>Key points</h3>${arr(s.key_points)}<h3>Decisions</h3>${arr(s.decisions)}<h3>Action items</h3>${arr(s.action_items)}<h3>Suggestions</h3>${arr(s.suggestions)}<button class="danger" data-delete-meeting-summary="${s.id}">Delete summary</button></div>`).join('');list.innerHTML=(meetingHtml+chatHtml)||'<p class="muted">Generate a chat or meeting summary to see it here.</p>';qsa('[data-delete-meeting-summary]').forEach(b=>b.onclick=async()=>{if(!confirm('Delete this saved meeting summary?'))return;try{await api(`/api/meeting-summaries/${b.dataset.deleteMeetingSummary}`,{method:'DELETE'});b.closest('[data-meeting-summary-card]')?.remove()}catch(e){alert(e.message)}})}
async function initNotifications(){await requireUser();const list=qs('#notificationList'),j=await api('/api/notifications');list.innerHTML=j.notifications.length?j.notifications.map(n=>`<div class="list-item"><div><b>${escapeHtml(n.type.replaceAll('_',' '))}</b><div class="muted">${escapeHtml(n.payload?.fromUsername||n.payload?.byUsername||n.payload?.preview||'Account activity')}</div></div><span class="chip">${n.is_read?'Read':'New'}</span></div>`).join(''):'<p class="muted">No notifications yet.</p>';await api('/api/notifications/read',{method:'POST'});}
async function initSettings(){const u=await requireUser();qs('#accountEmail').textContent=u.email;qs('#accountUsername').textContent=u.username;const t=qs('#notificationSoundToggle');if(t){t.checked=localStorage.getItem('connectNotificationSound')!=='off';t.onchange=()=>{localStorage.setItem('connectNotificationSound',t.checked?'on':'off');qs('#notificationSoundStatus').textContent=t.checked?'Alert sounds are on.':'Alert sounds are off.'};qs('#notificationSoundStatus').textContent=t.checked?'Alert sounds are on.':'Alert sounds are off.';}}
function initAdmin(){
  const login=qs('#adminLogin'),panel=qs('#adminPanel'),msg=qs('#adminMsg');
  login.onsubmit=async e=>{e.preventDefault();try{await api('/api/admin/login',{method:'POST',body:JSON.stringify({email:login.email.value,password:login.password.value})});login.hidden=true;panel.hidden=false;loadAdmin()}catch(err){flash(msg,err.message,'error')}};
  async function setUserStatus(id,status){
    const label=status==='active'?'restore':status==='suspended'?'suspend':'delete';if(!confirm(`Are you sure you want to ${label} user #${id}?`))return;
    try{if(status==='deleted')await api(`/api/admin/users/${id}`,{method:'DELETE'});else await api(`/api/admin/users/${id}/status`,{method:'PATCH',body:JSON.stringify({status})});await loadAdmin()}catch(e){alert(e.message)}
  }
  async function setReport(id,status){try{await api(`/api/admin/reports/${id}`,{method:'PATCH',body:JSON.stringify({status})});await loadAdmin()}catch(e){alert(e.message)}}
  async function loadAdmin(){
    try{
      const [s,u,r]=await Promise.all([api('/api/admin/stats'),api('/api/admin/users'),api('/api/admin/reports')]);
      qs('#adminStats').innerHTML=Object.entries(s.stats).map(([k,v])=>`<div class="card stat"><span class="muted">${escapeHtml(k.replace(/([A-Z])/g,' $1'))}</span><strong>${v}</strong></div>`).join('');
      qs('#adminUsers').innerHTML=u.users.map(x=>`<tr><td><img class="avatar" src="${avatar(x)}" alt="${escapeHtml(x.username)}"></td><td>${x.id}</td><td><b>${escapeHtml(x.username)}</b><div class="muted">${escapeHtml(x.bio||'')}</div></td><td>${escapeHtml(x.email)}</td><td><span class="chip status-${escapeHtml(x.status)}">${escapeHtml(x.status)}</span></td><td>${new Date(x.created_at).toLocaleDateString()}</td><td><div class="admin-actions">${x.status!=='suspended'&&x.status!=='deleted'?`<button data-suspend="${x.id}">Suspend</button>`:''}${x.status==='suspended'?`<button class="primary" data-restore="${x.id}">Unblock / Restore</button>`:''}${x.status!=='deleted'?`<button class="danger" data-delete="${x.id}">Delete</button>`:'<span class="muted">Deleted</span>'}</div></td></tr>`).join('');
      qsa('[data-suspend]').forEach(b=>b.onclick=()=>setUserStatus(Number(b.dataset.suspend),'suspended'));qsa('[data-restore]').forEach(b=>b.onclick=()=>setUserStatus(Number(b.dataset.restore),'active'));qsa('[data-delete]').forEach(b=>b.onclick=()=>setUserStatus(Number(b.dataset.delete),'deleted'));
      const reports=qs('#adminReports');reports.innerHTML=r.reports.length?r.reports.map(x=>{const reporter=x.reporter?.username||x.reporter_username||`User #${x.reporter_id}`;const reported=x.reported?.username||x.reported_username||`User #${x.reported_user_id}`;const reportedAvatar=x.reported?.avatar_url||x.reported_avatar;return `<div class="report-card"><div class="row between"><div class="row"><img class="avatar" src="${reportedAvatar||avatar({username:reported})}"><div><b>${escapeHtml(reported)}</b><div class="muted">Reported by ${escapeHtml(reporter)} · ${new Date(x.created_at).toLocaleString()}</div></div></div><span class="chip status-${escapeHtml(x.status)}">${escapeHtml(x.status)}</span></div><div style="margin-top:10px"><b>Reason:</b> ${escapeHtml(x.reason||'other')}</div>${x.description?`<div class="muted" style="margin-top:6px">${escapeHtml(x.description)}</div>`:''}<div class="row moderation-actions" style="margin-top:12px"><button data-report-status="${x.id}" data-status="reviewed">Mark reviewed</button><button class="primary" data-report-status="${x.id}" data-status="resolved">Resolve</button><button data-report-status="${x.id}" data-status="dismissed">Dismiss</button><button class="danger" data-report-suspend="${x.reported_user_id}">Suspend user</button></div></div>`}).join(''):'<p class="muted">No reports have been submitted.</p>';
      qsa('[data-report-status]').forEach(b=>b.onclick=()=>setReport(Number(b.dataset.reportStatus),b.dataset.status));qsa('[data-report-suspend]').forEach(b=>b.onclick=()=>setUserStatus(Number(b.dataset.reportSuspend),'suspended'));
    }catch(e){console.error(e);panel.hidden=true;login.hidden=false;flash(msg,'Admin session expired or moderation data could not be loaded.','error')}
  }
  qs('#adminLogout').onclick=async()=>{await api('/api/admin/logout',{method:'POST'});location.reload()};
}