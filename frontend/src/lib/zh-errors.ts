/** Plain-Chinese versions of the error messages the backend returns in English. */
const MESSAGES: Array<[RegExp, string]> = [
  [/invalid email or password/i, "邮箱或密码错误"],
  [/user account is disabled/i, "该账号已被停用"],
  [/email already registered/i, "该邮箱已经注册过了"],
  [/invalid or expired (refresh )?token/i, "登录已过期，请重新登录"],
  [/not authenticated|could not validate/i, "请先登录"],
  [/admin privileges required|role .* required/i, "此操作需要管理员权限"],
  [/not found/i, "没有找到对应的内容"],
  [/too large|exceeds/i, "文件太大"],
  [/unsupported/i, "不支持这种文件格式"],
  [/validation|string should have at least|value is not a valid/i, "填写的内容不符合要求，请检查后重试"],
];

export function zhError(message: string | undefined | null, fallback = "操作失败，请重试"): string {
  if (!message) return fallback;
  if (/[一-鿿]/.test(message)) return message;
  return MESSAGES.find(([pattern]) => pattern.test(message))?.[1] ?? fallback;
}
