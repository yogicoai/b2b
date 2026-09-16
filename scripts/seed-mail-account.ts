/**
 * .env.local 의 SMTP 값으로 발송 계정을 하나 등록한다.
 *
 * 새로 깐 앱에는 등록된 메일 계정이 없어서 발송 화면이 "대표 계정이 없습니다" 로
 * 막힌다. 화면([📬 메일 계정 관리])에서 손으로 넣어도 되지만, 어차피 .env.local 에
 * 같은 값이 있으므로 처음 한 번은 여기서 넣는다.
 *
 * 보내는 주소를 바꾸려면 앱 화면에서 고치는 것이 맞다 — 여기는 시작점만 만든다.
 *
 * 사용: npx ts-node -P tsconfig.scripts.json scripts/seed-mail-account.ts
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { MailAccount } from '../src/models/MailAccount';
import { encryptSecret } from '../src/lib/crypto';

dotenv.config({ path: '.env.local' });

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI 없음');

  const owner = process.env.ADMIN_ID || 'admin';
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  if (!smtpUser || !smtpPass) throw new Error('SMTP_USER / SMTP_PASS 가 .env.local 에 없습니다.');

  await mongoose.connect(uri);

  const fromAddress = process.env.MAIL_FROM_ADDRESS || smtpUser;
  const existing = await MailAccount.findOne({ owner, smtpUser });

  if (existing) {
    console.log(`이미 있습니다: ${existing.accountName} <${existing.fromAddress}>`);
    await mongoose.disconnect();
    return;
  }

  const acc = await MailAccount.create({
    owner,
    accountName: 'B2B 발송',
    smtpHost: process.env.SMTP_HOST,
    smtpPort: parseInt(process.env.SMTP_PORT || '465', 10),
    smtpSecure: process.env.SMTP_SECURE !== 'false',
    smtpUser,
    smtpPassEnc: encryptSecret(smtpPass),
    fromName: process.env.MAIL_FROM_NAME || '요기보',
    fromAddress,
    senderCompany: process.env.COMPANY_NAME || '주식회사 요기보',
    senderPhone: process.env.COMPANY_TEL || '',
    senderAddress: process.env.COMPANY_ADDR || '',
    isDefault: true,
    isActive: true,
  });

  console.log(`등록: ${acc.accountName} <${acc.fromAddress}> (대표 계정)`);
  console.log('보내는 주소를 바꾸려면 앱의 [📬 메일 계정 관리] 에서 고치세요.');
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error('실패:', e.message);
  process.exit(1);
});
