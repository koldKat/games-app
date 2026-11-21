// View and edit an account through the protected administrator endpoints.
import {api,button,busy,confirmAction,toast} from './core.js';
const dialog=document.getElementById('account-edit-dialog'),form=document.getElementById('account-edit-form');
let account,refresh=()=>{};
const close=()=>dialog.close();
for(const control of dialog.querySelectorAll('[data-account-edit-close]'))control.addEventListener('click',close);
let backdrop=false;dialog.addEventListener('pointerdown',event=>{backdrop=event.target===dialog;});dialog.addEventListener('pointerup',event=>{if(backdrop&&event.target===dialog)close();backdrop=false;});
export async function openAccountEditor(id,onSave){
 try {
  account=(await api('GET',`/api/admin/accounts/${id}`)).account;refresh=onSave||(()=>{});
  document.getElementById('account-edit-title').textContent=account.username;
  document.getElementById('account-edit-info').textContent=account.protected?'Protected account: locking, deletion and renaming are disabled.':'Account details and display roles';
  form.elements.username.value=account.username;form.elements.username.readOnly=account.protected;
  form.elements.email.value=account.email;
  for(const key of ['sidekick','publicProfile','hideFromActivity'])form.elements[key].checked=Boolean(account[key]);
  form.elements.sidekick.disabled=account.badges.includes('admin');
  document.getElementById('account-edit-error').hidden=true;
  const actions=document.getElementById('account-edit-actions');actions.replaceChildren();
  const act=(label,method,path,body,question,disabled=false)=>{
   const control=button(label,'',async()=>{
    if(question&&!await confirmAction(question))return;
    await busy(control,async()=>{await api(method,path,body);close();await refresh();toast('Account updated.');});
   });control.type='button';control.disabled=disabled;actions.append(control);
  };
  act('Revoke sessions','DELETE',`/api/admin/accounts/${id}/sessions`,undefined,{title:'Revoke sessions?',message:`Sign ${account.username} out on every device?`,confirmLabel:'Revoke sessions'});
  const locked=account.adminLocked||Number(account.lockedUntil)>Date.now()/1000;
  act(locked?'Unlock account':'Lock account','PATCH',`/api/admin/accounts/${id}/lock`,{locked:!locked},{title:locked?'Unlock account?':'Lock account?',message:locked?'Allow this player to sign in again?':'Sign this player out and block sign-in?',confirmLabel:locked?'Unlock':'Lock'},account.protected);
  act('Delete account','DELETE',`/api/admin/accounts/${id}`,undefined,{title:'Delete account?',message:`Permanently delete ${account.username} and their collection?`,confirmLabel:'Delete account',requiredText:account.username},account.protected);
  dialog.showModal();
 }catch(error){toast(error.message,true);}
}
form.addEventListener('submit',async event=>{
 event.preventDefault();const save=form.querySelector('[type=submit]'),error=document.getElementById('account-edit-error');error.hidden=true;
 save.disabled=true;
 try{
  const payload={username:form.elements.username.value,email:form.elements.email.value};
  for(const key of ['sidekick','publicProfile','hideFromActivity'])payload[key]=form.elements[key].checked;
  await api('PATCH',`/api/admin/accounts/${account.id}`,payload);close();await refresh();toast('Account saved.');
 }catch(failure){error.textContent=failure.message;error.hidden=false;}finally{save.disabled=false;}
});
