// Manage the player's shared game crew and invitation attention.
import {api,escapeHtml,toast} from '../core/api.js';
import {state} from '../core/runtime.js';
import {confirmAction,closeOnTrueBackdrop} from '../ui-helpers/dialogs.js';
let current=null,sequence=0,onCollectionChanged=()=>{};
function paintCrew(data) {
  current=data;
  const count=data.incoming.length, button=document.getElementById('crew-button'),badge=document.getElementById('crew-invite-count');
  button.classList.toggle('has-invites',count>0);badge.hidden=!count;badge.textContent=String(count);
  button.dataset.tooltip=count?`Crew: ${count} pending invitation${count===1?'':'s'}`:'Open your crew';
  document.getElementById('crew-members').innerHTML=data.members.map(member=>`<li><strong>${escapeHtml(member.username)}</strong>${member.id===state.user?.id?' <span class="badge">You</span>':''}</li>`).join('');
  for(const direction of ['incoming','outgoing']) {
    const section=document.getElementById('crew-'+direction);section.hidden=!data[direction].length;
    section.querySelector('ul').innerHTML=data[direction].map(invite=>`<li><span>${escapeHtml(invite.username)}</span><span class="crew-invite-actions">${direction==='incoming'?`<button type="button" class="button secondary" data-crew-accept="${invite.id}">Join crew</button>`:''}<button type="button" class="button ghost" data-crew-cancel="${invite.id}">${direction==='incoming'?'Decline':'Cancel invitation'}</button></span></li>`).join('');
  }
}
export async function refreshCrew() {
  if(!state.user || !document.getElementById('crew-button'))return;
  const userId=state.user.id,request=++sequence;
  try {const data=await api('/api/crew');if(request===sequence && state.user?.id===userId)paintCrew(data);}
  catch(error){if(document.getElementById('crew-dialog').open)showError(error.message);}
}
function showError(message) {const element=document.getElementById('crew-error');element.textContent=message;element.hidden=!message;}
export function resetCrew() {
  sequence++;current=null;
  document.getElementById('crew-button')?.classList.remove('has-invites');
  const badge=document.getElementById('crew-invite-count');if(badge)badge.hidden=true;
  for(const id of ['crew-members','crew-incoming-list','crew-outgoing-list'])document.getElementById(id)?.replaceChildren();
}
export function initializeCrew(options={}) {
  onCollectionChanged=options.onCollectionChanged||(()=>{});
  const dialog=document.getElementById('crew-dialog');
  document.getElementById('crew-button').addEventListener('click',()=>{showError('');dialog.showModal();void refreshCrew();});
  dialog.querySelectorAll('[data-crew-close]').forEach(button=>button.addEventListener('click',()=>dialog.close()));
  closeOnTrueBackdrop(dialog,()=>dialog.close());
  document.getElementById('crew-invite-form').addEventListener('submit',async event=>{
    event.preventDefault();showError('');const submit=event.currentTarget.querySelector('button');submit.disabled=true;
    try {paintCrew(await api('/api/crew/invites',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:document.getElementById('crew-username').value})}));document.getElementById('crew-username').value='';toast('Crew invitation sent.');}
    catch(error){showError(error.message);}finally{submit.disabled=false;}
  });
  dialog.addEventListener('click',async event=>{
    const button=event.target.closest('[data-crew-accept],[data-crew-cancel]');if(!button || button.disabled)return;
    const accepting=button.hasAttribute('data-crew-accept'),id=button.dataset.crewAccept||button.dataset.crewCancel;
    if(accepting) {
      const invite=current?.incoming.find(item=>String(item.id)===id);
      if(!await confirmAction({title:'Join crew?',message:`Combine your crew’s game collection with ${invite?.username||'this player'}’s crew? Everyone can edit shared game details. Only the player who added an entry can delete it. Your ratings and play status stay personal.`,confirmLabel:'Join crew',kicker:'Crew // shared shelf'}))return;
    }
    button.disabled=true;showError('');
    try {paintCrew(await api(`/api/crew/invites/${id}${accepting?'/accept':''}`,{method:accepting?'POST':'DELETE'}));if(accepting){await onCollectionChanged();toast('Your crew’s shared shelf is ready.');}}
    catch(error){showError(error.message);}finally{button.disabled=false;}
  });
}
