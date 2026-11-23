"use client";
import { Capacitor } from "@capacitor/core";
import { downloadFile } from "./download-utils";
import { saveChatScreenshot } from "./chat-screenshot-actions";

function fileName(name: string, mime: string): string {
  const safe = (name.trim() || "Float照片").replace(/[\\/:*?"<>|]/g, "-").slice(0, 64);
  const extension = mime === "image/jpeg" ? ".jpg" : mime === "image/webp" ? ".webp" : ".png";
  return /\.(png|jpe?g|webp)$/i.test(safe) ? safe : safe + extension;
}
async function pngForNativeGallery(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png") return blob;
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前设备不支持图片保存转换");
    context.drawImage(bitmap, 0, 0);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(output => output ? resolve(output) : reject(new Error("图片转换失败")), "image/png"));
  } finally { bitmap.close(); }
}
/** Android uses the already-installed native Gallery plugin; iOS uses the system share sheet. */
export async function saveLibraryImageToDevice(imageUrl: string, name: string): Promise<string> {
  if (!imageUrl) throw new Error("照片尚未加载完成");
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error("无法读取照片文件");
  const blob = await response.blob();
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
    return saveChatScreenshot(await pngForNativeGallery(blob));
  }
  await downloadFile(blob, fileName(name, blob.type));
  return Capacitor.getPlatform() === "ios" ? "请在系统分享菜单选择‘存储图像’" : "已发起图片保存";
}
