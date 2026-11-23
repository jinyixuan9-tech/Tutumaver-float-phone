import app.ii.phone.update.*;
import org.json.*;import java.io.*;import java.nio.file.*;
public class GitHubUpdatesTest {
 static JSONObject asset(int build,int sequence,long id){return new JSONObject().put("id",id).put("size",3).put("name","rabbit-float-build"+build+"-resource-"+sequence+".zip").put("browser_download_url","https://github.com/"+GitHubUpdates.REPO+"/releases/download/resource-"+sequence+"/rabbit-float-build"+build+"-resource-"+sequence+".zip");}
 static JSONObject release(JSONObject...assets){return new JSONObject().put("name","test release").put("assets",new JSONArray(assets));}
 static void check(boolean ok,String why){if(!ok)throw new AssertionError(why);}
 interface Action{void run()throws Exception;}
 static void reject(Action action)throws Exception{try{action.run();throw new AssertionError("must reject");}catch(IOException expected){}}
 public static void main(String[]args)throws Exception{
  JSONArray list=new JSONArray().put(release(asset(5,100,1))).put(release(asset(6,2,2))).put(release(asset(6,3,3)).put("draft",true)).put(release(asset(6,4,4)).put("prerelease",true));
  JSONObject found=GitHubUpdates.select(list,6,0);check(found.getJSONObject("candidate").getLong("sequence")==2,"matching native build, excluding drafts and prereleases");
  check(!GitHubUpdates.select(list,6,2).getBoolean("available"),"same sequence or rollback highwater must not update");
  list.put(release(asset(6,7,7)));check(GitHubUpdates.select(list,6,0).getJSONObject("candidate").getLong("sequence")==7,"highest sequence, not release sort");
  JSONObject wrong=asset(6,9,9).put("browser_download_url","https://github.com/someone/else/releases/download/x/rabbit-float-build6-resource-9.zip");check(!GitHubUpdates.select(new JSONArray().put(release(wrong)),6,0).getBoolean("available"),"other repository rejected");
  check(!GitHubUpdates.select(new JSONArray().put(release(asset(6,9,9).put("size",ResourcePackage.MAX_TOTAL+1))),6,0).getBoolean("available"),"oversize rejected");
  reject(()->GitHubUpdates.validateUrl("http://github.com/file"));reject(()->GitHubUpdates.validateUrl("https://github.com.evil.test/file"));reject(()->GitHubUpdates.validateUrl("https://user:pass@github.com/file"));reject(()->GitHubUpdates.validateUrl("https://github.com:444/file"));
  GitHubUpdates.validateUrl("https://release-assets.githubusercontent.com/file");
  File temp=Files.createTempFile("update-download-test",".zip").toFile();JSONObject candidate=asset(6,2,2).put("url",asset(6,2,2).getString("browser_download_url"));long[] done={0};GitHubUpdates.download(u->new ByteArrayInputStream(new byte[]{1,2,3}),candidate,temp,(n,total)->done[0]=n);check(temp.length()==3&&done[0]==3,"streamed download and progress");
  reject(()->GitHubUpdates.download(u->new ByteArrayInputStream(new byte[]{1,2}),candidate,temp,(n,total)->{}));reject(()->GitHubUpdates.download(u->new ByteArrayInputStream(new byte[]{1,2,3,4}),candidate,temp,(n,total)->{}));
  byte[] json=list.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);check(GitHubUpdates.check(u->new ByteArrayInputStream(json),6,2).getJSONObject("candidate").getLong("sequence")==7,"API parsing uses same tested selector");temp.delete();
  System.out.println("PASS: native release discovery, build/sequence/replay filters, drafts/pre-releases, repository/HTTPS/redirect host policy, size bounds, truncated download, progress.");
 }
}
