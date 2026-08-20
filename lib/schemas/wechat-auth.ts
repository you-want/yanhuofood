import { z } from "zod";

export const wechatCodeLoginSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "请输入公众号发送的 6 位数字验证码"),
  returnTo: z.string().trim().max(500).optional(),
});
