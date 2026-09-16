/**
 * 크롤링 검색 키워드.
 *
 * 카테고리 정의(src/lib/domain/categories.ts)에 시드 키워드가 들어 있지만,
 * 그건 코드라 쓰는 사람이 못 고친다. 수집이 한 바퀴 돌고 나면 같은 키워드로는
 * 새 업체가 안 나오기 때문에 키워드를 계속 갈아줘야 하고, 그 일을 하는 사람은
 * 개발자가 아니다. 그래서 DB 에 두고 화면에서 추가·중지할 수 있게 한다.
 * DB 에 값이 있으면 그것이 시드보다 우선한다.
 */
import mongoose, { Schema, Document } from 'mongoose';
import { CATEGORY_KEYS } from '@/lib/domain/categories';

export interface IKeyword extends Document {
  category: string;
  keyword: string;
  active: boolean;
  /** 마지막으로 이 키워드로 크롤을 돈 시각 — 오래된 것부터 돌리는 데 쓴다 */
  lastCrawledAt?: Date;
  /** 이 키워드가 지금까지 새로 찾아낸 업체 수 (효율 낮은 키워드 정리용) */
  foundCount: number;
  createdAt: Date;
}

const KeywordSchema = new Schema<IKeyword>({
  category: { type: String, required: true, enum: [...CATEGORY_KEYS] },
  keyword: { type: String, required: true, trim: true },
  active: { type: Boolean, default: true },
  lastCrawledAt: { type: Date },
  foundCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

// 같은 카테고리에 같은 키워드를 두 번 넣지 못하게
KeywordSchema.index({ category: 1, keyword: 1 }, { unique: true });

export const Keyword =
  (mongoose.models.Keyword as mongoose.Model<IKeyword>) ||
  mongoose.model<IKeyword>('Keyword', KeywordSchema);
