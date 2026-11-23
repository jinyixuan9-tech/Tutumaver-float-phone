// 个人云离线推送部署状态
import { kvGet, kvSet } from "./kv-db";

const PUSH_SCHEDULED_KEY = "ai_phone_push_cloud_scheduled_v1";

export function savePushCloudScheduled(on: boolean): void {
    kvSet(PUSH_SCHEDULED_KEY, on ? "1" : "0");
}

/** 部署脚本默认就带定时任务，所以缺省视为开。 */
export function loadPushCloudScheduled(): boolean {
    return kvGet(PUSH_SCHEDULED_KEY) !== "0";
}
