import crypto from 'crypto';

/**
 * 민감 자격증명 (SMTP 비밀번호 등) 저장용 AES-256-GCM 암호화.
 *
 * 키 파생: JWT_SECRET 을 sha256 해서 32바이트 키 사용
 *   → env 하나만 관리하면 됨. 다만 JWT_SECRET 유출 시 재발급 필요.
 *
 * 포맷: iv(hex) : authTag(hex) : ciphertext(hex)
 *   예: "5f8a...:9c1e...:aabbcc..."
 *
 * 절대 로그/응답에 포함 X.
 */

const ALGO = 'aes-256-gcm';

function getKey(): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET 미설정 — 암호화 키 파생 불가');
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptSecret(plaintext: string): string {
  if (!plaintext) return '';
  const key = getKey();
  const iv = crypto.randomBytes(12);   // GCM 권장 12바이트
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSecret(payload: string): string {
  if (!payload) return '';
  const parts = payload.split(':');
  if (parts.length !== 3) throw new Error('잘못된 암호화 페이로드 형식');
  const [ivHex, tagHex, ctHex] = parts;
  const key = getKey();
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const ciphertext = Buffer.from(ctHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * API 응답에 안전한 형태로 계정 정보 반환 (비번 필드 제거).
 */
export function sanitizeMailAccount(acc: any): any {
  if (!acc) return null;
  const { smtpPassEnc, __v, ...rest } = acc.toObject ? acc.toObject() : acc;
  return { ...rest, hasPassword: !!smtpPassEnc };
}
