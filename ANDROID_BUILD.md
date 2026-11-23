# Android 构建

分享版不提供任何私人签名密钥、签名密码或旧版签名证书备份。

- 调试构建：安装 Node、JDK 17 和 Android SDK，运行 `npm ci`，再运行 `npm run android:apk -- --debug`。
- 正式构建：使用自己的密钥，在本机将 `android/signing.properties.example` 复制为 `android/signing.properties` 并填写配置，运行 `npm run android:apk`。密钥建议存放在仓库目录外。
- 资源热更新：必须使用与目标 APK 相同的签名证书，向 `scripts/build-resource-update.py` 显式传入 `--expected-cert-sha256`，不使用其他版本的签名。
- 不同签名的 APK 无法直接覆盖安装。请提前备份本机数据。
- 新分享版的公开更新服务尚未发布；不能使用私人版的更新源。

具体 App 使用方法在功能定稿后另写。
