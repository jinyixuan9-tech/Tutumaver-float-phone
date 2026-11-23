package app.ii.phone;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.ServerPath;
import app.ii.phone.update.ResourceStore;
import app.ii.phone.update.ResourcePackage;
import java.io.*;
import java.security.cert.CertificateFactory;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
 private ResourceStore resources;
 private final Handler updateWatchdog=new Handler(Looper.getMainLooper());
 public ResourceStore getResourceStore(){if(resources==null)throw new IllegalStateException("资源更新入口初始化失败，请使用内置版本");return resources;}
 @Override public void onCreate(Bundle state) {
  registerPlugin(FloatUpdatesPlugin.class);
  registerPlugin(FloatGalleryPlugin.class);
  registerPlugin(FloatCallAudioPlugin.class);
  // Do not let the generic WebView plugin restore a stale path after a native update.
  getSharedPreferences("CapWebViewSettings",MODE_PRIVATE).edit().remove("serverBasePath").apply();
  try {
   android.content.pm.PackageInfo info=getPackageManager().getPackageInfo(getPackageName(),android.content.pm.PackageManager.GET_SIGNATURES);
   JSONObject baseline=new JSONObject(new String(ResourcePackage.readLimited(getAssets().open("float-bundle.json"),1024*1024),java.nio.charset.StandardCharsets.UTF_8));
   java.security.PublicKey key=CertificateFactory.getInstance("X.509").generateCertificate(new ByteArrayInputStream(info.signatures[0].toByteArray())).getPublicKey();
   resources=new ResourceStore(new File(getFilesDir(),"float-resource-updates"),info.versionCode,getPackageName(),baseline.getString("digest"),relative->getAssets().open("public/"+relative),key);
   resources.prepareStartup();String path=resources.activePath();
   bridgeBuilder.setServerPath(new ServerPath(path==null?ServerPath.PathType.ASSET_PATH:ServerPath.PathType.BASE_PATH,path==null?"public":path));
  } catch(Exception error) { android.util.Log.e("FloatUpdates","Using bundled resources",error);bridgeBuilder.setServerPath(new ServerPath(ServerPath.PathType.ASSET_PATH,"public")); }
  super.onCreate(state);
  WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
  WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
  controller.hide(WindowInsetsCompat.Type.statusBars());
  controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
 }
 public void applyResource(){
  try {
   String path=getResourceStore().activePath();if(path==null)bridge.setServerAssetPath("public");else bridge.setServerBasePath(path);
   updateWatchdog.removeCallbacksAndMessages(null);
   JSONObject state=resources.getState();if(!state.optBoolean("pending"))return;
   String candidate=state.getJSONObject("active").getString("resourceId");
   updateWatchdog.postDelayed(()->{try{if(resources.rollbackIfPending(candidate))applyResource();}catch(Exception error){android.util.Log.e("FloatUpdates","Rollback failed",error);}},90000);
  }catch(Exception error){android.util.Log.e("FloatUpdates","Resource activation failed",error);try{resources.rollback();String fallback=resources.activePath();if(fallback==null)bridge.setServerAssetPath("public");else bridge.setServerBasePath(fallback);}catch(Exception ignored){}}
 }
 @Override public void onDestroy(){updateWatchdog.removeCallbacksAndMessages(null);super.onDestroy();}
}
