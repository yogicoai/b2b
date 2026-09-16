import dbConnect from '@/lib/mongodb';
import {
  MailSettings,
  sanitizeMailSettings,
  ECOUNT_IMAP_HOST,
  ECOUNT_IMAP_PORT,
} from '@/models/MailSettings';
import { encryptSecret, decryptSecret } from '@/lib/crypto';

/**
 * 수신(IMAP) 설정 접근 레이어.
 *
 * emailData/settings.js 의 규약을 그대로 따른다:
 *  - 비밀번호는 빈 값으로 저장하면 **기존 값 유지** (다른 설정만 고치다 지워지는 것 방지)
 *  - 화면으로 나가는 응답에는 비밀번호를 절대 포함하지 않음 (설정 여부 boolean 만)
 *  - 저장 가능한 필드는 화이트리스트로 제한
 *
 * vercelData 차이점: 이카운트 웹메일 전용이라 호스트/포트는 기본값 고정.
 */

const SETTINGS_ID = 'main';

/** 저장 가능한 필드 화이트리스트 — 이 밖의 키는 무시된다 */
const ALLOWED_KEYS = [
  'imapHost', 'imapPort', 'imapSecure', 'imapUser', 'imapPass',
  'imapFolder', 'imapFolders', 'retiredGroups',
  'blockedDomains', 'blockedKeywords', 'systemSenders',
  'fetchLimit',
  'claudeModel', 'autoAnalyze', 'dailyAnalyzeLimit',
  'briefingEmail', 'briefingDays',
  'autoMatchLead', 'autoMoveToReplied',
] as const;

const NUMERIC_KEYS = ['imapPort', 'fetchLimit', 'dailyAnalyzeLimit', 'briefingDays'];
const BOOLEAN_KEYS = ['imapSecure', 'autoAnalyze', 'autoMatchLead', 'autoMoveToReplied'];
const LIST_KEYS = ['imapFolders', 'retiredGroups', 'blockedDomains', 'blockedKeywords', 'systemSenders'];

/** 문자열/배열 어느 쪽으로 와도 배열로 정규화 (줄바꿈·콤마 구분 허용) */
function toList(v: any): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  return String(v || '')
    .split(/[\n,]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** 싱글톤 문서 확보 — 없으면 기본값으로 생성 */
async function ensureDoc() {
  await dbConnect();
  let doc = await MailSettings.findById(SETTINGS_ID);
  if (!doc) {
    doc = await MailSettings.create({
      _id: SETTINGS_ID,
      imapHost: ECOUNT_IMAP_HOST,
      imapPort: ECOUNT_IMAP_PORT,
    });
  }
  return doc;
}

/**
 * 서버 내부용 — 복호화한 IMAP 비밀번호를 포함한 전체 설정.
 * **API 응답에 그대로 넘기지 말 것.** 수집·연결 테스트 코드에서만 사용.
 */
export async function getMailSettings() {
  const doc = await ensureDoc();
  const obj = doc.toObject() as any;

  let imapPass = '';
  if (obj.imapPassEnc) {
    try {
      imapPass = decryptSecret(obj.imapPassEnc);
    } catch {
      // 키가 바뀌었거나 저장 형식이 깨진 경우 — 빈 값으로 두어
      // "비밀번호 재입력 필요" 로 흘러가게 한다 (여기서 throw 하면 화면이 통째로 죽는다)
      imapPass = '';
    }
  }

  // env 는 최초 세팅 편의를 위한 fallback 일 뿐, DB 값이 항상 우선한다
  return {
    ...obj,
    imapHost: obj.imapHost || process.env.IMAP_HOST || ECOUNT_IMAP_HOST,
    imapUser: obj.imapUser || process.env.IMAP_USER || '',
    imapPass: imapPass || process.env.IMAP_PASS || '',
  };
}

/** 화면 전달용 — 비밀번호는 설정 여부(boolean)로만 */
export async function getPublicMailSettings() {
  const doc = await ensureDoc();
  return sanitizeMailSettings(doc);
}

/**
 * 설정 저장. 화이트리스트 밖의 키는 무시한다.
 * `imapPass` 가 빈 값이면 기존 비밀번호를 그대로 둔다.
 */
export async function saveMailSettings(patch: Record<string, any> = {}) {
  const doc = await ensureDoc();
  const update: Record<string, any> = {};

  for (const k of ALLOWED_KEYS) {
    if (!(k in patch)) continue;
    let v = patch[k];

    if (k === 'imapPass') {
      // 빈 비밀번호 = "변경 없음" — 기존 값을 지우지 않는다
      if (!v) continue;
      update.imapPassEnc = encryptSecret(String(v));
      continue;
    }

    if (NUMERIC_KEYS.includes(k)) v = Number(v) || (doc as any)[k];
    else if (BOOLEAN_KEYS.includes(k)) v = Boolean(v);
    else if (LIST_KEYS.includes(k)) v = toList(v);
    else v = String(v ?? '').trim();

    update[k] = v;
  }

  if (Object.keys(update).length === 0) return getPublicMailSettings();

  await MailSettings.updateOne({ _id: SETTINGS_ID }, { $set: update });
  return getPublicMailSettings();
}

/**
 * 수집 대상 폴더 목록.
 * imapFolders 가 비어 있으면 INBOX 만 수집되어 거래처 폴더로 들어온 새 메일을 놓친다
 * — emailData 에서 실제로 발생했던 문제라 여기서 명시적으로 합쳐 돌려준다.
 */
export function foldersOf(settings: { imapFolder?: string; imapFolders?: string[] }): string[] {
  const primary = settings.imapFolder || 'INBOX';
  const extra = settings.imapFolders || [];
  return [...new Set([primary, ...extra])].filter(Boolean);
}

/** IMAP 접속에 필요한 최소 정보가 채워졌는지 */
export function isImapConfigured(settings: { imapHost?: string; imapUser?: string; imapPass?: string }): boolean {
  return Boolean(settings.imapHost && settings.imapUser && settings.imapPass);
}
