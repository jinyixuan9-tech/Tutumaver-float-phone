import { NextResponse } from "next/server";

// Retire the old built-in translator while allowing overwrite packages to remove its credentials.
export async function POST() {
  return NextResponse.json({ message: "Theqoo 翻译已改用配置绑定中的翻译 API，请刷新页面后重试。" }, { status: 410, headers: { "Cache-Control": "no-store" } });
}
