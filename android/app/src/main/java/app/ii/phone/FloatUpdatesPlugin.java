package app.ii.phone;

import android.app.Activity;
import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import java.io.*;

@CapacitorPlugin(name="FloatUpdates")
public class FloatUpdatesPlugin extends Plugin {
    private volatile boolean busy=false;
    private app.ii.phone.update.ResourceStore store() {return ((MainActivity)getActivity()).getResourceStore();}
    @PluginMethod public void getState(PluginCall call){try{call.resolve(JSObject.fromJSONObject(store().getState()));}catch(Exception e){call.reject("无法读取更新信息："+e.getMessage());}}
    @PluginMethod public synchronized void checkOnline(PluginCall call){
        if(busy){call.reject("已有更新操作进行中");return;}busy=true;
        execute(()->{try{org.json.JSONObject state=store().getState();call.resolve(JSObject.fromJSONObject(app.ii.phone.update.GitHubUpdates.check(app.ii.phone.update.GitHubUpdates::open,state.getInt("nativeBuild"),state.optLong("highest",0))));}catch(Exception e){call.reject("检查更新失败："+e.getMessage());}finally{busy=false;}});
    }
    @PluginMethod public synchronized void downloadOnline(PluginCall call){
        if(busy){call.reject("已有更新操作进行中");return;}final long wanted;
        try{wanted=app.ii.phone.update.GitHubUpdates.parseAssetId(call.getData().opt("assetId"));}catch(Exception e){call.reject(e.getMessage());return;}busy=true;
        execute(()->{File temp=null;try{
            org.json.JSONObject state=store().getState();org.json.JSONObject found=app.ii.phone.update.GitHubUpdates.check(app.ii.phone.update.GitHubUpdates::open,state.getInt("nativeBuild"),state.optLong("highest",0));
            if(!found.getBoolean("available")||found.getJSONObject("candidate").getLong("assetId")!=wanted)throw new IOException("发布版本已变化，请重新检查更新");
            org.json.JSONObject candidate=found.getJSONObject("candidate");temp=File.createTempFile("float-online-update-",".zip",getContext().getCacheDir());
            app.ii.phone.update.GitHubUpdates.download(app.ii.phone.update.GitHubUpdates::open,candidate,temp,(received,total)->notifyListeners("downloadProgress",new JSObject().put("received",received).put("total",total)));
            org.json.JSONObject next=store().stage(temp,candidate.getLong("sequence"));
            call.resolve(JSObject.fromJSONObject(next));
        }catch(Exception e){call.reject("下载更新失败："+e.getMessage());}finally{if(temp!=null)temp.delete();busy=false;}});
    }
    @PluginMethod public synchronized void choosePackage(PluginCall call){
        if(busy){call.reject("已有更新操作进行中");return;}busy=true;
        Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("*/*");
        try {startActivityForResult(call,intent,"packageChosen");}catch(Exception error){busy=false;call.reject("无法打开文件选择器");}
    }
    @ActivityCallback private void packageChosen(PluginCall call,ActivityResult result){
        if(call==null){busy=false;return;}
        if(result.getResultCode()!=Activity.RESULT_OK||result.getData()==null||result.getData().getData()==null){busy=false;call.resolve(new JSObject().put("cancelled",true));return;}
        final android.net.Uri uri=result.getData().getData();
        execute(()->{File temp=null;try{
            temp=File.createTempFile("float-update-",".zip",getContext().getCacheDir());long size=0;
            try(InputStream in=getContext().getContentResolver().openInputStream(uri);FileOutputStream out=new FileOutputStream(temp)){
                if(in==null)throw new IOException("无法读取文件");byte[] b=new byte[32768];int n;while((n=in.read(b))!=-1){size+=n;if(size>app.ii.phone.update.ResourcePackage.MAX_TOTAL)throw new IOException("更新包过大");out.write(b,0,n);}
            }
            call.resolve(JSObject.fromJSONObject(store().stage(temp)));
        }catch(Exception e){call.reject("导入失败："+e.getMessage());}finally{if(temp!=null)temp.delete();busy=false;}});
    }
    @PluginMethod public void activate(PluginCall call){try{store().activate(call.getString("resourceId",""));call.resolve();getActivity().runOnUiThread(()->((MainActivity)getActivity()).applyResource());}catch(Exception e){call.reject("应用更新失败："+e.getMessage());}}
    @PluginMethod public void markReady(PluginCall call){try{store().markReady(call.getString("resourceId",""));call.resolve();}catch(Exception e){call.reject("无法确认资源启动："+e.getMessage());}}
    @PluginMethod public void rollback(PluginCall call){try{store().rollback();call.resolve();getActivity().runOnUiThread(()->((MainActivity)getActivity()).applyResource());}catch(Exception e){call.reject("恢复失败："+e.getMessage());}}
}
