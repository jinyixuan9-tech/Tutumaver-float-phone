package app.ii.phone;

import android.content.Context;
import android.media.*;
import android.os.Build;
import android.util.Base64;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.*;
import java.util.*;

/** App call audio only. No microphone capture, PSTN access or phone-state permission. */
@CapacitorPlugin(name="FloatCallAudio")
public class FloatCallAudioPlugin extends Plugin {
 private AudioManager audio; private MediaPlayer player; private File clip;
 private PluginCall playing; private boolean active=false,speaker=false,oldSpeaker=false;
 private int oldMode=AudioManager.MODE_NORMAL; private String playToken="";
 private AudioManager manager(){if(audio==null)audio=(AudioManager)getContext().getSystemService(Context.AUDIO_SERVICE);return audio;}
 private void begin(){if(active)return;AudioManager a=manager();oldMode=a.getMode();oldSpeaker=a.isSpeakerphoneOn();a.setMode(AudioManager.MODE_IN_COMMUNICATION);active=true;}
 private JSObject state(){JSObject o=new JSObject();o.put("active",active);o.put("speaker",speaker);return o;}
 private void route(boolean enabled)throws IOException{
  begin();AudioManager a=manager();
  if(Build.VERSION.SDK_INT>=31){
   List<AudioDeviceInfo> devices=a.getAvailableCommunicationDevices();AudioDeviceInfo wanted=null;
   if(enabled){for(AudioDeviceInfo d:devices)if(d.getType()==AudioDeviceInfo.TYPE_BUILTIN_SPEAKER){wanted=d;break;}}
   else{
    for(AudioDeviceInfo d:devices){int t=d.getType();if(t==AudioDeviceInfo.TYPE_WIRED_HEADSET||t==AudioDeviceInfo.TYPE_USB_HEADSET||t==AudioDeviceInfo.TYPE_BLUETOOTH_SCO||t==AudioDeviceInfo.TYPE_BLE_HEADSET){wanted=d;break;}}
    if(wanted==null)for(AudioDeviceInfo d:devices)if(d.getType()==AudioDeviceInfo.TYPE_BUILTIN_EARPIECE){wanted=d;break;}
   }
   if(wanted==null)throw new IOException(enabled?"设备没有可用扬声器":"设备没有可用听筒或耳机");
   if(!a.setCommunicationDevice(wanted))throw new IOException("系统未允许切换音频输出，请检查其他通话或耳机连接");
  }else a.setSpeakerphoneOn(enabled);
  speaker=enabled;
 }
 private void stopPlayer(){
  MediaPlayer p=player;player=null;if(p!=null){try{p.stop();}catch(Exception ignored){}p.release();}
  if(clip!=null){clip.delete();clip=null;}
  PluginCall call=playing;playing=null;if(call!=null){JSObject r=new JSObject();r.put("cancelled",true);call.resolve(r);}playToken="";
 }
 private void end(){stopPlayer();if(active){AudioManager a=manager();if(Build.VERSION.SDK_INT>=31)a.clearCommunicationDevice();else a.setSpeakerphoneOn(oldSpeaker);a.setMode(oldMode);}active=false;speaker=false;}
 @PluginMethod public void start(PluginCall call){getActivity().runOnUiThread(()->{try{route(false);call.resolve(state());}catch(Exception e){end();call.reject(e.getMessage());}});}
 @PluginMethod public void setSpeaker(PluginCall call){getActivity().runOnUiThread(()->{try{route(call.getBoolean("enabled",false));call.resolve(state());}catch(Exception e){call.reject(e.getMessage());}});}
 @PluginMethod public void finish(PluginCall call){getActivity().runOnUiThread(()->{end();call.resolve();});}
 @PluginMethod public void stop(PluginCall call){getActivity().runOnUiThread(()->{String token=call.getString("token","");if(token.isEmpty()||token.equals(playToken))stopPlayer();call.resolve();});}
 @PluginMethod public void play(PluginCall call){getActivity().runOnUiThread(()->{
  try{
   String encoded=call.getString("base64","");if(encoded.length()>24*1024*1024)throw new IOException("通话音频过大");
   byte[] data=Base64.decode(encoded,Base64.DEFAULT);if(data.length==0)throw new IOException("音频为空");
   stopPlayer();if(!active)begin();clip=File.createTempFile("float-call-",".audio",getContext().getCacheDir());try(FileOutputStream f=new FileOutputStream(clip)){f.write(data);}
   MediaPlayer p=new MediaPlayer();player=p;playing=call;playToken=call.getString("token","");
   p.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
   p.setDataSource(clip.getAbsolutePath());p.setOnPreparedListener(m->{if(player==m)m.start();});
   p.setOnCompletionListener(m->{if(player!=m)return;playing=null;stopPlayer();JSObject r=new JSObject();r.put("cancelled",false);call.resolve(r);});
   p.setOnErrorListener((m,what,extra)->{if(player==m){playing=null;stopPlayer();call.reject("通话语音播放失败");}return true;});p.prepareAsync();
  }catch(Exception e){playing=null;stopPlayer();call.reject(e.getMessage());}
 });}
 @Override protected void handleOnDestroy(){end();}
}
