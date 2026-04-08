const formatUuid = (bytes: Uint8Array): string => {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));

  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
};

const createUuidWithRandomBytes = (
  fillRandomBytes: (bytes: Uint8Array) => Uint8Array,
): string => {
  const bytes = fillRandomBytes(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return formatUuid(bytes);
};

const createUuidFromMathRandom = (): string => {
  return createUuidWithRandomBytes((bytes) => {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }

    return bytes;
  });
};

/**
 * 生成兼容非安全上下文的 UUID v4；优先使用 Web Crypto，缺失 randomUUID 时自动降级。
 * @returns RFC 4122 风格的随机 UUID 字符串；极端环境下退化为 Math.random 兜底实现。
 */
export const generateUuid = (): string => {
  const cryptoObject = globalThis.crypto;

  if (typeof cryptoObject?.randomUUID === "function") {
    return cryptoObject.randomUUID();
  }

  if (typeof cryptoObject?.getRandomValues === "function") {
    return createUuidWithRandomBytes((bytes) =>
      cryptoObject.getRandomValues(bytes),
    );
  }

  return createUuidFromMathRandom();
};