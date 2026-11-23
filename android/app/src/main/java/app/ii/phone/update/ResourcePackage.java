package app.ii.phone.update;

import org.json.JSONObject;
import java.io.*;
import java.security.*;
import java.util.*;
import java.util.zip.*;

/** Signed, cumulative web resources. Nothing outside the candidate directory is written. */
public final class ResourcePackage {
    public interface Assets { InputStream open(String relative) throws IOException; }
    public static final long MAX_TOTAL = 512L * 1024 * 1024;
    public static final long MAX_FILE = 128L * 1024 * 1024;
    public static final int MAX_FILES = 5000;
    private ResourcePackage() {}

    public static String validPath(String path) throws IOException {
        if (path == null || path.length() == 0 || path.length() > 240 || path.startsWith("/") || path.contains("\\") || path.contains(":") || path.indexOf('\0') >= 0) throw new IOException("更新包文件路径无效");
        for (String part : path.split("/", -1)) if (part.isEmpty() || part.equals(".") || part.equals("..")) throw new IOException("更新包文件路径无效");
        return path;
    }
    public static byte[] readLimited(InputStream stream, long limit) throws IOException {
        try (InputStream in = stream; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[16384]; long count = 0; int n;
            while ((n = in.read(buffer)) != -1) { count += n; if (count > limit) throw new IOException("更新包文件过大"); out.write(buffer, 0, n); }
            return out.toByteArray();
        }
    }
    public static String hex(byte[] value) { StringBuilder out = new StringBuilder(); for (byte b : value) out.append(String.format(java.util.Locale.ROOT,"%02x", b & 255)); return out.toString(); }
    public static void deleteTree(File file) throws IOException {
        if (!file.exists()) return;
        File[] children = file.listFiles(); if (children != null) for (File child : children) deleteTree(child);
        if (!file.delete()) throw new IOException("无法清理旧资源");
    }
    public static JSONObject extract(File zip, File candidate, Assets base, PublicKey key, String appId, int nativeBuild, String baseDigest, long highest) throws Exception {
        if (zip.length() > MAX_TOTAL) throw new IOException("更新包过大");
        if (candidate.exists() || !candidate.mkdirs()) throw new IOException("无法创建更新暂存目录");
        try (ZipFile input = new ZipFile(zip)) {
            Set<String> names = new HashSet<>(); Enumeration<? extends ZipEntry> entries = input.entries(); int count=0;
            while (entries.hasMoreElements()) { ZipEntry e=entries.nextElement(); if (++count > MAX_FILES + 2 || e.isDirectory() || !names.add(e.getName())) throw new IOException("更新包含重复或异常文件"); validPath(e.getName()); }
            ZipEntry manifestEntry=input.getEntry("manifest.json"), sigEntry=input.getEntry("manifest.sig");
            if (manifestEntry == null || sigEntry == null) throw new IOException("这不是可导入的资源更新包，请勿选择源码 ZIP 或 APK");
            byte[] manifestBytes=readLimited(input.getInputStream(manifestEntry), 1024*1024);
            Signature verifier=Signature.getInstance("SHA256withRSA"); verifier.initVerify(key); verifier.update(manifestBytes);
            if (!verifier.verify(readLimited(input.getInputStream(sigEntry),16384))) throw new IOException("更新包签名校验失败");
            JSONObject manifest=new JSONObject(new String(manifestBytes, java.nio.charset.StandardCharsets.UTF_8));
            if (manifest.optInt("schema") != 1 || !appId.equals(manifest.optString("appId"))) throw new IOException("更新包不属于本应用");
            if (manifest.optInt("nativeBuild") != nativeBuild || !baseDigest.equals(manifest.optString("baseDigest"))) throw new IOException("更新包与当前 APK 不兼容，请使用匹配版本");
            if (!manifest.optString("resourceId").matches("[A-Za-z0-9._-]{1,80}") || manifest.optLong("sequence", -1) <= highest) throw new IOException("更新包版本不是新版本，或版本号无效");
            if (manifest.optString("notes").length() > 16000 || manifest.optString("label").length() > 100) throw new IOException("更新说明无效");
            JSONObject files=manifest.getJSONObject("files"); if (files.length() == 0 || files.length() > MAX_FILES || !files.has("index.html")) throw new IOException("更新包缺少启动文件");
            for (String name:names) if (!name.equals("manifest.json") && !name.equals("manifest.sig") && (!name.startsWith("www/") || !files.has(name.substring(4)))) throw new IOException("更新包含未声明文件");
            long total=0; Iterator<String> paths=files.keys(); File www=new File(candidate,"www");
            while (paths.hasNext()) {
                String relative=validPath(paths.next()); String expected=files.getString(relative);
                if (!expected.matches("[a-f0-9]{64}")) throw new IOException("更新包文件校验信息无效");
                File target=new File(www,relative); File parent=target.getParentFile(); if (!parent.isDirectory() && !parent.mkdirs()) throw new IOException("无法创建资源目录");
                ZipEntry entry=input.getEntry("www/"+relative); MessageDigest digest=MessageDigest.getInstance("SHA-256"); long size=0;
                try (InputStream stream=entry == null ? base.open(relative) : input.getInputStream(entry); FileOutputStream output=new FileOutputStream(target)) {
                    byte[] buffer=new byte[32768]; int n;
                    while ((n=stream.read(buffer))!=-1) { size+=n; total+=n; if (size>MAX_FILE || total>MAX_TOTAL) throw new IOException("更新资源解压后过大"); digest.update(buffer,0,n); output.write(buffer,0,n); }
                    output.getFD().sync();
                }
                if (!expected.equals(hex(digest.digest())) || (relative.equals("index.html") && size == 0)) throw new IOException("更新资源校验失败："+relative);
            }
            try (FileOutputStream output=new FileOutputStream(new File(candidate,"manifest.json"))) { output.write(manifestBytes); output.getFD().sync(); }
            return manifest;
        } catch (Exception error) { try {deleteTree(candidate);} catch(IOException ignored){} throw error; }
    }
}
