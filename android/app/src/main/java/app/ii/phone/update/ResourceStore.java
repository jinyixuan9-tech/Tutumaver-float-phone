package app.ii.phone.update;

import org.json.JSONObject;
import java.io.*;
import java.security.PublicKey;
import java.util.UUID;

/** Resource journal is separate from WebView/IndexedDB data; activation is a pointer swap. */
public final class ResourceStore {
    private final File root;
    private final int build;
    private final String appId, baseDigest;
    private final ResourcePackage.Assets assets;
    private final PublicKey key;
    public ResourceStore(File root, int build, String appId, String baseDigest, ResourcePackage.Assets assets, PublicKey key) throws Exception {
        this.root=root; this.build=build; this.appId=appId; this.baseDigest=baseDigest; this.assets=assets; this.key=key;
        if (!root.isDirectory() && !root.mkdirs()) throw new IOException("无法打开资源更新目录");
    }
    private File stateFile() { return new File(root,"state.json"); }
    private JSONObject readFile(File file) throws Exception { return new JSONObject(new String(ResourcePackage.readLimited(new FileInputStream(file),1024*1024),java.nio.charset.StandardCharsets.UTF_8)); }
    private JSONObject read() {
        try { return readFile(stateFile()); } catch(Exception ignored) {try{return readFile(new File(root,"state.backup.json"));}catch(Exception absent){return new JSONObject();}}
    }
    private void write(JSONObject state) throws Exception {
        File temp=new File(root,"state.next.json");
        try (FileOutputStream out=new FileOutputStream(temp)) { out.write(state.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8)); out.getFD().sync(); }
        if (stateFile().exists()) {
            File backup=new File(root,"state.backup.next.json");
            try (FileInputStream in=new FileInputStream(stateFile()); FileOutputStream out=new FileOutputStream(backup)) { byte[] b=new byte[8192]; int n;while((n=in.read(b))!=-1)out.write(b,0,n);out.getFD().sync(); }
            if (!backup.renameTo(new File(root,"state.backup.json"))) throw new IOException("无法保存资源状态备份");
        }
        if (!temp.renameTo(stateFile())) throw new IOException("无法保存资源更新状态");
    }
    private File directory(String id) throws IOException {
        if (!id.matches("[a-f0-9-]{36}")) throw new IOException("资源目录标识无效");
        return new File(root,"bundles/"+id);
    }
    private boolean exists(String id) {try{return !id.isEmpty() && new File(directory(id),"www/index.html").isFile() && new File(directory(id),"manifest.json").isFile();}catch(Exception error){return false;}}
    private JSONObject descriptor(String id) throws Exception {
        if (id.isEmpty()) return new JSONObject().put("resourceId","bundled").put("label","内置资源").put("sequence",0).put("notes","随 APK 安装的资源");
        JSONObject manifest=readFile(new File(directory(id),"manifest.json"));
        return new JSONObject().put("resourceId",manifest.getString("resourceId")).put("label",manifest.optString("label",manifest.getString("resourceId"))).put("sequence",manifest.getLong("sequence")).put("notes",manifest.optString("notes"));
    }
    private void restore(JSONObject state, String message) throws Exception {
        String previous=state.optString("previous","");
        state.put("active",exists(previous)?previous:"").put("previous","").put("pending",false).put("message",message);write(state);
    }
    public synchronized void prepareStartup() throws Exception {
        JSONObject state=read();
        if (state.optInt("build",-1)!=build) { write(new JSONObject().put("build",build).put("active","").put("previous","").put("staged","").put("pending",false).put("highest",0).put("message",""));prune();return; }
        if (state.optBoolean("pending",false)) restore(state,"上次更新未完成启动，已恢复旧资源。");
        else if (!state.optString("active").isEmpty() && !exists(state.optString("active"))) restore(state,"更新资源不完整，已恢复旧资源。");
        prune();
    }
    public synchronized JSONObject getState() throws Exception {
        JSONObject state=read();JSONObject result=new JSONObject().put("nativeBuild",build).put("highest",state.optLong("highest",0)).put("active",descriptor(state.optString("active",""))).put("pending",state.optBoolean("pending",false)).put("message",state.optString("message","")).put("canRollback",exists(state.optString("previous","")) || !state.optString("active","").isEmpty());
        String staged=state.optString("staged",""); if(exists(staged))result.put("staged",descriptor(staged));return result;
    }
    public synchronized JSONObject stage(File zip) throws Exception {return stage(zip,-1);}
    public synchronized JSONObject stage(File zip,long expectedSequence) throws Exception {
        JSONObject state=read(); if(state.optBoolean("pending",false))throw new IOException("请等待当前资源启动完成后再导入");
        String candidate=UUID.randomUUID().toString();File directory=directory(candidate); File parent=directory.getParentFile();if(!parent.isDirectory()&&!parent.mkdirs())throw new IOException("无法创建资源目录");
        org.json.JSONObject verified=ResourcePackage.extract(zip,directory,assets,key,appId,build,baseDigest,state.optLong("highest",0));
        if(expectedSequence>=0&&verified.getLong("sequence")!=expectedSequence){ResourcePackage.deleteTree(directory);throw new IOException("更新包版本与发布文件名不一致，请联系维护者");}
        state.put("staged",candidate);write(state);prune();return getState();
    }
    public synchronized void activate(String resourceId) throws Exception {
        JSONObject state=read();String staged=state.optString("staged","");if(!exists(staged))throw new IOException("请先导入更新包");
        JSONObject next=descriptor(staged);if(!resourceId.equals(next.getString("resourceId"))||next.getLong("sequence")<=state.optLong("highest",0))throw new IOException("更新预览已变化，请重新导入");
        state.put("previous",state.optString("active","")).put("active",staged).put("staged","").put("pending",true).put("highest",next.getLong("sequence")).put("message","");write(state);
    }
    public synchronized void markReady(String resourceId) throws Exception {
        JSONObject state=read();if(state.optBoolean("pending",false)&&descriptor(state.optString("active","")).getString("resourceId").equals(resourceId)) {state.put("pending",false).put("message","");write(state);prune();}
    }
    public synchronized boolean rollbackIfPending(String resourceId) throws Exception {
        JSONObject state=read();if(!state.optBoolean("pending",false)||!descriptor(state.optString("active","")).getString("resourceId").equals(resourceId))return false;
        restore(state,"更新启动超时，已恢复旧资源。");prune();return true;
    }
    public synchronized void rollback() throws Exception {JSONObject state=read();restore(state,"已恢复上次资源版本。");prune();}
    public synchronized String activePath() throws Exception {String id=read().optString("active","");return exists(id)?new File(directory(id),"www").getAbsolutePath():null;}
    private void prune() {
        try {JSONObject state=read();File[] dirs=new File(root,"bundles").listFiles();if(dirs==null)return;for(File dir:dirs){String id=dir.getName();if(!id.equals(state.optString("active"))&&!id.equals(state.optString("previous"))&&!id.equals(state.optString("staged")))ResourcePackage.deleteTree(dir);}}catch(Exception ignored){}
    }
}
