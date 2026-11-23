package app.ii.phone.update;

import org.json.*;
import java.io.*;
import java.net.*;
import java.util.*;
import java.util.regex.*;

/** Public release discovery; trust is established only by ResourcePackage's APK-key signature. */
public final class GitHubUpdates {
 public static final String REPO="jinyixuan9-tech/Tutuma-float-phone";
 public static final String API="https://api.github.com/repos/"+REPO+"/releases?per_page=30";
 private static final Set<String> HOSTS=new HashSet<>(Arrays.asList("api.github.com","github.com","release-assets.githubusercontent.com","objects.githubusercontent.com","github-releases.githubusercontent.com"));
 public interface Progress {void update(long received,long total);}
 public interface Source {InputStream open(String url) throws Exception;}
 private GitHubUpdates(){}
 public static long parseAssetId(Object value) throws IOException {
  try {
   if(value instanceof Integer || value instanceof Long){long id=((Number)value).longValue();if(id>0)return id;}
   else if(value instanceof String && ((String)value).matches("[1-9][0-9]{0,18}")){long id=Long.parseLong((String)value);if(id>0)return id;}
   else if(value instanceof Double || value instanceof Float){double id=((Number)value).doubleValue();if(Double.isFinite(id)&&id>0&&id==Math.rint(id)&&id<=9007199254740991d)return (long)id;}
  }catch(NumberFormatException ignored){}
  throw new IOException("更新附件编号无效，请重新检查更新");
 }
 public static void validateUrl(String raw) throws IOException {
  try {URI u=new URI(raw);if(!"https".equals(u.getScheme())||u.getUserInfo()!=null||(u.getPort()!=-1&&u.getPort()!=443)||!HOSTS.contains(u.getHost()))throw new IOException("更新下载地址不受支持");}catch(URISyntaxException e){throw new IOException("更新地址无效",e);}
 }
 public static InputStream open(String raw) throws IOException {
  String current=raw;
  for(int redirects=0;redirects<=5;redirects++) {
   validateUrl(current);final HttpURLConnection c=(HttpURLConnection)new URL(current).openConnection();c.setInstanceFollowRedirects(false);c.setConnectTimeout(15000);c.setReadTimeout(20000);c.setRequestProperty("User-Agent","RabbitFloat-Updater/1.0.5");c.setRequestProperty("Accept",current.startsWith("https://api.github.com/")?"application/vnd.github+json":"application/octet-stream");
   try {int status=c.getResponseCode();if(status>=300&&status<400){String location=c.getHeaderField("Location");if(location==null)throw new IOException("下载重定向缺少地址");current=new URL(new URL(current),location).toString();c.disconnect();continue;}
    if(status!=200){throw new IOException(status==403||status==429?"GitHub 暂时限制请求，请稍后再试":status==404?"更新发布地址不存在或未公开":"更新服务器返回 HTTP "+status);}
    return new FilterInputStream(c.getInputStream()){@Override public void close()throws IOException{try{super.close();}finally{c.disconnect();}}};
   }catch(IOException e){c.disconnect();throw e;}
  }throw new IOException("更新地址重定向次数过多");
 }
 public static JSONObject select(JSONArray releases,int build,long highest) throws Exception {
  JSONObject chosen=null;long best=highest;boolean hasOtherBuild=false;
  Pattern name=Pattern.compile("rabbit-float-build(\\d+)-resource-(\\d+)(?:-[A-Za-z0-9_-]+)?\\.zip");
  for(int i=0;i<releases.length();i++){
   JSONObject release=releases.getJSONObject(i);if(release.optBoolean("draft")||release.optBoolean("prerelease"))continue;
   JSONArray assets=release.optJSONArray("assets");if(assets==null)continue;
   for(int j=0;j<assets.length();j++){
    JSONObject asset=assets.getJSONObject(j);String filename=asset.optString("name");Matcher m=name.matcher(filename);if(!m.matches())continue;
    long nativeBuild,sequence;try{nativeBuild=Long.parseLong(m.group(1));sequence=Long.parseLong(m.group(2));}catch(NumberFormatException ignored){continue;}
    if(nativeBuild!=build){hasOtherBuild=true;continue;}if(sequence<=best||sequence<1)continue;
    long size=asset.optLong("size",-1);if(size<=0||size>ResourcePackage.MAX_TOTAL)continue;
    String url=asset.optString("browser_download_url");validateUrl(url);URI parsed=new URI(url);
    if(!"github.com".equals(parsed.getHost())||!parsed.getPath().startsWith("/"+REPO+"/releases/download/")||!parsed.getPath().endsWith("/"+filename)||parsed.getQuery()!=null)continue;
    long id=asset.optLong("id",0);if(id<=0)continue;
    chosen=new JSONObject().put("assetId",Long.toString(id)).put("sequence",sequence).put("nativeBuild",build).put("fileName",filename).put("size",size).put("url",url).put("label",release.optString("name",release.optString("tag_name"))).put("notes",release.optString("body",""));best=sequence;
   }
  }
  return new JSONObject().put("available",chosen!=null).put("candidate",chosen==null?JSONObject.NULL:chosen).put("otherBuilds",hasOtherBuild);
 }
 public static JSONObject check(Source source,int build,long highest)throws Exception{
  byte[] raw=ResourcePackage.readLimited(source.open(API),4*1024*1024);return select(new JSONArray(new String(raw,java.nio.charset.StandardCharsets.UTF_8)),build,highest);
 }
 public static void download(Source source,JSONObject candidate,File destination,Progress progress)throws Exception{
  validateUrl(candidate.getString("url"));long expected=candidate.getLong("size"),received=0,last=0;long start=System.nanoTime();
  try(InputStream in=source.open(candidate.getString("url"));FileOutputStream out=new FileOutputStream(destination)){
   byte[] b=new byte[32768];int n;while((n=in.read(b))!=-1){if(Thread.currentThread().isInterrupted())throw new IOException("更新下载已中断");received+=n;if(received>expected||received>ResourcePackage.MAX_TOTAL)throw new IOException("更新包大小不匹配");if((System.nanoTime()-start)/1000000000L>300)throw new IOException("更新下载超时，请重试或使用手动导入");out.write(b,0,n);long now=System.nanoTime();if(now-last>250000000L){progress.update(received,expected);last=now;}}
   if(received!=expected)throw new IOException("更新包下载不完整，请重新下载");out.getFD().sync();progress.update(received,expected);
  }
 }
}
