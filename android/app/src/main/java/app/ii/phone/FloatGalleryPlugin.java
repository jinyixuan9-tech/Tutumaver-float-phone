package app.ii.phone;
import android.Manifest;
import android.content.ContentValues;
import android.content.ContentResolver;
import android.content.pm.PackageManager;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import java.io.*;

@CapacitorPlugin(name="FloatGallery",permissions={@Permission(alias="legacyPhotos",strings={Manifest.permission.WRITE_EXTERNAL_STORAGE})})
public class FloatGalleryPlugin extends Plugin {
 @PluginMethod public void savePng(PluginCall call){
  if(Build.VERSION.SDK_INT<29&&getPermissionState("legacyPhotos")!=PermissionState.GRANTED){requestPermissionForAlias("legacyPhotos",call,"afterPermission");return;}
  save(call);
 }
 @PermissionCallback private void afterPermission(PluginCall call){if(getPermissionState("legacyPhotos")==PermissionState.GRANTED)save(call);else call.reject("未获得保存图片权限，图片尚未保存。");}
 private void save(PluginCall call){new Thread(()->{
  Uri inserted=null;File legacy=null;ContentResolver resolver=getContext().getContentResolver();
  try{
   String path=call.getString("path");if(path==null||!path.matches("exports/screenshot-[A-Za-z0-9.-]+\\.png"))throw new IOException("Invalid screenshot path");
   File cache=getContext().getCacheDir().getCanonicalFile(),source=new File(cache,path).getCanonicalFile();
   if(!source.getPath().startsWith(cache.getPath()+File.separator)||!source.isFile()||source.length()<8||source.length()>100*1024*1024)throw new IOException("截图文件不可读取");
   try(InputStream in=new FileInputStream(source)){byte[] magic=new byte[8];if(in.read(magic)!=8||magic[0]!=(byte)137||magic[1]!=80||magic[2]!=78||magic[3]!=71)throw new IOException("截图格式不正确");}
   String name="聊天截图-"+System.currentTimeMillis()+".png";
   if(Build.VERSION.SDK_INT>=29){
    ContentValues values=new ContentValues();values.put(MediaStore.Images.Media.DISPLAY_NAME,name);values.put(MediaStore.Images.Media.MIME_TYPE,"image/png");values.put(MediaStore.Images.Media.RELATIVE_PATH,Environment.DIRECTORY_PICTURES+"/兔版float");values.put(MediaStore.Images.Media.IS_PENDING,1);
    inserted=resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,values);if(inserted==null)throw new IOException("无法创建相册图片");
    try(InputStream in=new FileInputStream(source);OutputStream out=resolver.openOutputStream(inserted)){if(out==null)throw new IOException("无法写入相册");copy(in,out);}
    ContentValues ready=new ContentValues();ready.put(MediaStore.Images.Media.IS_PENDING,0);if(resolver.update(inserted,ready,null,null)<1)throw new IOException("相册发布失败");call.resolve(new JSObject().put("uri",inserted.toString()));
   }else{
    File folder=new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES),"兔版float");if(!folder.isDirectory()&&!folder.mkdirs())throw new IOException("无法创建图片目录");legacy=new File(folder,name);
    try(InputStream in=new FileInputStream(source);OutputStream out=new FileOutputStream(legacy)){copy(in,out);}
    MediaScannerConnection.scanFile(getContext(),new String[]{legacy.getAbsolutePath()},new String[]{"image/png"},(p,uri)->{if(uri==null)call.reject("图片已写入，但相册索引失败，请稍后查看。");else call.resolve(new JSObject().put("uri",uri.toString()));});
   }
  }catch(Exception error){if(inserted!=null)resolver.delete(inserted,null,null);if(legacy!=null)legacy.delete();call.reject("保存相册失败："+error.getMessage());}
 },"float-save-photo").start();}
 private static void copy(InputStream in,OutputStream out)throws IOException{byte[] buffer=new byte[65536];int n;while((n=in.read(buffer))!=-1)out.write(buffer,0,n);out.flush();}
}
