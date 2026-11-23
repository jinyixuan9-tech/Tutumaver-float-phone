import app.ii.phone.update.*;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.*;
import java.util.*;
import java.util.zip.*;

public class ResourceUpdateTest {
 static KeyPair key; static File tmp;static Map<String,byte[]> baseline=new HashMap<>();
 static byte[] bytes(String x){return x.getBytes(StandardCharsets.UTF_8);}
 static File pack(String name,int build,int sequence,String path,boolean tamper,boolean badHash,boolean changed) throws Exception {
  JSONObject files=new JSONObject();files.put("index.html",ResourcePackage.hex(MessageDigest.getInstance("SHA-256").digest(changed?bytes("new html"):baseline.get("index.html"))));files.put(path,badHash?"0".repeat(64):ResourcePackage.hex(MessageDigest.getInstance("SHA-256").digest(bytes("const ok=true;"))));
  JSONObject manifest=new JSONObject().put("schema",1).put("appId","app.ii.phone").put("nativeBuild",build).put("baseDigest","trusted-baseline").put("resourceId","res-"+sequence).put("sequence",sequence).put("label","更新"+sequence).put("notes","测试").put("files",files);
  byte[] raw=bytes(manifest.toString());Signature sign=Signature.getInstance("SHA256withRSA");sign.initSign(key.getPrivate());sign.update(raw);byte[] sig=sign.sign();if(tamper)raw=bytes(manifest.put("label","tampered").toString());
  File zip=new File(tmp,name);try(ZipOutputStream out=new ZipOutputStream(new FileOutputStream(zip))){put(out,"manifest.json",raw);put(out,"manifest.sig",sig);put(out,"www/"+path,bytes("const ok=true;"));if(changed)put(out,"www/index.html",bytes("new html"));}return zip;
 }
 static void put(ZipOutputStream out,String name,byte[] data)throws Exception{out.putNextEntry(new ZipEntry(name));out.write(data);out.closeEntry();}
 interface Action{void run()throws Exception;}
 static void rejected(Action action)throws Exception{try{action.run();throw new AssertionError("unexpectedly accepted invalid package");}catch(IOException expected){}}
 static void check(boolean value,String reason){if(!value)throw new AssertionError(reason);}
 public static void main(String[] args)throws Exception{
  tmp=Files.createTempDirectory("float-update-tests").toFile();KeyPairGenerator generator=KeyPairGenerator.getInstance("RSA");generator.initialize(2048);key=generator.generateKeyPair();baseline.put("index.html",bytes("original html"));
  ResourcePackage.Assets assets=relative->{byte[] data=baseline.get(relative);if(data==null)throw new FileNotFoundException(relative);return new ByteArrayInputStream(data);};
  File storeRoot=new File(tmp,"resource-state");File userData=new File(tmp,"chat-records.keep");Files.write(userData.toPath(),bytes("precious history"));
  ResourceStore store=new ResourceStore(storeRoot,5,"app.ii.phone","trusted-baseline",assets,key.getPublic());store.prepareStartup();check(store.activePath()==null,"base startup");
  File valid=pack("valid.zip",5,1,"assets/app.js",false,false,true);store.stage(valid);check(store.activePath()==null,"staging must not change running resources");store.activate("res-1");check(store.getState().getBoolean("pending"),"activation pending");check(new File(store.activePath(),"assets/app.js").exists(),"extracted JS");check(Files.readString(new File(store.activePath(),"index.html").toPath()).equals("new html"),"new html applied");store.markReady("wrong");check(store.getState().getBoolean("pending"),"wrong acknowledgement ignored");store.markReady("res-1");check(!store.getState().getBoolean("pending"),"ready acknowledgement");
  String active=store.activePath();
  rejected(()->store.stage(pack("sequence.zip",5,2,"assets/app.js",false,false,false),3));check(store.activePath().equals(active),"publication/manifest sequence mismatch keeps current resources");rejected(()->store.stage(valid));check(store.activePath().equals(active),"replay must preserve active version");
  rejected(()->store.stage(pack("wrong-build.zip",6,2,"assets/app.js",false,false,false)));
  rejected(()->store.stage(pack("signature.zip",5,2,"assets/app.js",true,false,false)));
  rejected(()->store.stage(pack("hash.zip",5,2,"assets/app.js",false,true,false)));
  rejected(()->store.stage(pack("path.zip",5,2,"../escape.js",false,false,false)));check(!new File(storeRoot,"escape.js").exists(),"zip traversal blocked");
  store.stage(pack("second.zip",5,2,"assets/app.js",false,false,false));store.activate("res-2");store.prepareStartup();check(store.getState().getJSONObject("active").getString("resourceId").equals("res-1"),"unconfirmed restart reverts");
  store.stage(pack("third.zip",5,3,"assets/app.js",false,false,false));store.activate("res-3");check(store.rollbackIfPending("res-3"),"watchdog rollback");check(store.getState().getJSONObject("active").getString("resourceId").equals("res-1"),"watchdog restored prior");
  store.rollback();check(store.activePath()==null,"manual restore bundled");check(Files.readString(userData.toPath()).equals("precious history"),"user data untouched");
  ResourceStore upgraded=new ResourceStore(storeRoot,6,"app.ii.phone","other-baseline",assets,key.getPublic());upgraded.prepareStartup();check(upgraded.activePath()==null,"native upgrade resets bundle");
  System.out.println("PASS: actual Java update verifier and lifecycle: RSA signature, hashes, traversal, build compatibility, replay, stage/activate/ready, crash/timeout/manual rollback, native upgrade, user-data sentinel.");ResourcePackage.deleteTree(tmp);
 }
}
