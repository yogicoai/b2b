import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error(
    'MONGODB_URI 환경변수가 설정되지 않았습니다. ' +
    '로컬: .env.local 파일 / Vercel: Project Settings → Environment Variables에 추가하세요.'
  );
}

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections growing exponentially
 * during API Route usage.
 */
let cached = (global as any).mongoose;

if (!cached) {
  cached = (global as any).mongoose = { conn: null, promise: null };
}

async function dbConnect() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    /* ═══════════════════════════════════════════════════════════════
       ⚠️ 배포 리전과 짝을 맞춰야 한다 — vercel.json 의 "regions": ["icn1"]

       이 DB(Atlas)는 **서울**에 있다.
         ac-b0y2ng4-shard-*.dmz6oro.mongodb.net → 159.143.252.136 (Seoul, KR)

       vercel.json 에 regions 를 안 적으면 Vercel 은 기본값인 미국 동부(iad1)
       에서 돈다. 그러면 요청 하나가 태평양을 두 번 건넌다 —
       브라우저(한국) → 서버(미국) → DB(서울) → 서버(미국) → 브라우저(한국).

       DB 왕복이 한 번에 약 200ms 가 되고(서울 안에서는 실측 48ms),
       화면 하나가 질의를 대여섯 번 하면 그것만으로 1초가 넘는다.
       "로컬은 빠른데 서버만 느리다" 의 정체가 이것이었다.

       vercel.json 은 주석을 못 넣는 형식이라(임의 키를 넣으면 빌드가 실패한다)
       그 이유를 여기 적어 둔다. DB 를 다른 리전으로 옮기면 regions 도 같이 바꿀 것.
       ═══════════════════════════════════════════════════════════════ */

    // ── 서버리스에 맞춘 연결 설정 ──
    //
    // Vercel 은 요청마다 함수가 깨어난다. 한동안 요청이 없으면 통째로 잠들고
    // (콜드 스타트), 그때 DB 연결을 처음부터 다시 맺는다. 기본값 그대로 두면
    // 그 한 번이 몇 초까지 늘어져서 "서버가 로컬보다 느리다" 로 나타난다.
    const opts = {
      bufferCommands: false,

      // 이 앱 전용 DB. 해외 바이어 CRM(vercelData)과 같은 Atlas 클러스터를 쓰더라도
      // DB 는 반드시 갈라야 한다 — 국내 리드와 해외 바이어가 한 컬렉션에 섞이면
      // 발송 대상 산정과 법규(광고 표기·수신거부) 적용이 통째로 꼬인다.
      dbName: process.env.MONGODB_DB || 'yogiboB2b',

      // 함수 하나가 동시에 처리하는 요청은 많아야 몇 개다. 풀을 크게 잡으면
      // 깨어날 때마다 소켓을 그만큼 새로 여느라 콜드 스타트가 길어진다.
      maxPoolSize: 10,
      minPoolSize: 0,

      // 서버를 못 찾을 때 30초(기본값)를 기다리면 화면이 멈춘 것처럼 보인다.
      // 어차피 실패할 것이면 빨리 알려주고 다시 시도하는 편이 낫다.
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
      socketTimeoutMS: 45000,

      // 잠깐 끊겼을 때 드라이버가 알아서 한 번 더 시도한다.
      // 서버리스에서는 소켓이 조용히 끊기는 일이 잦다.
      retryWrites: true,
      retryReads: true,

      // 압축 — 목록 응답이 수백 KB 라 전송량이 준다.
      // zlib 만 쓴다. zstd·snappy 가 더 빠르지만 별도 패키지가 필요하고,
      // 없는 상태로 적어두면 연결 자체가 실패한다 (설치돼 있지 않다).
      compressors: ['zlib'] as any,
    };

    cached.promise = mongoose.connect(MONGODB_URI!, opts).then((mongoose) => {
      return mongoose;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export default dbConnect;
