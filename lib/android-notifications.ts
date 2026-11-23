import {LocalNotifications} from '@capacitor/local-notifications';
import {isAndroidApp} from './android-runtime';
export {isAndroidApp};
let granted=false;
export const nativeNotificationGranted=()=>granted;
export async function refreshNativeNotificationPermission(){if(!isAndroidApp())return false;granted=(await LocalNotifications.checkPermissions()).display==='granted';return granted;}
export async function requestNativeNotifications(){granted=(await LocalNotifications.requestPermissions()).display==='granted';if(granted)await LocalNotifications.createChannel({id:'chat-messages',name:'聊天消息',importance:4,visibility:0});return granted;}
export async function showNativeMessage(title:string,body?:string,url?:string){if(!await refreshNativeNotificationPermission())return;await LocalNotifications.schedule({notifications:[{id:Math.floor(Math.random()*2000000000),title,body:body||'收到新消息',channelId:'chat-messages',extra:{url}}]});}
export function initializeNativeNotifications(){if(!isAndroidApp())return;void refreshNativeNotificationPermission();void LocalNotifications.addListener('localNotificationActionPerformed',e=>{const url=e.notification.extra?.url;if(typeof url==='string'&&url.startsWith('/#lysn='))location.hash=url.slice(1);else if(typeof url==='string')window.dispatchEvent(new CustomEvent('rabbit-notification-open',{detail:url}));else window.dispatchEvent(new CustomEvent('open-app',{detail:{appId:'chat'}}));});}
