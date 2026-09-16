/**
 * 발송대기 전체를 미리 승인 상태로 만든다.
 *
 * 왜: 클라이언트에게 410건을 하나씩 "승인하라"고 하면 그것부터가 일이다.
 * 우리가 골라서 넘기고, 클라이언트는 **아닌 것만 빼는** 쪽이 맞다.
 * 기본값이 '보낸다'가 되고, 빼기가 예외가 된다.
 *
 * 되돌리기: readyForOutreach 를 false 로 되돌리면 된다 (preApprovedAt 로 대상 식별).
 */
import mongoose from 'mongoose';
import fs from 'fs';
const APPLY = process.argv.includes('--apply');
const env = fs.readFileSync('.env.local','utf8');
const uri = env.match(/^MONGODB_URI=(.*)$/m)[1].trim().replace(/^["']|["']$/g,'');
await mongoose.connect(uri);
const L = mongoose.connection.db.collection('leads');

const target = { stage:'verified', readyForOutreach:{ $ne:true }, Email:{ $nin:['',null] } };
const n = await L.countDocuments(target);
console.log('미승인 발송대기:', n, '건 → 승인 처리');
const noEmail = await L.countDocuments({ stage:'verified', $or:[{Email:''},{Email:null}] });
if (noEmail) console.log('※ 이메일 없어 제외되는 건:', noEmail);

if (!APPLY) { console.log('[미적용] --apply'); await mongoose.disconnect(); process.exit(0); }
const r = await L.updateMany(target, { $set:{ readyForOutreach:true, preApprovedAt:new Date() } });
console.log('완료 —', r.modifiedCount, '건 승인');
console.log('발송 가능:', await L.countDocuments({stage:'verified', readyForOutreach:true}));
await mongoose.disconnect();
