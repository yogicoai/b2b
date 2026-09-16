import mongoose from 'mongoose';
import { config } from 'dotenv';
config({path:'.env.local',quiet:true});
await mongoose.connect(process.env.MONGODB_URI);
const M=mongoose.connection.collection('inboundmails');
console.log('AI 분석 완료 :', await M.countDocuments({trashedAt:null,'analysis.summary':{$exists:true,$ne:''}}));
console.log('한글 번역 있음:', await M.countDocuments({trashedAt:null,'translation.body':{$exists:true,$ne:''}}));
console.log('기한 잡힌 메일:', await M.countDocuments({trashedAt:null,'analysis.deadline':{$ne:null,$exists:true}}));
console.log('회신 필요 표시:', await M.countDocuments({trashedAt:null,'analysis.needsReply':true}));
const one=await M.findOne({trashedAt:null,'analysis.summary':{$exists:true,$ne:''}},{projection:{subject:1,analysis:1}});
if(one){console.log('\n예시 —',String(one.subject).slice(0,50));console.log('  요약:',String(one.analysis.summary).slice(0,120));console.log('  핵심:',(one.analysis.keyPoints||[]).slice(0,3).join(' / ').slice(0,140));}
await mongoose.disconnect();
